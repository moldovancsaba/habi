# Habi deployment and operations

## Production status · 2026-10-26

- Product host: `https://www.habigoal.com`; Vercel redirects the verified apex `habigoal.com` to `www.habigoal.com` with HTTP 308.
- Vercel project: `narimato/habi`. The legacy host `habi.doneisbetter.com` remains on that same project for existing browser-session proof.
- Production data target: the existing MongoDB Atlas database `habi`. Its `HG_ATLAS_URI` setting was preserved; the legacy `habi_mongodb_uri` variable was not changed.
- Production SSO configuration is present in the Vercel secret store: `HG_MVP_MODE=sso-browser`, canonical and legacy origins, DoneIsBetter OIDC settings, and a newly generated session HMAC key. Secret values are not stored in this repository or local `.env` files.
- Additive migration `010-sso-browser-owner-sessions` has been applied to Production. It created/updated only `auth_transactions`, `habi_sso_owner_links`, `habi_sso_owner_sessions`, and `habi_sso_owner_handoffs`. The existing `habi_states` count remained 37 and `habi_content` remained 1 before and after; no user documents were rewritten.
- Production deployment `dpl_6i4T3VvT6Rz8TR6KyD7qw22hML7E` is Ready from commit `887fd9d` and serves the product domains. Live checks confirmed `/` 200, `/api/health` 200, `/api/ready` 200, signed-out `/api/app` 401, and `/auth/login` redirects to the configured DoneIsBetter authorization endpoint.
- The apex callback relay was checked separately: `habigoal.com/api/oauth/callback?…` redirects to the canonical `www` host while preserving the callback path and query. A real browser SSO callback/session and verified legacy-record transfer still require the owner to complete sign-in with the original legacy browser cookie. See [verification](verification.md).

## Release procedure

1. Run `npm run lint`, `npm run typecheck`, `npm test` with the isolated local Mongo replica set, `npm run build`, and `git diff --check`.
2. Confirm the Habi project and Production scope before changing Vercel settings. Keep Production-only secrets in Vercel; do not pull them into `.env.local` or commit them.
3. Preserve `HG_ATLAS_URI`; confirm `HG_ATLAS_DATABASE=habi`. The browser MVP uses the current Habi document shape and does not migrate or rewrite user records.
4. Apply only migration 010 to `habi`. Do not run the broad 001–009 workflow migrations for this MVP. Keep the additive migration checksum in `_habi_migrations` and verify legacy record counts are unchanged.
5. Push the reviewed commit to `main`. Vercel Git integration creates the Production deployment with the configured Production variables.
6. Verify deployment state, `/`, `/api/health`, unauthenticated `/api/app` (401), SSO login redirect, and callback route. Then complete one real browser login and verify read/save/reload/logout.
7. If a legacy browser session is available, start transfer at `habi.doneisbetter.com`, complete SSO on the same browser, verify the old records appear, and verify replay/expiry fail closed. Never test by writing sample records to Production.

## SSO and legacy transfer behavior

The login starts on `www.habigoal.com` and uses the registered callback `https://habigoal.com/api/oauth/callback`. The verified Vercel apex redirects to `www` and preserves the callback path and query. The live redirect was checked, but a real browser callback remains an owner sign-in verification item because it depends on the SSO session and browser-bound transaction cookie.

## Runtime log levels

API boundary diagnostics contain only a fixed operation label, request ID, status, and public error code. Expected request denials and other handled 4xx errors are logged at informational level; 5xx responses, thrown server errors, and fail-closed dependency/configuration failures are logged at error level. Do not treat a signed-out `/api/app` 401 as a service outage. Investigate error-level events using the request ID and deployment ID; never log request bodies, credentials, or exception messages.

A legacy transfer starts only when `habi.doneisbetter.com` receives the user's existing valid HttpOnly browser cookie. It issues a random token with a 30-minute lifetime. The token is placed in the destination URL fragment, removed from browser history by the client, and exchanged for a short-lived HttpOnly browser-binding cookie. The SSO callback consumes it only after issuer, signature, nonce, userinfo subject, and Habi permission checks succeed. The system never links by email. Tokens are hash-only in MongoDB and single-use.

The transfer links existing server-side `habi_states` by owner hash; it does not transfer uncommitted browser-local storage. Users must have synced earlier entries to the existing server before transfer. If an old cookie is unavailable, those records cannot be safely auto-matched.

## Rollback and recovery

- Application rollback: restore the preceding Vercel Production deployment. Keep the additive SSO collections; do not drop them during rollback. The old browser app continues to own records by the same `habi_states` key.
- If SSO login fails, do not reset identity links or infer ownership by email. Capture the request ID, deployment ID, and sanitized status; preserve the existing SSO session and retry after correcting the configuration.
- If migration 010 fails, stop before deployment. It is idempotent and additive; correct the validator/index issue and rerun. Do not remove the migration ledger entry or drop collections as an automatic recovery.
- If an owner-link conflict occurs, leave both records and identities unchanged and investigate using authenticated identity and verified legacy-cookie evidence.

## Local test boundaries

`npm test` uses the explicitly configured localhost replica set and a disposable `_test` database. The production migration is not part of local test scripts. The browser MVP must not be run locally against Atlas or real user sessions. Development remains synthetic-only; production secrets and OIDC client credentials remain in Vercel.
