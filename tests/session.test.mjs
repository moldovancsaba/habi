import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveCsrfToken,
  issueSession,
  sessionTokenHash,
  verifyCsrfToken,
} from "../src/lib/auth/session.mjs";

test("session stores only a keyed hash and derives a session-bound CSRF token", async () => {
  const inserted = [];
  const collection = {
    async insertOne(document) {
      inserted.push(document);
    },
  };
  const hmacKey = "test-only-session-key-material-0123456789";
  const now = new Date("2026-10-25T12:00:00.000Z");
  const issued = await issueSession(collection, {
    actorId: "actor-1",
    tenantId: "tenant-1",
    retentionPolicyId: "retention-v1",
    activeRole: "parent",
    playerId: "player-1",
    accessRevision: 1,
    hmacKey,
    now,
  });
  assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].tokenHash, sessionTokenHash(issued.token, hmacKey));
  assert.notEqual(inserted[0].tokenHash, issued.token);
  assert.equal(issued.csrfToken, deriveCsrfToken(issued.token, hmacKey));
  assert.equal(verifyCsrfToken(issued.token, issued.csrfToken, hmacKey), true);
  assert.equal(verifyCsrfToken(issued.token, "wrong-token", hmacKey), false);
  assert.equal(
    inserted[0].expiresAt.getTime() - now.getTime(),
    8 * 60 * 60 * 1000,
  );
  assert.equal(Object.hasOwn(inserted[0], "subject"), false);
  assert.equal(Object.hasOwn(inserted[0], "refreshToken"), false);
});

test("session rejects weak HMAC keys and CSRF token from a different session", async () => {
  assert.throws(() => sessionTokenHash("token", "short"), {
    message: "SESSION_HMAC_KEY_INVALID",
  });
  const key = "test-only-session-key-material-0123456789";
  assert.equal(verifyCsrfToken("one", deriveCsrfToken("two", key), key), false);
});
