import assert from "node:assert/strict";
import test from "node:test";
import { createLoginHandler } from "../src/lib/auth/login-handler.mjs";
import { AUTH_TRANSACTION_COOKIE } from "../src/lib/auth/login-transaction.mjs";

function memoryDb() {
  const documents = [];
  return {
    documents,
    collection(name) {
      assert.equal(name, "auth_transactions");
      return {
        async updateMany(filter, update) {
          for (const doc of documents) {
            if (
              doc.browserBindingHash === filter.browserBindingHash &&
              doc.consumedAt === null
            ) {
              doc.consumedAt = update.$set.consumedAt;
            }
          }
        },
        async insertOne(document) {
          documents.push(structuredClone(document));
        },
      };
    },
  };
}

function discoveryFetch(url, options) {
  assert.equal(
    String(url),
    "https://sso.example/.well-known/openid-configuration",
  );
  assert.equal(options.cache, "no-store");
  return Promise.resolve(
    Response.json({
      issuer: "https://sso.example",
      authorization_endpoint: "https://sso.example/api/oauth/authorize",
      token_endpoint: "https://sso.example/api/oauth/token",
      userinfo_endpoint: "https://sso.example/api/oauth/userinfo",
      jwks_uri: "https://sso.example/api/oauth/jwks",
      id_token_signing_alg_values_supported: ["RS256"],
    }),
  );
}

test("login route persists one-use server state and redirects with PKCE", async () => {
  const db = memoryDb();
  const binding = "b".repeat(43);
  const handler = createLoginHandler({
    db,
    config: {
      issuer: "https://sso.example",
      clientId: "habi-test",
      redirectUri: "https://habi.example/auth/callback",
    },
    fetchImpl: discoveryFetch,
    now: () => new Date("2026-10-25T12:00:00.000Z"),
  });
  const response = await handler(
    new Request("https://habi.example/auth/login?returnTo=%2Fplayers%2Fp1", {
      headers: { Cookie: `${AUTH_TRANSACTION_COOKIE}=${binding}` },
    }),
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("set-cookie"),
    `${AUTH_TRANSACTION_COOKIE}=${binding}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  );
  const location = new URL(response.headers.get("location"));
  assert.equal(location.pathname, "/api/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), "habi-test");
  assert.equal(
    location.searchParams.get("redirect_uri"),
    "https://habi.example/auth/callback",
  );
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    location.searchParams.get("scope"),
    "openid profile email offline_access",
  );
  assert.equal(db.documents.length, 1);
  assert.equal(db.documents[0].returnTo, "/players/p1");
  assert.equal(Object.hasOwn(db.documents[0], "state"), false);
  assert.equal(Object.hasOwn(db.documents[0], "verifier"), false);
});

test("login route creates a browser binding and discards an external return target", async () => {
  const db = memoryDb();
  const handler = createLoginHandler({
    db,
    config: {
      issuer: "https://sso.example",
      clientId: "habi-test",
      redirectUri: "https://habi.example/auth/callback",
    },
    fetchImpl: discoveryFetch,
  });
  const response = await handler(
    new Request(
      "https://habi.example/auth/login?returnTo=https%3A%2F%2Fevil.example",
    ),
  );

  assert.equal(response.status, 302);
  const cookie = response.headers.get("set-cookie");
  const binding = cookie.match(/__Host-hg_auth_txn=([^;]+)/)?.[1];
  assert.match(binding ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.equal(db.documents[0].returnTo, "/");
  assert.equal(db.documents[0].browserBindingHash.length, 64);
});

test("login route fails closed when SSO discovery is unavailable", async () => {
  const db = memoryDb();
  const handler = createLoginHandler({
    db,
    config: {
      issuer: "https://sso.example",
      clientId: "habi-test",
      redirectUri: "https://habi.example/auth/callback",
    },
    fetchImpl: async () => new Response("", { status: 503 }),
  });
  await assert.rejects(
    () => handler(new Request("https://habi.example/auth/login")),
    (error) => error.code === "DEPENDENCY_UNAVAILABLE",
  );
  assert.equal(db.documents.length, 0);
});
