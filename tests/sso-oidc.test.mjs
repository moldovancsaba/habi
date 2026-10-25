import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  buildAuthorizationRedirect,
  exchangeAuthorizationCode,
  fetchAppPermission,
  fetchSigningKeys,
  fetchSsoUserinfo,
  loadOidcDiscovery,
  verifyIdToken,
  verifyIdTokenWithKeyRefresh,
} from "../src/lib/auth/sso-oidc.mjs";

const issuer = "https://sso.example";

function jwtFixture(overrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "test-kid",
    alg: "RS256",
    use: "sig",
  };
  const now = 1_800_000_000;
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-kid", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: "habi-client",
      sub: "sso-subject-1",
      exp: now + 300,
      iat: now,
      nonce: "nonce-value",
      email: "user@example.test",
      name: "Test User",
      email_verified: true,
      ...overrides,
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), privateKey).toString(
    "base64url",
  );
  return { token: `${input}.${signature}`, jwk, now };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("discovery pins issuer and rejects endpoints outside its HTTPS origin", async () => {
  const discovery = await loadOidcDiscovery(issuer, async () =>
    response({
      issuer,
      authorization_endpoint: `${issuer}/api/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ["RS256"],
    }),
  );
  assert.equal(discovery.issuer, issuer);
  await assert.rejects(
    loadOidcDiscovery(issuer, async () =>
      response({
        issuer,
        authorization_endpoint: `${issuer}/api/oauth/authorize`,
        token_endpoint: "https://attacker.example/token",
        userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        id_token_signing_alg_values_supported: ["RS256"],
      }),
    ),
    { message: "SSO_DISCOVERY_UNTRUSTED_ENDPOINT" },
  );
});

test("authorization URL uses S256 and code exchange uses JSON client_secret_post", async () => {
  const discovered = {
    issuer,
    authorization_endpoint: `${issuer}/api/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
  };
  const authorizationUrl = new URL(
    buildAuthorizationRedirect(discovered, {
      clientId: "habi-client",
      redirectUri: "https://habi.example/auth/callback",
      state: "state-value",
      nonce: "nonce-value",
      verifier: "v".repeat(43),
    }),
  );
  assert.equal(
    authorizationUrl.searchParams.get("code_challenge_method"),
    "S256",
  );
  assert.equal(authorizationUrl.searchParams.get("state"), "state-value");
  let request;
  const tokens = await exchangeAuthorizationCode(
    discovered,
    {
      clientId: "habi-client",
      clientSecret: "secret-only-in-body",
      redirectUri: "https://habi.example/auth/callback",
    },
    { code: "authorization-code", verifier: "v".repeat(43) },
    async (url, init) => {
      request = { url, init };
      return response({
        id_token: "signed-id-token",
        access_token: "user-access-token",
      });
    },
  );
  assert.equal(new URL(request.url).search, "");
  assert.equal(request.init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.init.body), {
    grant_type: "authorization_code",
    code: "authorization-code",
    client_id: "habi-client",
    client_secret: "secret-only-in-body",
    redirect_uri: "https://habi.example/auth/callback",
    code_verifier: "v".repeat(43),
  });
  assert.equal(tokens.accessToken, "user-access-token");
});

test("RS256 verifier enforces issuer, audience, nonce, expiry and issue time", () => {
  const fixture = jwtFixture();
  const options = {
    keys: [fixture.jwk],
    issuer,
    clientId: "habi-client",
    nonce: "nonce-value",
    nowSeconds: fixture.now,
  };
  assert.equal(verifyIdToken(fixture.token, options).subject, "sso-subject-1");
  assert.equal(
    verifyIdToken(fixture.token, { ...options, nonce: "wrong" }),
    null,
  );
  assert.equal(
    verifyIdToken(fixture.token, {
      ...options,
      issuer: "https://wrong.example",
    }),
    null,
  );
  assert.equal(
    verifyIdToken(fixture.token, { ...options, clientId: "other-client" }),
    null,
  );
  assert.equal(
    verifyIdToken(fixture.token, {
      ...options,
      nowSeconds: fixture.now + 1000,
    }),
    null,
  );
  assert.equal(
    verifyIdToken(fixture.token, {
      ...options,
      nowSeconds: fixture.now - 1000,
    }),
    null,
  );
  assert.equal(verifyIdToken(fixture.token, { ...options, keys: [] }), null);
  assert.equal(
    verifyIdToken(
      fixture.token.replace(
        /^([^.]+)\./,
        (_head) =>
          `${Buffer.from(JSON.stringify({ alg: "none", kid: "test-kid" })).toString("base64url")}.`,
      ),
      options,
    ),
    null,
  );
});

test("ID token verification refreshes JWKS once for an unknown signing key", async () => {
  const fixture = jwtFixture();
  const options = {
    keys: [],
    issuer,
    clientId: "habi-client",
    nonce: "nonce-value",
    nowSeconds: fixture.now,
  };
  let requests = 0;
  const verified = await verifyIdTokenWithKeyRefresh(
    fixture.token,
    options,
    { jwks_uri: `${issuer}/.well-known/jwks.json` },
    async (_url, init) => {
      requests += 1;
      assert.equal(init.cache, "no-store");
      assert.ok(init.signal);
      return response({ keys: [fixture.jwk] });
    },
  );
  assert.equal(verified.subject, "sso-subject-1");
  assert.equal(requests, 1);

  let invalidTokenRequests = 0;
  assert.equal(
    await verifyIdTokenWithKeyRefresh(
      "not-a-jwt",
      options,
      { jwks_uri: `${issuer}/.well-known/jwks.json` },
      async () => {
        invalidTokenRequests += 1;
        return response({ keys: [fixture.jwk] });
      },
    ),
    null,
  );
  assert.equal(invalidTokenRequests, 0);

  let missingKeyRequests = 0;
  assert.equal(
    await verifyIdTokenWithKeyRefresh(
      fixture.token,
      options,
      { jwks_uri: `${issuer}/.well-known/jwks.json` },
      async () => {
        missingKeyRequests += 1;
        return response({ keys: [] });
      },
    ),
    null,
  );
  assert.equal(missingKeyRequests, 1);
});

test("JWKS, userinfo and app permission calls are bounded, no-store and fail closed", async () => {
  const discovered = {
    issuer,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
  };
  assert.equal(
    (
      await fetchSigningKeys(discovered, async () =>
        response({ keys: [{ kid: "k1" }] }),
      )
    ).length,
    1,
  );
  const info = await fetchSsoUserinfo(
    discovered,
    "access-token",
    async (_url, init) => {
      assert.equal(init.headers.Authorization, "Bearer access-token");
      assert.equal(init.cache, "no-store");
      return response({
        sub: "sso-subject-1",
        email: "test@example.test",
        name: "Test",
        email_verified: true,
      });
    },
  );
  assert.equal(info.subject, "sso-subject-1");
  const permission = await fetchAppPermission(
    discovered,
    {
      subject: "sso-subject-1",
      clientId: "habi-client",
      accessToken: "access-token",
    },
    async (url, init) => {
      assert.equal(
        new URL(url).pathname,
        "/api/users/sso-subject-1/apps/habi-client/permissions",
      );
      assert.equal(init.headers.Authorization, "Bearer access-token");
      return response({ status: "approved", role: "user" });
    },
  );
  assert.deepEqual(permission, { status: "approved", role: "user" });
  await assert.rejects(
    fetchAppPermission(
      discovered,
      {
        subject: "sso-subject-1",
        clientId: "habi-client",
        accessToken: "access-token",
      },
      async () => response({ status: "pending", role: "user" }),
    ),
    { message: "SSO_PERMISSION_DENIED" },
  );
  await assert.rejects(
    fetchAppPermission(
      discovered,
      {
        subject: "sso-subject-1",
        clientId: "habi-client",
        accessToken: "access-token",
      },
      async () => {
        throw new TypeError("network unavailable");
      },
    ),
    { message: "SSO_DEPENDENCY_UNAVAILABLE" },
  );
});
