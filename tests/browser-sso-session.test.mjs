import assert from "node:assert/strict";
import test from "node:test";
import {
  bindLegacyOwnerHandoff,
  authenticateSsoOwnerRequest,
  consumeLegacyOwnerHandoff,
  createLegacyOwnerHandoff,
  createSsoOwnerSession,
  readActiveSsoOwnerSession,
  resolveSsoOwnerLink,
  revokeSsoOwnerSession,
  SSO_OWNER_SESSION_COOKIE,
} from "../src/lib/auth/browser-sso-session.mjs";
import {
  AUTH_TRANSACTION_COOKIE,
  createLoginTransaction,
} from "../src/lib/auth/login-transaction.mjs";
import { createSsoBrowserCallbackHandler } from "../src/lib/auth/sso-browser-callback.mjs";

const key = "k".repeat(48);

function memoryCollection() {
  const docs = [];
  const matches = (doc, filter) =>
    Object.entries(filter).every(([k, v]) => {
      if (v && typeof v === "object" && "$gt" in v) return doc[k] > v.$gt;
      if (v && typeof v === "object" && "$ne" in v) return doc[k] !== v.$ne;
      if (v && typeof v === "object" && "$type" in v)
        return typeof doc[k] === v.$type;
      if (v === null) return doc[k] == null;
      return doc[k] === v;
    });
  return {
    docs,
    async insertOne(value) {
      if (
        docs.some(
          (doc) =>
            doc._id === value._id ||
            (value.ownerHash && doc.ownerHash === value.ownerHash) ||
            (value.tokenHash && doc.tokenHash === value.tokenHash),
        )
      ) {
        const error = new Error("duplicate");
        error.code = 11000;
        throw error;
      }
      docs.push(structuredClone(value));
      return { insertedId: value._id };
    },
    async findOne(filter) {
      return docs.find((doc) => matches(doc, filter)) ?? null;
    },
    async updateOne(filter, update) {
      const found = docs.find((doc) => matches(doc, filter));
      if (!found) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(found, update.$set);
      for (const [key, amount] of Object.entries(update.$inc ?? {})) {
        found[key] = (found[key] ?? 0) + amount;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async findOneAndUpdate(filter, update) {
      const found = docs.find((doc) => matches(doc, filter));
      if (!found) return null;
      Object.assign(found, update.$set);
      return structuredClone(found);
    },
  };
}

function memoryDb() {
  const collections = new Map();
  return {
    collection(name) {
      if (!collections.has(name)) collections.set(name, memoryCollection());
      return collections.get(name);
    },
  };
}

test("SSO identity can claim one verified legacy owner but cannot claim another", async () => {
  const links = memoryCollection();
  const oldOwner = "a".repeat(64);
  const first = await resolveSsoOwnerLink(links, {
    issuer: "https://sso.example",
    subject: "user-1",
    legacyOwnerHash: oldOwner,
    hmacKey: key,
  });
  assert.equal(first.ownerHash, oldOwner);
  assert.equal(first.linked, true);
  assert.equal(links.docs[0].linkMethod, "verified_legacy_cookie");
  assert.equal(JSON.stringify(links.docs[0]).includes("user-1"), false);

  const same = await resolveSsoOwnerLink(links, {
    issuer: "https://sso.example",
    subject: "user-1",
    hmacKey: key,
  });
  assert.equal(same.ownerHash, oldOwner);
  await assert.rejects(
    () =>
      resolveSsoOwnerLink(links, {
        issuer: "https://sso.example",
        subject: "user-1",
        legacyOwnerHash: "b".repeat(64),
        hmacKey: key,
      }),
    /SSO_OWNER_LINK_CONFLICT/,
  );
  await assert.rejects(
    () =>
      resolveSsoOwnerLink(links, {
        issuer: "https://sso.example",
        subject: "user-2",
        legacyOwnerHash: oldOwner,
        hmacKey: key,
      }),
    /SSO_OWNER_LINK_CONFLICT/,
  );
});

test("legacy owner handoff is browser-bound, short-lived and single-use", async () => {
  const handoffs = memoryCollection();
  const now = new Date("2026-10-26T10:00:00.000Z");
  const created = await createLegacyOwnerHandoff(handoffs, {
    ownerHash: "c".repeat(64),
    hmacKey: key,
    now,
  });
  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(handoffs.docs[0].tokenHash.includes(created.token), false);
  const binding = await bindLegacyOwnerHandoff(
    handoffs,
    created.token,
    key,
    now,
  );
  assert.match(binding, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(
    await bindLegacyOwnerHandoff(handoffs, created.token, key, now),
    null,
  );
  const consumed = await consumeLegacyOwnerHandoff(handoffs, binding, key, now);
  assert.equal(consumed.ownerHash, "c".repeat(64));
  assert.equal(consumed.handoffId, created.handoffId);
  assert.equal(
    await consumeLegacyOwnerHandoff(handoffs, binding, key, now),
    null,
  );

  const expired = await createLegacyOwnerHandoff(handoffs, {
    ownerHash: "d".repeat(64),
    hmacKey: key,
    now,
  });
  assert.equal(
    await bindLegacyOwnerHandoff(
      handoffs,
      expired.token,
      key,
      new Date(now.getTime() + 31 * 60_000),
    ),
    null,
  );
});

test("SSO browser sessions are opaque, idle-limited and revocable", async () => {
  const sessions = memoryCollection();
  const now = new Date("2026-10-26T10:00:00.000Z");
  const issued = await createSsoOwnerSession(sessions, {
    identityHash: "a".repeat(64),
    ownerHash: "b".repeat(64),
    displayName: " Moldován   Csaba ",
    hmacKey: key,
    now,
  });
  assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(sessions.docs[0].tokenHash.includes(issued.token), false);
  const db = {
    collection: (name) =>
      name === "habi_sso_owner_sessions" ? sessions : null,
  };
  const request = new Request("https://www.habigoal.com/api/app", {
    headers: { Cookie: `${SSO_OWNER_SESSION_COOKIE}=${issued.token}` },
  });
  const active = await authenticateSsoOwnerRequest(db, request, {
    hmacKey: key,
    now,
  });
  assert.equal(active.ownerHash, "b".repeat(64));
  assert.equal(active.displayName, "Moldován Csaba");
  assert.equal(
    await readActiveSsoOwnerSession(
      sessions,
      issued.token,
      key,
      new Date(now.getTime() + 31 * 60_000),
    ),
    null,
  );
  assert.equal(
    await revokeSsoOwnerSession(sessions, issued.token, key, now),
    true,
  );
  assert.equal(
    await readActiveSsoOwnerSession(sessions, issued.token, key, now),
    null,
  );
});

test("SSO callback creates a clean identity owner without importing browser-owned data", async () => {
  const db = memoryDb();
  const now = new Date("2026-10-26T10:00:00.000Z");
  const binding = "b".repeat(43);
  const transaction = createLoginTransaction({
    returnTo: "/",
    binding,
    now,
  });
  db.collection("auth_transactions").docs.push(
    structuredClone(transaction.document),
  );
  const handler = createSsoBrowserCallbackHandler({
    db,
    config: {
      issuer: "https://sso.example",
      clientId: "habi-client",
      clientSecret: "secret-for-test-only",
      redirectUri: "https://habigoal.com/api/oauth/callback",
    },
    hmacKey: key,
    now: () => now,
    oidc: {
      loadOidcDiscovery: async () => ({ issuer: "https://sso.example" }),
      exchangeAuthorizationCode: async (_d, _c, input) => {
        assert.equal(input.verifier, transaction.verifier);
        return {
          idToken: "opaque-test-token",
          accessToken: "access-test-token",
        };
      },
      fetchSigningKeys: async () => [],
      verifyIdTokenWithKeyRefresh: async () => ({
        issuer: "https://sso.example",
        subject: "owner-subject",
      }),
      fetchSsoUserinfo: async () => ({ subject: "owner-subject" }),
      fetchAppPermission: async () => ({ status: "approved", role: "admin" }),
    },
  });
  const request = new Request(
    `https://habigoal.com/api/oauth/callback?code=auth-code&state=${transaction.state}`,
    {
      headers: {
        Cookie: `__Host-hg_auth_txn=${binding}`,
      },
    },
  );
  const response = await handler(request);
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location")).pathname, "/");
  assert.equal(
    new URL(response.headers.get("location")).searchParams.get("linked"),
    null,
  );
  assert.match(response.headers.get("set-cookie"), /__Host-habi_sso=/);
  assert.match(response.headers.get("set-cookie"), /__Host-habi_admin=/);
  assert.equal(
    db.collection("habi_sso_owner_links").docs[0].linkMethod,
    "sso_identity",
  );
  assert.equal(db.collection("habi_sso_owner_sessions").docs.length, 1);
  assert.equal(
    "refreshToken" in db.collection("habi_sso_owner_sessions").docs[0],
    false,
  );
});

test("SSO callback fills a blank self-player name from verified userinfo", async () => {
  const db = memoryDb();
  const now = new Date("2026-10-26T10:00:00.000Z");
  const binding = "b".repeat(43);
  const transaction = createLoginTransaction({ returnTo: "/", binding, now });
  db.collection("auth_transactions").docs.push(
    structuredClone(transaction.document),
  );
  db.collection("identities").docs.push({
    issuer: "https://sso.example",
    subject: "owner-subject",
    actorId: "owner-actor",
  });
  db.collection("memberships").docs.push({
    actorId: "owner-actor",
    tenantId: "habi",
    playerId: "owner-player",
    role: "player",
    status: "active",
  });
  db.collection("players").docs.push({
    id: "owner-player",
    tenantId: "habi",
    actorId: "owner-actor",
    revision: 2,
  });
  const handler = createSsoBrowserCallbackHandler({
    db,
    config: {
      issuer: "https://sso.example",
      clientId: "habi-client",
      clientSecret: "secret-for-test-only",
      redirectUri: "https://habigoal.com/api/oauth/callback",
    },
    hmacKey: key,
    now: () => now,
    oidc: {
      loadOidcDiscovery: async () => ({ issuer: "https://sso.example" }),
      exchangeAuthorizationCode: async () => ({
        idToken: "opaque-test-token",
        accessToken: "access-test-token",
      }),
      fetchSigningKeys: async () => [],
      verifyIdTokenWithKeyRefresh: async () => ({
        issuer: "https://sso.example",
        subject: "owner-subject",
      }),
      fetchSsoUserinfo: async () => ({
        subject: "owner-subject",
        name: "  Moldován   Csaba  ",
      }),
      fetchAppPermission: async () => ({ status: "approved", role: "admin" }),
    },
  });
  const response = await handler(
    new Request(
      `https://habigoal.com/api/oauth/callback?code=auth-code&state=${transaction.state}`,
      { headers: { Cookie: `__Host-hg_auth_txn=${binding}` } },
    ),
  );
  assert.equal(response.status, 303);
  assert.equal(db.collection("players").docs[0].displayName, "Moldován Csaba");
  assert.equal(db.collection("players").docs[0].revision, 3);
});

test("failed SSO callback does not clear an existing owner session or link data", async () => {
  const db = memoryDb();
  const now = new Date("2026-10-26T10:00:00.000Z");
  const binding = "b".repeat(43);
  const transaction = createLoginTransaction({
    returnTo: "/admin",
    binding,
    now,
  });
  db.collection("auth_transactions").docs.push(
    structuredClone(transaction.document),
  );
  const handler = createSsoBrowserCallbackHandler({
    db,
    config: {
      issuer: "https://sso.example",
      clientId: "habi-client",
      clientSecret: "secret-for-test-only",
      redirectUri: "https://habigoal.com/api/oauth/callback",
    },
    hmacKey: key,
    now: () => now,
    oidc: {
      loadOidcDiscovery: async () => ({ issuer: "https://sso.example" }),
      exchangeAuthorizationCode: async () => ({
        idToken: "opaque-test-token",
        accessToken: "access-test-token",
      }),
      fetchSigningKeys: async () => [],
      verifyIdTokenWithKeyRefresh: async () => ({
        issuer: "https://sso.example",
        subject: "owner-subject",
      }),
      fetchSsoUserinfo: async () => ({ subject: "owner-subject" }),
      fetchAppPermission: async () => {
        throw new Error("SSO_PERMISSION_DENIED");
      },
    },
  });
  const request = new Request(
    `https://habigoal.com/api/oauth/callback?code=auth-code&state=${transaction.state}`,
    {
      headers: {
        Cookie: `${AUTH_TRANSACTION_COOKIE}=${binding}; ${SSO_OWNER_SESSION_COOKIE}=existing-session-token`,
      },
    },
  );
  const response = await handler(request);
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location")).pathname, "/admin");
  assert.equal(
    new URL(response.headers.get("location")).searchParams.get("signin"),
    "failed",
  );
  assert.equal(
    new URL(response.headers.get("location")).searchParams.get("reason"),
    "APP_PERMISSION_DENIED",
  );
  assert.match(response.headers.get("set-cookie"), /__Host-hg_auth_txn=;/);
  assert.doesNotMatch(response.headers.get("set-cookie"), /__Host-habi_sso=/);
  assert.equal(db.collection("habi_sso_owner_links").docs.length, 0);
  assert.equal(db.collection("habi_sso_owner_sessions").docs.length, 0);
});
