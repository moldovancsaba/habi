import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalTestLogoutHandler,
  createLocalTestSessionHandler,
} from "../src/lib/auth/local-test-session-handler.mjs";
import { LOCAL_TEST_SESSION_COOKIE } from "../src/lib/auth/local-test-auth.mjs";

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((branch) => matches(document, branch));
    if (value && typeof value === "object" && "$gt" in value) {
      const left =
        document[key] instanceof Date
          ? document[key].getTime()
          : Date.parse(document[key]);
      const right =
        value.$gt instanceof Date ? value.$gt.getTime() : Date.parse(value.$gt);
      return left > right;
    }
    return document[key] === value;
  });
}

function fakeCollection(documents = []) {
  return {
    documents,
    async findOne(filter) {
      return structuredClone(
        documents.find((document) => matches(document, filter)) ?? null,
      );
    },
    async insertOne(document) {
      documents.push(structuredClone(document));
    },
    async updateOne(filter, update) {
      const document = documents.find((item) => matches(item, filter));
      if (!document) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(document, structuredClone(update.$set ?? {}));
      for (const [key, value] of Object.entries(update.$inc ?? {}))
        document[key] = (document[key] ?? 0) + value;
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

const env = {
  HG_ENVIRONMENT: "test",
  HG_APP_ORIGIN: "http://localhost:3000",
  HG_SYNTHETIC_DATA_ONLY: "true",
  HG_LOCAL_TEST_MODE: "true",
  HG_MIGRATION_ALLOW_LOCAL_TEST_DB: "true",
  HG_EXTERNAL_ENABLED: "false",
  HABI_TEST_MONGODB_URI: "mongodb://127.0.0.1:27017/?replicaSet=habiTestRs",
  HABI_TEST_MONGODB_DATABASE: "habi_test",
};

function testDb() {
  const state = {
    actors: fakeCollection([
      { id: "seed-a-parent-one", status: "active", accessRevision: 1 },
    ]),
    memberships: fakeCollection([
      {
        id: "seed-a-parent-one-membership",
        actorId: "seed-a-parent-one",
        tenantId: "seed-tenant-a",
        playerId: "seed-player-001",
        retentionPolicyId: "synthetic-retention-v1",
        role: "parent",
        status: "active",
      },
    ]),
    sessions: fakeCollection(),
  };
  return { state, collection: (name) => state[name] };
}

test("local test login issues a scoped synthetic parent session and CSRF token", async () => {
  const db = testDb();
  const handler = createLocalTestSessionHandler({ db, env });
  const response = await handler(
    new Request("http://localhost:3000/api/test/session", {
      method: "POST",
      headers: {
        Origin: env.HG_APP_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actorId: "seed-a-parent-one" }),
    }),
  );
  assert.equal(response.status, 201);
  assert.match(
    response.headers.get("set-cookie"),
    new RegExp(`^${LOCAL_TEST_SESSION_COOKIE}=`),
  );
  const body = await response.json();
  assert.equal(body.role, "parent");
  assert.equal(body.playerId, "seed-player-001");
  assert.equal(body.csrfToken.length > 32, true);
  assert.equal(db.state.sessions.documents.length, 1);
});

test("test login is invisible off localhost and rejects non-seeded identities", async () => {
  const db = testDb();
  const handler = createLocalTestSessionHandler({ db, env });
  const remote = await handler(
    new Request("https://habi.example/api/test/session", {
      method: "POST",
      headers: {
        Origin: "https://habi.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actorId: "seed-a-parent-one" }),
    }),
  );
  assert.equal(remote.status, 404);
  const unknown = await handler(
    new Request("http://localhost:3000/api/test/session", {
      method: "POST",
      headers: {
        Origin: env.HG_APP_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actorId: "arbitrary-actor" }),
    }),
  );
  assert.equal(unknown.status, 403);
  assert.equal(db.state.sessions.documents.length, 0);
});

test("local test logout revokes the issued session", async () => {
  const db = testDb();
  const login = createLocalTestSessionHandler({ db, env });
  const loginResponse = await login(
    new Request("http://localhost:3000/api/test/session", {
      method: "POST",
      headers: {
        Origin: env.HG_APP_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actorId: "seed-a-parent-one" }),
    }),
  );
  const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
  const logout = createLocalTestLogoutHandler({ db, env });
  const response = await logout(
    new Request("http://localhost:3000/api/test/session", {
      method: "DELETE",
      headers: { Origin: env.HG_APP_ORIGIN, Cookie: cookie },
    }),
  );
  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.ok(db.state.sessions.documents[0].revokedAt);
});
