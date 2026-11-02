# Invited first-login access

## Corrected failure — 2 November 2026

At baseline `f204c08`, Habi's automatic SSO app approval expected a flat permission DTO from both GET and PUT. DoneIsBetter GET returns the DTO directly, but its PUT responds:

```json
{
  "success": true,
  "permission": {
    "userId": "verified-subject",
    "clientId": "habi-client",
    "role": "user",
    "status": "approved",
    "hasAccess": true
  }
}
```

The approval write succeeded, then Habi misread the acknowledgement and raised `SSO_APP_PERMISSION_SETUP_REQUIRED`. The callback returned `APP_PERMISSION_SETUP_REQUIRED` without issuing the SSO browser session needed to claim the invitation. Manual SSO approval followed by another login worked around the failed first attempt because subsequent GET reads returned an already-approved flat DTO.

The mismatch was reproduced against the original module using the real PUT response shape. The corrected module accepts that identical acknowledgement. The dependency contract was checked in `moldovancsaba/sso`, `pages/api/users/[userId]/apps/[clientId]/permissions.js`. The live Habi OAuth client was inspected read-only: its configured grants/scopes already support client credentials and `manage_permissions`; no SSO client configuration or account grants were changed during investigation.

## Runtime contract

1. Validate the existing browser-bound OAuth transaction, PKCE, signed identity token, issuer/audience/nonce and matching userinfo subject.
2. Read this identity's Habi app permission. Preserve an approved user/admin permission; reject explicit revocation.
3. For missing/pending ordinary app access, use the existing confidential Habi client's `manage_permissions` token and request only `role=user,status=approved`.
4. Accept the real `{success:true, permission:DTO}` acknowledgement and retain compatibility with older direct DTOs. Require an explicit successful wrapper, approved user/admin role, no contradictory denied-access flag, and matching user/client IDs when supplied. Failed/malformed/pending/revoked/foreign acknowledgements fail closed.
5. Issue the existing HttpOnly SSO browser session and return to the invitation URL bound to the login transaction.
6. The existing same-origin invitation claim checks the actual token, identity binding, expiry/revocation, tenant and role. It transactionally creates/reuses the identity, actor and invited membership, and issues the role session.
7. The invited user can then read `/api/v1/me` and enter that role's workspace. Replaying a claim for the same identity does not create duplicate membership.

Ordinary SSO app approval is not a player/parent/coach membership or Habi administration grant. A valid invitation is still required to obtain its product role; an SSO login without one grants no product-data access. Approval never restores explicitly revoked SSO access. Existing invitation acceptance controls and identity-provider login/registration screens are used; no new UI/accessibility interaction is introduced.

## Verification

`tests/sso-oidc.test.mjs` covers the real wrapped acknowledgement for both absent and pending users, direct DTO compatibility, existing administrator preservation, explicit revocation and malformed/failed/foreign acknowledgements.

`tests/invite-first-login.test.mjs` runs the actual permission client, browser callback, invitation POST handler, Mongo transactions, session guard and `/api/v1/me` handler. Its only identity-provider substitution is the cryptographic identity-exchange stage; the approved identity and SSO HTTP responses are synthetic. Player, parent and coach each obtain their exact invited role on the first successful callback/claim, with no manual approval step or admin cookie. Replayed claims preserve one identity/membership. Missing, expired and revoked invitations still return no product session or usable product role.

```sh
set -a
source .env.test.example
set +a
node --test tests/sso-oidc.test.mjs tests/invite-first-login.test.mjs
npm test
npm run lint
npm run typecheck
npm run build
```

Integration tests use a uniquely named localhost `_test` database and remove it afterwards. No production invitee or account was created, approved or altered to run them. The normal CI Mongo regression job runs these tests with the same checked-in synthetic configuration. Release SHA, CI and production health evidence belong to the release handover; these synthetic tests do not claim a real new production identity was registered interactively.

## Operations and recovery

There is no new API route, migration, scope, credential, provider configuration or worker change. The existing SSO dependency calls remain no-store and limited to five seconds each; machine tokens remain in process memory until shortly before expiry. Existing callback telemetry records symbolic reason codes without tokens or user payloads.

A user who hit the old error can reopen the same still-valid invitation and log in/accept it again after release. The failed callback did not consume the Habi invitation. Already approved SSO permissions continue through their normal GET path. Expired or revoked invitations require a new invitation from the Habi administrator, while explicitly revoked app access remains subject to the existing SSO policy.

On an SSO outage or invalid acknowledgement, keep the existing failure/retry flow rather than issuing a session based solely on an invitation URL. Rollback redeploys the previous build; there is no data rollback. Do not revoke legitimate ordinary app grants that were already approved as part of normal sign-in.
