import assert from "node:assert/strict";
import test from "node:test";
import { authenticateHabiRequest } from "../src/lib/auth/session-guard.mjs";
import { issueSession } from "../src/lib/auth/session.mjs";

const hmacKey = "test-only-session-key-material-0123456789";

function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or")
      return expected.some((branch) => matches(document, branch));
    if (expected && typeof expected === "object" && "$gt" in expected) {
      return document[key] > expected.$gt;
    }
    return document[key] === expected;
  });
}

function collection(initial = []) {
  const documents = initial;
  return {
    documents,
    async insertOne(document) {
      documents.push(structuredClone(document));
    },
    async findOne(filter) {
      return structuredClone(
        documents.find((item) => matches(item, filter)) ?? null,
      );
    },
    async updateOne(filter, update) {
      const document = documents.find((item) => matches(item, filter));
      if (!document) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(document, structuredClone(update.$set ?? {}));
      for (const [key, amount] of Object.entries(update.$inc ?? {})) {
        document[key] = (document[key] ?? 0) + amount;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

async function fixture({
  membershipStatus = "active",
  accessRevision = 1,
} = {}) {
  const now = new Date("2026-10-25T12:00:00.000Z");
  const sessions = collection();
  const issued = await issueSession(sessions, {
    actorId: "actor-1",
    tenantId: "tenant-1",
    retentionPolicyId: "retention-v1",
    activeRole: "parent",
    playerId: "player-1",
    accessRevision: 1,
    hmacKey,
    now,
  });
  const state = {
    sessions,
    actors: collection([{ id: "actor-1", status: "active", accessRevision }]),
    memberships: collection([
      {
        actorId: "actor-1",
        tenantId: "tenant-1",
        retentionPolicyId: "retention-v1",
        role: "parent",
        playerId: "player-1",
        status: membershipStatus,
        expiresAt: null,
      },
    ]),
    tenants: collection([
      { id: "tenant-1", tenantId: "tenant-1", status: "active" },
    ]),
    players: collection([
      { id: "player-1", tenantId: "tenant-1", actorId: "player-1-actor" },
    ]),
    session_sso_credentials: collection(),
  };
  const db = { collection: (name) => state[name] };
  const request = (method = "GET", headers = {}) =>
    new Request("https://habi.example.test/v1/private", {
      method,
      headers: {
        Cookie: `__Host-hg_session=${issued.token}`,
        ...headers,
      },
    });
  return { db, state, issued, now, request };
}

test("request guard returns only current tenant scope and touches the session", async () => {
  const f = await fixture();
  const principal = await authenticateHabiRequest(f.db, f.request(), {
    hmacKey,
    now: new Date(f.now.getTime() + 1000),
  });
  assert.deepEqual(principal, {
    sessionId: f.issued.document.id,
    actorId: "actor-1",
    tenantId: "tenant-1",
    retentionPolicyId: "retention-v1",
    role: "parent",
    playerId: "player-1",
    accessRevision: 1,
  });
  assert.equal(
    f.state.sessions.documents[0].lastSeenAt,
    new Date(f.now.getTime() + 1000).toISOString(),
  );
});

test("request guard requires origin and session-bound CSRF for mutations", async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      authenticateHabiRequest(f.db, f.request("POST"), {
        hmacKey,
        now: f.now,
      }),
    (error) => error.code === "ACCESS_DENIED",
  );
  assert.equal(
    (
      await authenticateHabiRequest(
        f.db,
        f.request("POST", {
          Origin: "https://habi.example.test",
          "x-habi-csrf": f.issued.csrfToken,
        }),
        { hmacKey, now: f.now },
      )
    ).actorId,
    "actor-1",
  );
});

test("request guard revokes a session when its membership is no longer active", async () => {
  const f = await fixture({ membershipStatus: "revoked" });
  await assert.rejects(
    () => authenticateHabiRequest(f.db, f.request(), { hmacKey, now: f.now }),
    (error) => error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.equal(f.state.sessions.documents[0].revokedAt, f.now.toISOString());
});

test("request guard revokes a session after actor access revision changes", async () => {
  const f = await fixture({ accessRevision: 2 });
  await assert.rejects(
    () => authenticateHabiRequest(f.db, f.request(), { hmacKey, now: f.now }),
    (error) => error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.equal(f.state.sessions.documents[0].revokedAt, f.now.toISOString());
});
