# Habi deployment and operations

## Production status · 2026-10-26

- Product host: `https://habigoal.com`; `www.habigoal.com` redirects to the apex with HTTP 308 so the SSO callback and its host-only transaction cookie share one origin.
- Vercel project: `narimato/habi`. The legacy host `habi.doneisbetter.com` remains on that same project for existing browser-session proof.
- Production data target: the existing MongoDB Atlas database `habi`. Its `HG_ATLAS_URI` setting was preserved; the legacy `habi_mongodb_uri` variable was not changed.
- Production SSO configuration is present in the Vercel secret store: canonical and legacy origins, DoneIsBetter OIDC settings, and session HMAC key. The release changes `HG_MVP_MODE` to `role-workflow` and adds refresh-encryption, cursor-signing and local-worker verification keys. Secret values are not stored in this repository.
- Production now has the non-secret `HG_TENANT_ID=habi` setting. The current deployed commit does not yet consume it; the pending code change will pin admin invitation lookup and creation to this one tenant ID.
- Additive migration `010-sso-browser-owner-sessions` has been applied to Production. It created/updated only `auth_transactions`, `habi_sso_owner_links`, `habi_sso_owner_sessions`, and `habi_sso_owner_handoffs`. The existing `habi_states` count remained 37 and `habi_content` remained 1 before and after; no user documents were rewritten.
- The latest Production deployment inspected on 2026-10-26 is Ready from commit `ef1db79` (`Document Habi production SSO verification`) and serves the product domains. The deployed app remains the old diary UI; the admin/role workflow changes below are not in that deployment.
- The release adds the `/admin` invitation and role-revocation UI, the player/parent/coach workspace, signed admin grant, role-invitation/claim routes and migration 011. An admin-only bootstrap endpoint applies all versioned migrations and creates tenant `habi` idempotently with the policy draft IDs already documented in `docs/policies/`. It cannot modify an existing tenant with different policy references.
- Apex is the configured SSO callback origin. The callback no longer crosses hosts, avoiding loss of the `__Host-` transaction cookie. A real browser SSO callback/session still requires the owner to complete sign-in. See [verification](verification.md).

## Release procedure

1. Run `npm run lint`, `npm run typecheck`, `npm test` with the isolated local Mongo replica set, `npm run build`, worker unit tests, local synthetic workflow acceptance, and `git diff --check`.
2. Confirm the Habi project and Production scope before changing Vercel settings. Keep Production-only secrets in Vercel; do not pull them into `.env.local` or commit them.
3. Preserve `HG_ATLAS_URI`; confirm `HG_ATLAS_DATABASE=habi`. The browser MVP uses the current Habi document shape and does not migrate or rewrite user records.
4. After verified SSO admin login, use `/admin` to run the idempotent schema bootstrap and create the `habi` tenant. Migration checksums are recorded in `_habi_migrations`; existing records are not bulk-deleted or imported into role identities.
5. Push the reviewed commit to `main`. Vercel Git integration creates the Production deployment with the configured Production variables.
6. Verify deployment state, `/`, `/admin`, `/api/health`, `/api/ready`, and SSO login/callback. Complete one real browser admin login, initialize the tenant, invite a synthetic test account, claim the invitation, and verify role login/logout.
7. Install the `hosted` worker as the `com.doneisbetter.habi-worker` LaunchAgent on the Mac. It connects outward to Habi over HTTPS and reaches Ollama only on loopback; Tailscale Funnel is not part of this flow.

## Canonical SSO origin and retired data-transfer path

The canonical origin and registered callback are `https://habigoal.com` and `https://habigoal.com/api/oauth/callback`. `www.habigoal.com` redirects to the apex. This keeps the login transaction cookie on the callback host. Real browser callback verification remains required.

## Runtime log levels

API boundary diagnostics contain only a fixed operation label, request ID, status, and public error code. Expected request denials and other handled 4xx errors are logged at informational level; 5xx responses, thrown server errors, and fail-closed dependency/configuration failures are logged at error level. Do not treat a signed-out `/api/app` 401 as a service outage. Investigate error-level events using the request ID and deployment ID; never log request bodies, credentials, or exception messages.

Legacy browser-owner transfer is retired and blocked by the current SSO-browser route boundary. New SSO identities receive a clean owner scope; old records are not imported or required for Habi access.

No record transfer or email-based identity matching is part of the new product.

## Rollback and recovery

- Application rollback: restore the preceding Vercel Production deployment. Keep the additive SSO collections; do not drop them during rollback. The old browser app continues to own records by the same `habi_states` key.
- If SSO login fails, do not reset identity links or infer ownership by email. Capture the request ID, deployment ID, and sanitized status; preserve the existing SSO session and retry after correcting the configuration.
- If migration 010 fails, stop before deployment. It is idempotent and additive; correct the validator/index issue and rerun. Do not remove the migration ledger entry or drop collections as an automatic recovery.
- If an owner-link conflict occurs, leave both records and identities unchanged and investigate using authenticated identity and verified legacy-cookie evidence.

## Local test boundaries

`npm test` uses the explicitly configured localhost replica set and a disposable `_test` database. The production migration is not part of local test scripts. The browser MVP must not be run locally against Atlas or real user sessions. Development remains synthetic-only; production secrets and OIDC client credentials remain in Vercel.
