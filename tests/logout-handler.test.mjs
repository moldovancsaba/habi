import assert from "node:assert/strict";
import test from "node:test";
import {
  createLogoutHandler,
  SESSION_COOKIE,
  CSRF_HEADER,
} from "../src/lib/auth/logout-handler.mjs";
import { issueSession } from "../src/lib/auth/session.mjs";

const hmacKey = "test-only-session-key-material-0123456789";

function sessionCollection() {
  const documents = [];
  return {
    documents,
    async insertOne(document) {
      documents.push(structuredClone(document));
    },
    async findOne(filter) {
      return structuredClone(
        documents.find((item) =>
          Object.entries(filter).every(([key, expected]) => {
            if (expected && typeof expected === "object" && "$gt" in expected) {
              return item[key] > expected.$gt;
            }
            return item[key] === expected;
          }),
        ) ?? null,
      );
    },
    async updateOne(filter, update) {
      const doc = documents.find((item) =>
        Object.entries(filter).every(
          ([key, expected]) => item[key] === expected,
        ),
      );
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(doc, structuredClone(update.$set));
      for (const [key, amount] of Object.entries(update.$inc ?? {})) {
        doc[key] = (doc[key] ?? 0) + amount;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

test("logout requires same-origin POST and the session-bound CSRF token", async () => {
  const sessions = sessionCollection();
  const now = new Date("2026-10-25T12:00:00.000Z");
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
  const credentialRevocations = [];
  const credentials = {
    async updateOne(filter, update) {
      credentialRevocations.push({ filter, update });
      return { modifiedCount: 1 };
    },
  };
  const handler = createLogoutHandler({
    db: {
      collection(name) {
        return name === "sessions" ? sessions : credentials;
      },
    },
    hmacKey,
    now: () => now,
  });

  const noOrigin = new Request("https://habi.example/auth/logout", {
    method: "POST",
    headers: { Cookie: `${SESSION_COOKIE}=${issued.token}` },
  });
  await assert.rejects(
    () => handler(noOrigin),
    (error) => error.code === "ACCESS_DENIED",
  );

  const wrongCsrf = new Request("https://habi.example/auth/logout", {
    method: "POST",
    headers: {
      Origin: "https://habi.example",
      Cookie: `${SESSION_COOKIE}=${issued.token}`,
      [CSRF_HEADER]: "wrong",
    },
  });
  await assert.rejects(
    () => handler(wrongCsrf),
    (error) => error.code === "ACCESS_DENIED",
  );
  assert.equal(sessions.documents[0].revokedAt, null);

  const response = await handler(
    new Request("https://habi.example/auth/logout", {
      method: "POST",
      headers: {
        Origin: "https://habi.example",
        Cookie: `${SESSION_COOKIE}=${issued.token}`,
        [CSRF_HEADER]: issued.csrfToken,
      },
    }),
  );
  assert.equal(response.status, 204);
  assert.equal(sessions.documents[0].revokedAt, now.toISOString());
  assert.equal(credentialRevocations.length, 1);
  assert.equal(credentialRevocations[0].filter.sessionId, issued.document.id);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
