# Habi persistence design

This document describes the persistence code that exists in the ground-up Habi application. It does not assert that Atlas has been provisioned or that production data has been migrated.

## Boundaries

- The Vercel server is the only Habi application component permitted to hold the Atlas URI.
- The browser receives server-built DTOs. The Mac AI worker receives only its future outbound API credentials and approved job payloads; it will not receive an Atlas credential.
- Database access is server-only. The generic persistence adapters in this version are not yet connected to authenticated business routes.
- The old Habi app and its database are not migration sources for this build. Any future legacy data migration needs an explicit source inventory, consent/retention review, reversible export plan and separately approved execution.

## Contract and validators

`contracts/domain-schemas.source.json` is the pinned runtime copy of the canonical Calvus Habi schema contract. `contracts/source-manifest.json` records its repository path, source commit and SHA-256. `tests/contracts-snapshot.test.mjs` fails if the artifact and digest diverge or if a persisted collection has no entity mapping.

Ajv 2020 validates the complete document schema, including nested `$ref`s, strict properties, enum values and date-time formats. The MongoDB collection validator is generated from that same entity schema and rejects invalid top-level/nested shape and types before a write. The API/service layer must call `validateContractDocument(collection, document)` before every insert/replace; Mongo validation is a second boundary, not authorization. A missing tenant or role check cannot be repaired by schema validation.

MongoDB TTL indexes require BSON `Date` values. `sessions.expiresAt` and `idempotency.expiresAt` therefore use `Date` in storage; DTO adapters must convert them to ISO 8601 strings before applying the public contract.

## Versioned migration

`001-initial-schema.mjs` creates the 36 contract collections. `002-auth-transactions.mjs` adds the internal `auth_transactions` collection for short-lived login state; it has a unique state-hash index, one-active-transaction-per-browser partial unique index and ten-minute TTL. `003-session-sso-credentials.mjs` adds `session_sso_credentials`, with a unique session index, strict token envelope validator, and TTL at session expiry. Access and refresh token envelopes use AES-256-GCM, unique IVs, key material derived with HKDF, and AAD scoped to issuer/client/actor/session/token-purpose. Session IDs are server-generated random hex values. The internal credential collection stays outside public product DTOs and the pinned business-schema source. `runMigrations()` records each applied ID and source-file SHA-256 in `_habi_migrations`; a changed applied migration requires a new forward-only ID.

The runner re-applies schema/index setup if the migration did not reach its ledger write. DDL operations are deliberately idempotent. There is no automatic down migration. If an index or validator change causes an incident, stop writes if needed, preserve the failing database state and logs, then apply a reviewed forward migration or restore a verified Atlas backup. Do not delete the migration ledger to force a blind replay.

Refresh coordination takes an expiring lease using the credential revision and session ID. The outbound SSO refresh call occurs outside a Mongo transaction. On success, both encrypted token envelopes, access-token expiry, lease release and revision increment commit in one conditional update matching the lease ID and prior revision. Competing requests wait briefly and reuse the newly stored encrypted access token. A permanent SSO refresh rejection revokes the credential; a dependency failure releases the lease for a later retry. A process crash after the identity provider rotates its refresh token but before Mongo persists the response is an unavoidable remote/local dual-write window; the credential fails closed and the user must authenticate again if the old refresh token is no longer accepted.

The current CLI is test-only. It requires all of:

```sh
HG_ENVIRONMENT=test
HG_MIGRATION_ALLOW_LOCAL_TEST_DB=true
HG_ATLAS_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs
HG_ATLAS_DATABASE=habi_local_test
```

It rejects non-test environment labels, non-loopback hosts and database names without the `_test` suffix. It does not pull Vercel secrets, contact Atlas, deploy migrations from a Vercel function or provision credentials. A production migration command needs a distinct reviewed operational path with an isolated migration principal, backup proof, deployment ordering, timeout policy and restore/forward procedure.

## Synthetic seed

`applySyntheticSeed()` inserts two tenants and one synthetic player per tenant using stable IDs, fixed document timestamps and `$setOnInsert`. The same player ID exists in both tenants with different synthetic time zones so a cross-tenant lookup can prove that `tenantId` is part of the query. A rerun inserts zero additional documents. The seed has no SSO identity, email, consent evidence or personal data, and the CLI refuses any non-local `_test` target.

## Tenant reads and revisions

`findTenantDocument(collection, tenantId, id)` always emits both tenant and document IDs. Missing scope throws `TENANT_SCOPE_REQUIRED`. `listTenantDocuments()` forces the caller scope onto the Mongo query and rejects a contradictory tenant filter. The database also has unique `(tenantId,id)` indexes on the scoped collections.

`compareAndSwapDocument()` updates only `{tenantId,id,revision:expectedRevision}` and increments revision atomically. A zero-match update throws `REVISION_CONFLICT`; no last-write-wins retry occurs. General changes cannot override `_id`, `id`, `tenantId`, `schemaVersion`, `revision` or `createdAt`. Callers must read the newly authorized revision and let a user resolve a conflict.

## Transaction and idempotency protocol

`runIdempotentCommand()` runs a database-only callback and the idempotency receipt inside one replica-set transaction:

1. Calculate a stable SHA-256 over the canonical JSON request body.
2. Look up `(tenantId, actorOrClientId, method, path, key)` in the unique scope index.
3. For an unexpired receipt, replay the original status and resource reference if the body hash matches; a changed body returns `IDEMPOTENCY_CONFLICT`.
4. For an expired receipt, delete it in the transaction even if MongoDB's background TTL monitor has not deleted it yet.
5. Execute the business DB mutations, write the receipt with a 24-hour BSON-Date expiry, then commit with `readConcern: snapshot` and `writeConcern: majority`.

The database-only callback must not send an email, call Ollama, call SSO, upload to another service or perform any effect outside the transaction; MongoDB can retry a transaction callback. A client timeout after a successful commit is recovered by repeating the same request and key. The receipt stores the resource reference and response status, not a stale privileged response body; the route must re-authorize before returning current data.

## Authentication transaction storage

`src/lib/auth/login-transaction.mjs` creates cryptographically random state, nonce, PKCE verifier, and browser-binding values. Only the SHA-256 hashes of state and browser binding are indexed; nonce and verifier are held server-side in `auth_transactions`. The browser binding is intended for the `__Host-hg_auth_txn` Secure/HttpOnly/SameSite=Lax cookie. A new login for the same binding atomically consumes its previous pending transaction before inserting a replacement. Callback consumption is a single `findOneAndUpdate` constrained by both hashes, `consumedAt: null`, and `expiresAt > now`, so replay, wrong-browser use, and expiry fail closed. `returnTo` is restricted to same-origin relative paths.

`src/lib/auth/sso-oidc.mjs` supplies testable OIDC protocol functions: HTTPS issuer discovery pinned to its origin, JSON authorization-code exchange (`client_secret_post`), RS256/JWKS claim verification (`iss`, `aud`, `azp`, `exp`, `iat`, `nonce`), userinfo, and approved app-permission checks. Each HTTP dependency request is no-store and has a five-second timeout. `verifyIdTokenWithKeyRefresh` refreshes JWKS once only when a well-formed RS256 token references an unknown signing `kid`; malformed tokens do not trigger a fetch and a missing key after refresh is rejected. These functions are not yet wired into a hosted route.

`src/lib/auth/session.mjs` generates 256-bit opaque session tokens and stores only a purpose-separated HMAC-SHA256 token hash. Session IDs are 24 random bytes encoded as hex to always satisfy the shared identifier schema. It derives an HMAC CSRF token bound to that browser session and implements request-time absolute expiry (eight hours), idle expiry (30 minutes), atomic idle touch, and revocation. No SSO access/refresh token is persisted. Local Mongo behavior and crypto checks are tested, but no hosted session issuance or request authorization middleware exists.

`src/lib/auth/identity-access.mjs` resolves an external identity strictly by `(issuer, subject)`, requires the matching active local actor, and returns only active nonexpired memberships whose tenant and player links still resolve within the same tenant. It never joins identities by email or trusts the SSO app role as a Habi role. This resolver is unit-tested with revoked/suspended, expired, cross-tenant and missing-identity cases; it is not yet used by an HTTP route.

## Index intent

| Collection        | Index purpose                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `identities`      | Unique `(issuer,subject)` identity binding                                                       |
| `auth_transactions` | Internal login state: unique state hash, one live transaction per browser binding, ten-minute TTL |
| `sessions`        | Unique purpose-separated HMAC token hash and absolute-expiry TTL                                  |
| `memberships`     | Active membership uniqueness and tenant/player access lookup                                     |
| `players`         | Tenant-scoped ID uniqueness                                                                      |
| `records`         | Tenant-scoped ID, stable player timeline, and per-session metric uniqueness for check-in answers |
| `events`          | Player timeline order and process order                                                          |
| `jobs`            | Tenant-scoped job identity and bounded due-job claim order                                       |
| `idempotency`     | Unique request scope and TTL cleanup                                                             |
| `audit`           | Tenant/time audit traversal                                                                      |
| `deletion_ledger` | Unique tenant subject deletion control                                                           |

Mongo TTL removal is asynchronous and is not authorization. Expired sessions must be rejected by request-time expiry checks; expired idempotency receipts are checked and removed in the transaction path. The current Habi schema does not define `Job.logicalKey`, so no such index is created; a future logical-job deduplication field needs a versioned contract change before index creation.

## API request correlation and safe failure logs

`src/lib/api/route-boundary.mjs` creates a cryptographically random 128-bit request ID for each request handled by `/api/health` and `/api/ready`, returns it in `X-Request-ID`, and uses the same ID in the public error body and safe server event. Expected readiness `5xx` responses and unexpected exceptions generate JSON log events containing only a fixed operation label, request ID, HTTP status, and allow-listed error code where applicable. The request URL/body, exception text/stack, database error, URI, and credentials are excluded. A logging failure cannot replace the API result. Next.js request-time prerender control signals pass through the boundary so the framework can preserve dynamic route behavior. The wrapper is not yet installed on future business API routes; they must adopt the same boundary before release.

## Failures and recovery

- Missing or invalid Atlas config: fail closed with a generic dependency/configuration code; never include URI or provider error text in HTTP output.
- Transaction unsupported (standalone MongoDB), primary change or transaction timeout: abort the business commit; client receives a retryable dependency error, and same-key retry decides whether a commit receipt exists.
- Revision mismatch: return a conflict and require a fresh read; never overwrite.
- Migration checksum mismatch: stop before running the changed migration; create a new migration ID and review the forward change.
- Contract validation failure: reject before mutation and record a safe internal error code without sensitive request content.
- Local test process interruption: rerun the same migration/seed against the same disposable `_test` database; migrations are idempotent and seed uses `$setOnInsert`.
- Production recovery: not yet implemented or tested. Do not infer Atlas restore readiness from the local replica-set tests.

## Verification scope

The local replica-set integration tests exercise migration repeatability/checksum, schema enforcement, duplicate seed, tenant isolation, competing revisions, repeated same-key calls, concurrent same-key calls, body-hash conflicts and expiry before the asynchronous TTL sweep. They run only when `HABI_TEST_MONGODB_URI` is explicitly set. They prove MongoDB 8.0.24 single-node replica-set behavior on this workstation; they are not Atlas, production failover, backup/restore, API authorization or browser-to-worker evidence.
