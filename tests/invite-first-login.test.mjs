import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as crypto from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { MongoClient } from "mongodb";
import { runMigrations } from "../src/lib/database/migrations/runner.mjs";
import { applySyntheticSeed } from "../src/lib/database/seed.mjs";
import { runApiRoute } from "../src/lib/api/route-boundary.mjs";
import * as errors from "../src/lib/api/error-response.mjs";
import * as owners from "../src/lib/auth/browser-sso-session.mjs";
import * as invitations from "../src/lib/auth/role-invitations.mjs";
import * as sessions from "../src/lib/auth/session.mjs";
import { authenticateHabiRequest } from "../src/lib/auth/session-guard.mjs";
import { createLoginTransaction } from "../src/lib/auth/login-transaction.mjs";
import { createSsoBrowserCallbackHandler } from "../src/lib/auth/sso-browser-callback.mjs";

const hmacKey = "synthetic-invitation-test-key-".repeat(2);
const origin = "https://habi.test";
async function route(path, modules) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    Buffer,
    URL,
    Response,
    Request,
    Headers,
    Date,
    process: { env: { HG_SESSION_HMAC_KEY: hmacKey, HG_APP_ORIGIN: origin } },
    require(name) {
      assert.ok(
        Object.hasOwn(modules, name),
        `Unexpected route import: ${name}`,
      );
      return modules[name];
    },
  });
  return exports;
}
function cookie(response, name) {
  return (
    response.headers
      .getSetCookie()
      .find((v) => v.startsWith(`${name}=`))
      ?.split(";")[0] ?? ""
  );
}

test("first-time invited identities can enter their assigned Habi role after the real wrapped SSO approval", {
  skip: !process.env.HABI_TEST_MONGODB_URI,
}, async (t) => {
  const uri = process.env.HABI_TEST_MONGODB_URI;
  assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost):/);
  const client = await new MongoClient(uri).connect();
  const db = client.db(
    `habi_invite_first_login_${randomUUID().replaceAll("-", "")}_test`,
  );
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  await runMigrations(db);
  await applySyntheticSeed(db);
  const claimRoute = await route("../src/app/api/invitations/claim/route.ts", {
    "node:crypto": crypto,
    "@/lib/api/route-boundary.mjs": { runApiRoute },
    "@/lib/api/error-response.mjs": errors,
    "@/lib/database/mongo": {
      getDatabase: async () => db,
      getMongoClient: async () => client,
    },
    "@/lib/auth/browser-sso-session.mjs": owners,
    "@/lib/auth/role-invitations.mjs": invitations,
    "@/lib/auth/session.mjs": sessions,
  });
  const meRoute = await route("../src/app/api/v1/me/route.ts", {
    "../../../../lib/api/error-response.mjs": errors,
    "../../../../lib/auth/runtime-auth.mjs": {
      runtimeSessionSettings: () => ({
        hmacKey,
        cookieName: "__Host-hg_session",
      }),
    },
    "../../../../lib/auth/session.mjs": sessions,
    "../../../../lib/api/runtime-route": {
      async runAuthorizedHabiRoute(request, operation, action) {
        return runApiRoute(request, operation, async () =>
          action({
            db,
            client,
            principal: await authenticateHabiRequest(db, request, { hmacKey }),
          }),
        );
      },
    },
  });
  async function signIn(label, returnTo) {
    const now = new Date(),
      subject = `new-invited-${label}-${randomUUID()}`,
      clientId = `habi-fixture-${randomUUID()}`;
    const tx = createLoginTransaction({ returnTo, now });
    await db.collection("auth_transactions").insertOne(tx.document);
    let permission = { status: "pending", role: "none", hasAccess: false },
      approvals = 0;
    const callback = createSsoBrowserCallbackHandler({
      db,
      hmacKey,
      now: () => now,
      config: {
        issuer: "https://sso.test",
        clientId,
        clientSecret: "test-only-secret",
        redirectUri: `${origin}/api/oauth/callback`,
      },
      // Only the identity-provider cryptographic stage is stubbed. The permission
      // client, callback/session, claim route, transaction and product read are real.
      oidc: {
        loadOidcDiscovery: async () => ({
          issuer: "https://sso.test",
          token_endpoint: "https://sso.test/api/oauth/token",
        }),
        exchangeAuthorizationCode: async () => ({
          idToken: "test-id-token",
          accessToken: "test-access-token",
        }),
        fetchSigningKeys: async () => [],
        verifyIdTokenWithKeyRefresh: async () => ({
          issuer: "https://sso.test",
          subject,
        }),
        fetchSsoUserinfo: async () => ({
          subject,
          name: "Synthetic invitee",
          emailVerified: true,
        }),
      },
      fetchImpl: async (url, init = {}) => {
        if (new URL(url).pathname === "/api/oauth/token")
          return Response.json({
            access_token: "test-machine-token",
            expires_in: 60,
          });
        if (init.method === "PUT") {
          approvals++;
          assert.deepEqual(JSON.parse(init.body), {
            role: "user",
            status: "approved",
          });
          permission = {
            userId: subject,
            clientId,
            role: "user",
            status: "approved",
            hasAccess: true,
          };
          return Response.json({ success: true, permission });
        }
        return Response.json(permission);
      },
    });
    const response = await callback(
      new Request(
        `${origin}/api/oauth/callback?code=test-code&state=${tx.state}`,
        { headers: { Cookie: `__Host-hg_auth_txn=${tx.binding}` } },
      ),
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), origin + returnTo);
    const ownerCookie = cookie(response, owners.SSO_OWNER_SESSION_COOKIE);
    assert.ok(ownerCookie);
    assert.equal(approvals, 1);
    assert.ok(
      !response.headers.getSetCookie().some((c) => /admin/i.test(c)),
      "ordinary app approval must not mint admin access",
    );
    return { ownerCookie, subject };
  }
  function claim(token, ownerCookie) {
    return claimRoute.POST(
      new Request(`${origin}/api/invitations/claim`, {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: ownerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      }),
    );
  }
  for (const role of ["player", "parent", "coach"])
    await t.test(
      `${role}: sign in, approve, claim, use product API, replay without duplicate membership`,
      async () => {
        const playerId =
          role === "coach"
            ? null
            : role === "player"
              ? `new-player-${randomUUID()}`
              : "seed-player-001";
        const issued = await invitations.issueRoleInvitation(
          db.collection("habi_role_invitations"),
          {
            tenantId: "seed-tenant-a",
            role,
            playerId,
            createdByIdentityHash: "a".repeat(64),
            hmacKey,
          },
        );
        const signedIn = await signIn(
          role,
          `/invite/claim?token=${issued.token}`,
        );
        const result = await claim(issued.token, signedIn.ownerCookie);
        assert.equal(result.status, 200, await result.clone().text());
        const productCookie = cookie(result, "__Host-hg_session");
        assert.ok(productCookie);
        const me = await meRoute.GET(
          new Request(`${origin}/api/v1/me`, {
            headers: { Cookie: productCookie },
          }),
        );
        assert.equal(me.status, 200, await me.clone().text());
        const body = await me.json();
        assert.equal(body.activeRole, role);
        assert.deepEqual(body.allowedRoles, [role]);
        assert.equal(body.memberships[0].playerId, playerId);
        assert.equal(
          (await claim(issued.token, signedIn.ownerCookie)).status,
          200,
        );
        assert.equal(
          await db
            .collection("memberships")
            .countDocuments({ actorId: body.actorId }),
          1,
        );
        assert.equal(
          await db.collection("identities").countDocuments({
            issuer: "https://sso.test",
            subject: signedIn.subject,
          }),
          1,
        );
      },
    );
  await t.test(
    "app approval alone, expired and revoked invitations still grant no product role",
    async () => {
      const signedIn = await signIn("denied", "/");
      const expired = await invitations.issueRoleInvitation(
        db.collection("habi_role_invitations"),
        {
          tenantId: "seed-tenant-a",
          role: "coach",
          playerId: null,
          createdByIdentityHash: "a".repeat(64),
          hmacKey,
          now: new Date(Date.now() - 8 * 86400000),
        },
      );
      const revoked = await invitations.issueRoleInvitation(
        db.collection("habi_role_invitations"),
        {
          tenantId: "seed-tenant-a",
          role: "coach",
          playerId: null,
          createdByIdentityHash: "a".repeat(64),
          hmacKey,
        },
      );
      await db
        .collection("habi_role_invitations")
        .updateOne(
          { id: revoked.invitation.id },
          { $set: { revokedAt: new Date().toISOString() } },
        );
      for (const token of [
        crypto.randomBytes(32).toString("base64url"),
        expired.token,
        revoked.token,
      ]) {
        const result = await claim(token, signedIn.ownerCookie);
        assert.equal(result.status, 404);
        assert.equal(cookie(result, "__Host-hg_session"), "");
      }
      assert.equal(
        await db
          .collection("identities")
          .countDocuments({ subject: signedIn.subject }),
        0,
      );
      assert.equal(
        (
          await meRoute.GET(
            new Request(`${origin}/api/v1/me`, {
              headers: { Cookie: signedIn.ownerCookie },
            }),
          )
        ).status,
        401,
      );
    },
  );
});
