import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  isValidLegacyPayload,
  legacyOwnerSession,
  readLegacyState,
  writeLegacyState,
} from "../src/lib/legacy-mvp/store.mjs";

test("legacy session preserves browser owner mapping without exposing cookie token", () => {
  const issued = legacyOwnerSession();
  const token = issued.cookie.match(/=([a-f0-9]{64});/)[1];

  assert.equal(issued.existing, false);
  assert.equal(issued.owner, createHash("sha256").update(token).digest("hex"));
  assert.match(issued.cookie, /HttpOnly; Secure; SameSite=Lax/);

  const resumed = legacyOwnerSession(`other=x; __Host-habi-session=${token}`);
  assert.equal(resumed.existing, true);
  assert.equal(resumed.cookie, null);
  assert.equal(resumed.owner, issued.owner);
});

test("legacy owner cookie rejects malformed tokens and does not reuse their state", () => {
  const malformed = legacyOwnerSession(
    "__Host-habi-session=not-a-valid-owner-token",
  );
  assert.equal(malformed.existing, false);
  assert.notEqual(malformed.owner, legacyOwnerSession().owner);
});

test("legacy state payload validation enforces expected shape and limits", () => {
  assert.equal(isValidLegacyPayload({ app: {} }), true);
  assert.equal(isValidLegacyPayload({ app: [], chat: null }), false);
  assert.equal(isValidLegacyPayload([]), false);
  assert.equal(
    isValidLegacyPayload({ app: { notes: { $where: "unsafe" } } }),
    false,
  );
  assert.equal(
    isValidLegacyPayload({ app: { text: "x".repeat(20_001) } }),
    false,
  );
});

test("legacy state writes are revision-fenced and return conflicts without overwrite", async () => {
  const inserted = [];
  const collection = {
    async findOne(query, options) {
      assert.deepEqual(query, { _id: "owner-hash" });
      assert.deepEqual(options, {
        projection: { _id: 0, payload: 1, revision: 1 },
      });
      return null;
    },
    async insertOne(document) {
      inserted.push(document);
    },
    async updateOne(query, update) {
      assert.deepEqual(query, { _id: "owner-hash", revision: 3 });
      assert.equal(update.$inc.revision, 1);
      return { matchedCount: 1 };
    },
  };

  assert.deepEqual(await readLegacyState(collection, "owner-hash"), {
    payload: null,
    revision: 0,
  });
  assert.deepEqual(
    await writeLegacyState(collection, "owner-hash", 0, { app: {} }),
    { revision: 1 },
  );
  assert.equal(inserted[0]._id, "owner-hash");
  assert.deepEqual(
    await writeLegacyState(collection, "owner-hash", 3, { app: {} }),
    { revision: 4 },
  );
});

test("legacy state write reports duplicate initialization as a revision conflict", async () => {
  const duplicate = Object.assign(new Error("duplicate"), { code: 11000 });
  const collection = {
    async insertOne() {
      throw duplicate;
    },
  };
  assert.equal(
    await writeLegacyState(collection, "owner-hash", 0, { app: {} }),
    null,
  );
});
