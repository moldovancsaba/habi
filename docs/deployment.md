# Habi deployment and operations

## Production status · 2026-10-27

## Coach questions across player records · Production release 2026-10-27

Commit `cc87390d62a99fc626b04308bf3d893158d99278` is READY in Vercel Production as deployment `dpl_dbTDwdYD75by9ByjmgSWcXMpuzn4`, with aliases `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. The coach can ask about up to the 20 most recent eligible sources across player records and reviewed product information. `/api/health` and `/api/ready` returned HTTP 200; the deployed client bundle contains the question panel. Authenticated Production submission and Ollama answer quality remain unverified. Local test and safety boundaries are in [verification](verification.md).

## Saját cél cseréje és visszaállítása · 2026-10-27

- A játékos az aktív célkártyáról lecserélheti a célt; az új verzió egyetlen idempotens naplóírásban rögzíti, melyik célt váltja le. A korábbi cél megmarad az előzményben, és egyetlen művelettel visszaállítható új verzióként.
- Helyi ellenőrzés: 146 teszt sikeres, 0 hibás, 1 Atlas-only kihagyás; Biome lint és TypeScript ellenőrzés sikeres. A szintetikus unit tesztek nem igazolják a hitelesített Production böngészőírást.
- Code commit `bff016b` is READY as Vercel deployment `dpl_3Seik5YN1d4m3hKoqp2EtBTcCCTD` in `narimato/habi`, Production; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`.
- A Production request-ID keresés nem talált logsort ehhez a felhasználói azonosítóhoz: `7fb1bd7f7bbf3642e86aba0283265021`. A nyilvános `/api/health` és `/api/ready` jelenleg 200-at ad. Az azonosító nem egyezett a Vercel request ID-ként elérhető naplóbejegyzéssel.

## Saját cél újranézési ciklusa · 2026-10-27

- A játékos 7/14/28 napos vagy kikapcsolt újranézést állíthat be cél létrehozásakor, illetve minden visszatekintés után. Esedékességkor jelzés jelenik meg az alkalmazás áttekintésén. A beállítás célazonosítóhoz kötött naplóeseményként mentődik; nincs időzóna-beállítás, push vagy külső értesítés.
- Helyi teljes suite 143 passed / 0 failed / 1 Atlas-only skip; lint, typecheck, production build és diff check pass. Részletek: [verification](verification.md#saját-célok-újranézési-ciklusa--2026-10-27).
- Production commit `33c6a12` is READY as Vercel deployment `dpl_8nXvqb8Zm6d764MPytYes5Sx6G7W` in `narimato/habi`, aliased to `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. Live checks: `/` 200, `/legacy` 307 to `/?view=legacy`, `/api/health` 200, and `/api/ready` 200.
- The authenticated diary write and overdue reminder display have not been exercised in a Production browser session, so those steps remain unverified despite the READY deployment.

## HABI2 topic conversation release · 2026-10-27

- The current release adds seven topic choices backed by three versioned authored conversation trees. Each answer is saved as a player-owned revision-fenced draft; a completed transcript is written to the diary. The trees are deterministic, and no personal conversation content is sent to an AI service.
- Local verification: 147 tests passed, 0 failed, 0 skipped with the isolated localhost replica set; lint, typecheck, build, and `git diff --check` passed. See [verification](verification.md#habi2-authored-topic-conversations--2026-10-27).
- Production commit `6693cdfa3378ab9efb58768b6d9be4cf64f42336` is READY as `dpl_5F7hsaczwaNNMXvUi42audNCrj4T`, aliased to `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. Live unauthenticated routes `/`, `/admin`, `/legacy`, `/api/health`, and `/api/ready` return HTTP 200; the player draft API correctly returns 401 without a session.
- It uses the existing `014-experience-drafts` migration and adds no schema migration. Production application of migration `014-experience-drafts` remains unconfirmed: `/admin` currently requires an authenticated DoneIsBetter admin, so persistent Production drafts must not be claimed until the admin update screen confirms it. This release does not import or change old diary records.
- Local synthetic HTTP/worker acceptance was attempted but could not complete the PDF-scan step: the running LaunchAgent is configured for Production and cannot process localhost synthetic jobs. It was left running and untouched; details are recorded in [verification](verification.md).

## Reflection-draft release · 2026-10-27

- Release commit `1d097167642a064114d162f1a35258740310c10d`, Vercel deployment `dpl_3Cea7WCqacmV4qMYc9CVs14tZ84b` (READY), project `narimato/habi`, Production; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. This change adds player-owned, resumable daily, weekly, and monthly reflection drafts. It does not import or modify existing legacy diary records.
- Additive migration `014-experience-drafts` creates and validates `habi_experience_drafts` with unique draft identity and tenant/player/actor/key indexes. It is part of the authenticated `/admin` **Adatbázis frissítése** bootstrap (`POST /api/admin/bootstrap`), which runs all registered migrations idempotently before verifying tenant `habi`.
- Production persistence is not active until a verified DoneIsBetter Habi admin signs in and runs the database update/bootstrap. Do not claim resumable Production drafts before the response confirms migration `014-experience-drafts` was applied. The user must not send credentials or database URIs in chat.
- Local verification on an isolated localhost MongoDB replica set (`habiTestRs`): migration replay and draft create/update/revision-conflict/role-denial/delete all passed. Full suite: 138 passed, 0 failed, 0 skipped; lint, typecheck, production build, and `git diff --check` results are recorded in `docs/verification.md`.
- Live unauthenticated checks on `https://habigoal.com`: `/`, `/admin`, `/?view=legacy`, `/api/health`, and `/api/ready` returned HTTP 200; `/legacy` returned HTTP 307 to `/?view=legacy`; an unauthenticated draft API read returned HTTP 401 as required. Authenticated draft writes and reads are not verified because they require the owner’s SSO session. Production migration 014 remains pending the authenticated `/admin` database update action.

- Canonical-host handling: all browser and API requests on aliases and Vercel deployment URLs are redirected to `https://habigoal.com` before routing, with path and query preserved. Only `habigoal.com` is the production application origin; localhost remains available for development. This is required because the `__Host-` session cookies are intentionally host-only. A user signed in on the apex appeared signed out when opening an alias or deployment URL, because those requests did not include the apex cookies.

- SSO callback: after validating the OIDC identity, Habi provisions the standard approved DoneIsBetter app permission `user` for a first-time identity using the Habi OAuth client's `manage_permissions` client-credentials scope. Existing approved `user` and `admin` grants are preserved; revoked grants are never restored. This app-level permission enables Habi sign-in only. Player/parent/coach membership remains controlled by a separately issued and claimed Habi invitation. The callback applies prerequisites `010-sso-browser-owner-sessions` and `011-role-invitations` before writing the session.

- Product host: `https://habigoal.com`; `www.habigoal.com` redirects to the apex with HTTP 308 so the SSO callback and its host-only transaction cookie share one origin.
- Vercel project: `narimato/habi`. The legacy host `habi.doneisbetter.com` remains on that same project for existing browser-session proof.
- Production data target: the existing MongoDB Atlas database `habi`. Its `HG_ATLAS_URI` setting was preserved; the legacy `habi_mongodb_uri` variable was not changed.
- Production SSO configuration is present in the Vercel secret store: canonical and legacy origins, DoneIsBetter OIDC settings, and session HMAC key. The Habi OAuth client must be allowed to request `manage_permissions` for the client-credentials grant. Secret values are not stored in this repository.
- Production has the non-secret `HG_TENANT_ID=habi` setting; the deployed role workflow validates and pins admin actions to this tenant ID.
- Additive migration `010-sso-browser-owner-sessions` has been applied to Production. It created/updated only `auth_transactions`, `habi_sso_owner_links`, `habi_sso_owner_sessions`, and `habi_sso_owner_handoffs`. The existing `habi_states` count remained 37 and `habi_content` remained 1 before and after; no user documents were rewritten.
- Production serves the role workspace at `/` and the SSO-admin console at `/admin`. First-login SSO app-permission provisioning is deployed from commit `82d37bf`, deployment `dpl_6eeVijeCXsQwbsdXXmLMFJE7AWJa` (READY); `/`, `/api/health`, and `/api/ready` returned HTTP 200. A real new-identity callback remains the live integration check because it requires an authenticated SSO account.
- Production exposes the `/admin` invitation and role-revocation UI, the player/parent/coach workspace, session-bound admin grant, role-invitation/claim routes, migration 011 and an admin-only idempotent bootstrap for tenant `habi`. The bootstrap uses the MVP draft policy references in `docs/policies/` and will not overwrite a tenant with different references. The tenant bootstrap remains pending an authenticated Habi admin action.
- The first deployment surfaced an invalid worker verifier value because the newline from its protected hash file was retained. The Production verifier was replaced with a newline-free SHA-256 value and the subsequent deployment passed `/api/health` and `/api/ready` with HTTP 200.
- The local Mac worker LaunchAgent `com.doneisbetter.habi-worker` is installed and running. It polls `https://habigoal.com/api/v1/worker/jobs/claim`; hosted interpretation generation uses the shared Hetzner `text_chat` async API with model `auto`. Local `qwen2.5:7b` remains the synthetic/test model. The Hetzner service key is stored only in the ignored mode-0600 worker env file; it is never configured in Vercel.
- Apex is the configured SSO callback origin. The callback no longer crosses hosts, avoiding loss of the `__Host-` transaction cookie. A real browser SSO callback/session still requires the owner to complete sign-in. See [verification](verification.md).

## Release procedure

1. Run `npm run lint`, `npm run typecheck`, `npm test` with the isolated local Mongo replica set, `npm run build`, worker unit tests, local synthetic workflow acceptance, and `git diff --check`.
2. Confirm the Habi project and Production scope before changing Vercel settings. Keep Production-only secrets in Vercel; do not pull them into `.env.local` or commit them.
3. Preserve `HG_ATLAS_URI`; confirm `HG_ATLAS_DATABASE=habi`. The browser MVP uses the current Habi document shape and does not migrate or rewrite user records.
4. After verified SSO admin login, use `/admin` to run the idempotent schema bootstrap and create/verify the `habi` tenant. Migration checksums are recorded in `_habi_migrations`; existing records are not bulk-deleted or imported into role identities. Confirm all currently registered migrations, including `014-experience-drafts` and `015-monthly-reflections`, are listed as applied before relying on resumable or structured monthly reflections.
5. Push the reviewed commit to `main`. Vercel Git integration creates the Production deployment with the configured Production variables.
6. Verify deployment state, `/`, `/admin`, `/api/health`, `/api/ready`, and SSO login/callback. A successful first login should create only the SSO `user` app permission. A Habi product role still requires an administrator-issued invitation and verified claim.
7. The `hosted` worker is installed as the `com.doneisbetter.habi-worker` LaunchAgent on the Mac. It connects outward to Habi and to the shared Hetzner AI API over HTTPS. Tailscale Funnel is not part of this flow. The shared API receives the selected player source bundle; provider data handling and Hungarian answer quality are separate verification items.

## Canonical SSO origin and retired data-transfer path

The canonical origin and registered callback are `https://habigoal.com` and `https://habigoal.com/api/oauth/callback`. `www.habigoal.com` redirects to the apex. This keeps the login transaction cookie on the callback host. Real browser callback verification remains required.

## HABI2 conversation summary/export · Production release 2026-10-27

Commit `59ce12eae72b8d431fe4ceb4bdf471b6ed2cf8f8` is live as deployment `dpl_HQdC3FwYciiimS2nmxGTqMzsv9Vo` (READY), with aliases `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. The feature renders a Hungarian transcript summary for a completed authored topic conversation, downloads it as UTF-8 text, and stores the same authored turns in the player journal when saved. Live unauthenticated checks for `/`, `/api/health`, and `/api/ready` returned HTTP 200; `/legacy` returned HTTP 307 to `/?view=legacy`. Local verification is in [verification](verification.md). No API contract, persistence schema, or migration change was introduced.

## Timeline re-export of a saved guided conversation · Production release 2026-10-27

Commit `c79dac4eb77c211474017db14829c146dfe33c26` is live as deployment `dpl_7tWzzKxTFMo2BeQkCnr9YewF1Ewa` (READY), with aliases `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. The player can download the exact saved diary text from an expanded timeline card. No API, persistence-schema, or migration change was introduced. Live endpoint checks and local tests are listed in [verification](verification.md).

## Free-text guided conversation start · Production release 2026-10-27

Commit `629a124fbaceec8db488ba0ba0ce922383c257aa` is live as deployment `dpl_85ECdPEWweoL42vvGr6QJYHLvucH` (READY), with aliases including `habigoal.com`. The HABI2 flow accepts an opening message, ranks topics with preserved local keyword matching, keeps that message in the resumable conversation and saved transcript, and sends recognized safety phrases to the authored support branch. It reads v2 drafts and writes v3. The full local suite (151 passed), lint, typecheck, production build, and diff check passed; live route checks are in [verification](verification.md). No new API endpoint or database migration was required. The authenticated conversation itself has not been exercised in Production.

## Structured monthly reflection persistence · Production deployment 2026-10-27

Commit `3ec2b613e069e192255e8eed75a202e609426f84` is live in the `narimato/habi` Production target as deployment `habi-f0iq49ded-narimato.vercel.app` (READY). The monthly-reflection route is live and requires authentication. Migration `015-monthly-reflections` is additive and remains pending the authenticated `/admin` database update; do not treat monthly reflection finalization as Production-ready until that update succeeds and a real authenticated save/reload is verified. Local database acceptance passed against the disposable replica set. See [verification](verification.md).

## Start a guided conversation from a saved check-in · Production release 2026-10-27

Commit `5aba1b388cc4660d7de8f2f1f4124223d07bf38f` is live as deployment `dpl_8WMELks4cJaRoJ7Ak2m1Vk4Q3ChT` (READY). The player overview exposes a direct action to open a guided conversation with the latest recognized check-in questions and answers as an editable opening. No sentiment is inferred and nothing is submitted until the player continues. No API endpoint, stored contract, or migration changed. Local verification and live route checks are in [verification](verification.md); an authenticated browser interaction remains unverified.

## Trusted-adult preparation review · Production release 2026-10-27

Commit `7d16d2c514ef294033c74469208f86b4fed3095a` is live as deployment `dpl_4wViwAAV83ZEdLCCkqxUTwPvDqKE` (READY), with aliases `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. The player reviews the prepared text before choosing to return and edit, save privately, or download a copy. Habi does not send the message. No API, persisted contract, or migration changed. Verification is recorded in [verification](verification.md); the authenticated screen was not exercised in Production.

## Runtime log levels

API boundary diagnostics contain only a fixed operation label, request ID, status, and public error code. An unexpected failure (`INTERNAL_ERROR`) also carries a `failure` object with the error class, a numeric or upper-case symbolic code, the database code name, error labels and the first code location (function and file:line:column), so a rare 500 can be located without its message. Expected request denials and other handled 4xx errors are logged at informational level; 5xx responses, thrown server errors, and fail-closed dependency/configuration failures are logged at error level. Do not treat a signed-out `/api/app` 401 as a service outage. Investigate error-level events using the request ID and deployment ID; never log request bodies, credentials, or exception messages.

A database failure that retrying can cure — a broken connection, a server-selection or network timeout, an exhausted or cleared connection pool, or a transaction labelled `TransientTransactionError` — is answered `DEPENDENCY_UNAVAILABLE` (503 with `Retry-After: 2`) instead of an opaque 500, and its log line still carries the content-free `failure` object so the cause stays visible. Any other unexpected error stays a 500.

A request that takes `HG_SLOW_API_MS` milliseconds or longer (default 3000) also emits one `habi.api.slow` warning with only the operation, request ID, status and `durationMs`, so a response that is correct but too slow for its caller — for example the worker, which gives up on most calls after 8 seconds — is visible in `vercel logs` instead of looking like a transient network error. The four routes that read a player's records one collection at a time (worker context and complete, AI-coach start and thread read) declare `maxDuration = 30`; the worker waits 25 seconds for the context and complete calls. Each database command from the Vercel function (region `iad1`) to Atlas currently costs about 95 ms, so the number of sequential commands per request is the budget to watch: `tests/coach-context-cost.test.mjs` fails if the worker context or a coach read grows with the length of a thread.

Legacy browser-owner transfer is retired and blocked by the current SSO-browser route boundary. New SSO identities receive a clean owner scope; old records are not imported or required for Habi access.

## SSO owner-session validator repair · 2026-10-27

Commit `0a1252b` is live in Production as deployment `dpl_GY8wVdYDQrSvKBfTTbdSCEUbsQWh` (READY), with aliases including `habigoal.com`. Production callback diagnostics identified Atlas rejecting owner-session creation because the existing validator omitted optional verified `displayName`. Migration `016-sso-owner-session-display-name` repairs that validator automatically before the callback inserts a new session. The migration is additive and leaves existing records untouched. Health/readiness and the SSO authorization redirect are live; a complete user-authenticated callback has not yet been verified. See [verification](verification.md).

## Coach shared-plan creation · 2026-10-27

Commit `a84112c` is live in Production as deployment `dpl_3CznDjhKoWwA644371FJy1nggJcg` (READY), with aliases including `habigoal.com`. The coach form now sends the required whole-record `span: null` source reference. Plan creation recognizes the active tenant-scoped coach membership. The authenticated save itself was verified against the isolated local replica set; no Production record was created during verification. See [verification](verification.md).

No record transfer or email-based identity matching is part of the new product.

## Rollback and recovery

- Application rollback: restore the preceding Vercel Production deployment. Keep the additive SSO collections; do not drop them during rollback. The old browser app continues to own records by the same `habi_states` key.
- If SSO login fails, do not reset identity links or infer ownership by email. Capture the request ID, deployment ID, and sanitized status; preserve the existing SSO session and retry after correcting the configuration.
- If any migration fails, stop before claiming that feature is ready in Production. Migrations 010, 014, and 015 are additive; correct the validator/index issue and rerun the authenticated bootstrap. Do not remove a migration ledger entry or drop collections as an automatic recovery.
- If an owner-link conflict occurs, leave both records and identities unchanged and investigate using authenticated identity and verified legacy-cookie evidence.

## Local test boundaries

`npm test` uses the explicitly configured localhost replica set and a disposable `_test` database. The production migration is not part of local test scripts. The browser MVP must not be run locally against Atlas or real user sessions. Development remains synthetic-only; production secrets and OIDC client credentials remain in Vercel.

## Kontextusos AI-edző kiadása

A `018-contextual-ai-coach` migráció a hitelesített új AI-útvonalakon idempotensen lefut, és csak az új privát kollekciókat, indexeket és a jobvalidátor új típusát telepíti. A webkiadás READY állapota után a `com.doneisbetter.habi-worker` LaunchAgent újraindítása szükséges, hogy a `coachConversation` típust is kérje. A `coach-prompt.md` külön hash-ellenőrzést kap. A kiadás szintetikus, production-buildes háromszereplős böngészőpróbája a tényleges shared AI API-t használta; a beszélgetést és profiladatot a tesztadatbázisban tartotta.
