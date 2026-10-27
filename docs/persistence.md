# Habi persistence design

This document describes the persistence code that exists in the ground-up Habi application. It does not assert that Atlas has been provisioned or that production data has been migrated.

## Boundaries

- The Vercel server is the only Habi application component permitted to hold the Atlas URI.
- The browser receives server-built DTOs. The Mac AI worker receives only its future outbound API credentials and approved job payloads; it will not receive an Atlas credential.
- Database access is server-only. The signed-in workspace, roster, timeline and worker routes use scoped server-side workflows and allow-listed DTOs. Additional workflow slices still require their own end-to-end acceptance evidence.
- The old Habi app and its database are not migration sources for this build. Any future legacy data migration needs an explicit source inventory, consent/retention review, reversible export plan and separately approved execution.

## Contract and validators

## Current local workflow implementation · 2026-10-25

`src/lib/api/runtime-route.ts` opens the shared Mongo client, authenticates the active session, and passes only the scoped principal into a workflow. The local synthetic role workflow covers check-in, observations and publication, timeline, materials, plans and follow-up, parent question/worker/review, PDF upload and scan, manual extraction/review, and access denial. Worker endpoints use a separate Habi bearer service identity and current lease/fence; they never expose the Atlas URI. Every route uses the redacted request boundary. Local synthetic sessions and worker tokens are conditional on localhost test configuration.

`POST /api/v1/me/scope` changes the current session to an already-active membership for the same actor and tenant. The body names the membership and its exact player scope; the server rechecks both, verifies the player belongs to that tenant (and, for `player`, to the actor), then updates `activeRole`, `playerId` and `retentionPolicyId` in the same transaction as the idempotency receipt. It does not accept a role or tenant from the browser, create a membership, or rotate the SSO/session cookie. The UI reloads the role-specific roster and clears data from the previous view. A new membership still requires an admin-issued invitation claimed with the verified identity.

`POST /api/identity/activate-role` starts a role workspace from the verified SSO owner session when the identity already has a claimed active membership but no active Habi session. The request contains only `membershipId`; the server resolves issuer+subject to the actor, checks the active tenant and membership, validates the linked player scope, and issues an HttpOnly role session. It cannot create a membership or accept a client-selected role, actor, tenant or player. The admin landing page uses this endpoint from an explicit button on each assigned role card. A new membership still requires an admin-issued invitation claimed with the verified identity.

The check-in workflow writes answers as separate immutable records and commits an immutable `CheckinResult` snapshot with its session revision. Replays use a body-bound 24-hour idempotency receipt. Parent and coach reads use the authenticated active player/tenant scope. Observation records store `recordedBy`, `source`, and `sharingClass` independently. Player direct and parent shared records follow the policy; a coach record becomes visible to a parent only when a coach publishes that exact record revision. Listing returns only the read DTO, uses an HMAC-signed 30-minute cursor bound to tenant, player, access revision and snapshot time, and applies a role visibility filter before pagination.

`004-checkin-result-session-revision.mjs` adds and backfills the immutable result-to-session revision. It fails closed when a result refers to a missing session. The local `test:workflow:local` script drops only the explicitly configured localhost `_test` database, reapplies forward migrations, seeds two synthetic tenants and six synthetic identities, then runs the HTTP/API/DB workflow. It is repeatable and does not connect to Atlas or Vercel. It is not a backup/restore or production migration test.

`contracts/domain-schemas.source.json` is the versioned Habi-local schema contract snapshot used by runtime validation. `contracts/source-manifest.json` records provenance and SHA-256 integrity; build and runtime do not fetch another repository. `tests/contracts-snapshot.test.mjs` fails if the artifact and digest diverge or if a persisted collection has no entity mapping.

Migration `012-player-display-names` adds an optional, admin-supplied `displayName` to player records and role invitations. It updates only the strict Mongo validators; existing player records remain unchanged. Newly claimed player invitations persist the supplied name. Names are not inferred from SSO identity data.

The role workflows use transactional idempotent proposal writes, revision-checked parent/player acceptance and coach state changes; follow-up records bind to exact plan revisions and action IDs. Interpretation requests persist question, turn and queued job together. A coach may submit an empty `sourceRefs` list to request player-wide context; the server resolves at most the 20 most recent eligible sources scoped to that tenant and player, and persists the exact revisions on the turn/job. Eligible context includes records, completed check-ins and assessments, monthly reflections, plans, follow-ups, ready reports, verified extractions, and current ready interpretations. Pending/rejected extractions, restricted reports, and stale/unapproved interpretations are excluded. Parents remain limited to explicit sources visible under parent-sharing rules. Worker claims use a server-secret-derived token, hashed lease credential, fencing and a persisted idempotency key. Retry delay is bounded at five minutes; transient dependency/network failures return to queued indefinitely rather than becoming a false user-facing failure. Context reads re-check requester membership and exact source revisions, including tenant-wide coach memberships against the job's target player. The local worker heartbeats, defers dependency failures, returns source-bounded results and places generated claims into coach review. PDF uploads use bounded chunks and hashes, enter GridFS quarantine, and are not downloadable until the worker records a clean ClamAV verdict. Manual extraction forces fields to pending review. Coaches can upload a report for a selected tenant player, enter field name/page/original value/unit, and approve the reviewed fields. Coach materials are immutable versions and parent visibility requires publication of the exact version. These flows are covered by the local synthetic HTTP/worker acceptance; hosted production behavior remains a separate deployment verification.

Ajv 2020 validates the complete document schema, including nested `$ref`s, strict properties, enum values and date-time formats. The MongoDB collection validator is generated from that same entity schema and rejects invalid top-level/nested shape and types before a write. The API/service layer must call `validateContractDocument(collection, document)` before every insert/replace; Mongo validation is a second boundary, not authorization. A missing tenant or role check cannot be repaired by schema validation.

MongoDB TTL indexes require BSON `Date` values. `sessions.expiresAt` and `idempotency.expiresAt` therefore use `Date` in storage; DTO adapters must convert them to ISO 8601 strings before applying the public contract.

## Versioned migration

`001-initial-schema.mjs` creates the contract collections. `002-auth-transactions.mjs` adds the internal `auth_transactions` collection for short-lived login state; it has a unique state-hash index, one-active-transaction-per-browser partial unique index and ten-minute TTL. `003-session-sso-credentials.mjs` adds `session_sso_credentials`, with a unique session index, strict token envelope validator, and TTL at session expiry. Access and refresh token envelopes use AES-256-GCM, unique IVs, key material derived with HKDF, and AAD scoped to issuer/client/actor/session/token-purpose. Session IDs are server-generated random hex values. `004-checkin-result-session-revision.mjs` backfills the immutable result/session revision binding. `005-interpretation-reviews.mjs` adds strict coach-review history; `006-coach-materials.mjs` adds materials; `007-publication-uniqueness.mjs` constrains active publications; `008-upload-chunks.mjs` adds bounded upload chunks; and `009-worker-claim-idempotency.mjs` backfills claim receipt fields and adds the unique claim index. The internal credential collection stays outside public product DTOs and the pinned business-schema source. `runMigrations()` records each applied ID and source-file SHA-256 in `_habi_migrations`; a changed applied migration requires a new forward-only ID.

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

### SSO browser MVP owner mapping

The SSO-only browser MVP adds the login transaction, owner-link, owner-session, and single-use legacy handoff collections through migration `010-sso-browser-owner-sessions.mjs`. It does not migrate or rewrite `habi_states`. An owner link stores a keyed hash of `(issuer, subject)`, the existing legacy owner hash, the link method, and timestamp; no email, provider token, raw subject, or cookie value is persisted. A unique owner-hash index prevents a legacy browser owner from being claimed by multiple SSO identities. Link creation happens only after state/browser-binding validation, ID token signature and claims, userinfo subject match, and approved app permission. A normal SSO login without the old cookie creates a new owner hash and does not discover records by email.

Sessions persist only a random opaque token's keyed hash, identity hash, owner hash, creation/last-seen/expiry and revocation times. The cookie is Secure, HttpOnly, SameSite=Lax and host-only. Request-time checks enforce eight-hour absolute and thirty-minute idle expiry; the TTL index is cleanup only. Logout revokes server state and clears both current and legacy cookies. Migration 010 has been applied to the existing Production `habi` database. The application documents the checksum in `_habi_migrations`; it did not rewrite `habi_states` or other user records.

A korábbi cross-host owner-handoff implementáció történeti kód; nincs része az új belépési folyamatnak. A jelenlegi `sso-browser` route-boundary a handoff-végpontokat fail-closed módon tiltja, és a callback egy tiszta SSO identity owner-scope-ot hoz létre. A régi `habi_states` rekordok nem kapcsolódnak és nem migrálódnak.

The selected redirect URI is `https://habigoal.com/api/oauth/callback`. The current Vercel domain state assigns `habigoal.com` and `www.habigoal.com` to the Habi project, with `www` redirecting to the apex. The login transaction cookie is host-only, so login and callback must both use the apex origin. Real callback validation is recorded separately in `docs/verification.md`. Legacy handoff remains historical and is not part of the new user-facing product path.

### Role invitations and verified identity claim

Migration `011-role-invitations` re-applies the strict SSO owner-session validator to accept the verified issuer, subject and app-permission snapshot, then creates `habi_role_invitations` with a strict schema, unique invitation ID/token-hash indexes and an expiry TTL index. Invitation URLs contain a 256-bit random token; only its purpose-separated HMAC digest is persisted. Invitations expire after seven days and can be claimed only once by an exact verified SSO identity. Email is never used as an identity join key.

Migration `013-role-requests` creates `habi_role_requests` with strict validation and a partial unique index for one pending request per tenant, actor and requested role. A request is created only from the current SSO session, uses the verified issuer/subject identity link, and stores the requester's display name, selected role, status and policy reference. The SSO owner session may carry the verified SSO display name for the session lifetime. Admin-issued invitations created from this queue are bound to the request's identity hash; the invite claim endpoint rejects any different SSO identity. The migration also refreshes the versioned owner-session and invitation validators additively.

Migration `016-sso-owner-session-display-name` repairs the owner-session validator for databases that applied migration 010 before the optional verified display name was added. The SSO callback applies 016 before inserting a session. It changes only collection validation rules; it does not rewrite or delete existing records. Keep applied migration checksums immutable and use a new forward migration for future validator changes.

Accepting a player invitation asks only for the invite token. The server sets the required player date-zone field to the product default `Europe/Budapest`; the invitee is not asked to enter an IANA value. The player may use the device's current timezone for individual check-in dates.

The claim route validates same-origin JSON, reads the still-active invitation and tenant, then uses one Mongo transaction to claim the invitation, create or resolve the exact `(issuer, subject)` identity and actor, add the role membership (and player record when the role is `player`), and issue the role session. The session document is inserted with the same Mongo transaction session, so a failed claim cannot leave a partial membership or usable session. The same identity may retry its own already-claimed invitation safely; a different identity cannot reuse it. Production has not yet applied migration 011. Tenant creation and retention/controller policy lifecycle remain unimplemented; the admin roster and revocation endpoints are implemented locally but are not deployed; the live role UI remains unimplemented; invitation issuance correctly fails closed when no active tenant exists.

`src/lib/auth/login-transaction.mjs` creates cryptographically random state, nonce, PKCE verifier, and browser-binding values. Only the SHA-256 hashes of state and browser binding are indexed; nonce and verifier are held server-side in `auth_transactions`. The browser binding is intended for the `__Host-hg_auth_txn` Secure/HttpOnly/SameSite=Lax cookie. Starting a new login first marks any pending transaction for the same binding consumed, then inserts the replacement; the partial unique index rejects concurrent duplicate pending transactions. Callback consumption is a single `findOneAndUpdate` constrained by both hashes, `consumedAt: null`, and `expiresAt > now`, so replay, wrong-browser use, and expiry fail closed. `returnTo` is restricted to same-origin relative paths. `src/app/auth/login/route.ts` uses dynamic request handling, loads issuer-pinned discovery metadata, and redirects with no-store/referrer protection plus the Secure, HttpOnly, SameSite=Lax binding cookie.

`src/lib/auth/sso-oidc.mjs` supplies testable OIDC protocol functions: HTTPS issuer discovery pinned to its origin, JSON authorization-code exchange (`client_secret_post`), RS256/JWKS claim verification (`iss`, `aud`, `azp`, `exp`, `iat`, `nonce`), userinfo, and approved app-permission checks. On first verified login it requests a bounded, no-store client-credentials token scoped to `manage_permissions`, reads the user's current Habi permission, and upserts only `role=user,status=approved` when no permission or a pending permission exists. Existing approved admin access is preserved and revoked access fails closed. Machine tokens are held only in process memory until shortly before expiry; they are never logged or stored in Mongo. Each HTTP dependency request is no-store and has a five-second timeout. `verifyIdTokenWithKeyRefresh` refreshes JWKS once only when a well-formed RS256 token references an unknown signing `kid`; malformed tokens do not trigger a fetch and a missing key after refresh is rejected. The SSO browser callback uses these through `/auth/login` and `/api/oauth/callback`; unit tests cover first-login provisioning and admin preservation. Live provisioning requires `manage_permissions` to be enabled for the Habi OAuth client.

`src/lib/auth/session.mjs` generates 256-bit opaque role-workflow session tokens and stores only a purpose-separated HMAC-SHA256 token hash. Those are separate from the SSO browser MVP owner sessions documented above. The role session derives a session-bound HMAC CSRF token, implements request-time absolute/idle expiry and revocation, and stores provider credentials only in the encrypted collection from migration 003. `/auth/logout` dispatches by runtime mode: SSO browser MVP validates exact Origin and revokes the owner session; the role runtime uses `createLogoutHandler()` with the role session cookie and session-bound CSRF token. The API contract records both behaviors.

`src/lib/auth/identity-access.mjs` resolves an external identity strictly by `(issuer, subject)`, requires the matching active local actor, and returns only active nonexpired memberships whose tenant and player links still resolve within the same tenant. It never joins identities by email or trusts the SSO app role as a Habi role. This resolver is unit-tested with revoked/suspended, expired, cross-tenant and missing-identity cases; it is not yet used by an HTTP route.

## Index intent

| Collection          | Index purpose                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `identities`        | Unique `(issuer,subject)` identity binding                                                        |
| `auth_transactions` | Internal login state: unique state hash, one live transaction per browser binding, ten-minute TTL |
| `sessions`          | Unique purpose-separated HMAC token hash and absolute-expiry TTL                                  |
| `memberships`       | Active membership uniqueness and tenant/player access lookup                                      |
| `players`           | Tenant-scoped ID uniqueness                                                                       |
| `records`           | Tenant-scoped ID, stable player timeline, and per-session metric uniqueness for check-in answers  |
| `events`            | Player timeline order and process order                                                           |
| `jobs`              | Tenant-scoped identity, due-job claim, lease/fence and idempotent claim receipt                   |
| `interpretation_reviews` | Tenant-scoped immutable review history for exact interpretation revisions                     |
| `idempotency`       | Unique request scope and TTL cleanup                                                              |
| `audit`             | Tenant/time audit traversal                                                                       |
| `deletion_ledger`   | Unique tenant subject deletion control                                                            |

Mongo TTL removal is asynchronous and is not authorization. Expired sessions must be rejected by request-time expiry checks; expired idempotency receipts are checked and removed in the transaction path. The current Habi schema does not define `Job.logicalKey`, so no such index is created; a future logical-job deduplication field needs a versioned contract change before index creation.

## API request correlation and safe failure logs

`src/lib/api/route-boundary.mjs` minden auth, üzleti és operational route kéréshez friss 128 bites request ID-t készít, `X-Request-ID` fejlécben és a publikus hiba DTO-ban visszaadja, majd ugyanazt az azonosítót használja a strukturált logban. A log csak fix operation labelt, státuszt, request ID-t és engedélyezett hibakódot tartalmaz; URL, body, exception szöveg/stack, DB hiba, URI és credential kimarad. A logger hibája nem írhatja felül az API választ. Next.js prerender vezérlőjelek továbbmennek a határon.

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


`src/lib/auth/session-guard.mjs` is the shared request-authentication primitive for user routes. It requires an opaque session cookie, checks current actor status/access revision, exact active tenant/role/player membership, current tenant/player records, same-origin plus session-bound CSRF for unsafe methods, and atomically touches idle time. The local synthetic endpoint is test-only. Worker endpoints use a separate `authenticateWorkerRequest()` bearer guard and revalidate the requester membership and job lease before they receive source context or submit results. The user guard and worker guard are implemented in this worktree but their full cross-workflow behavior has not yet been run through acceptance tests.
