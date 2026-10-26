import test from "node:test";
import assert from "node:assert/strict";
import {
  claimRoleInvitation,
  issueRoleInvitation,
  readRoleInvitation,
  revokeRoleInvitation,
} from "../src/lib/auth/role-invitations.mjs";

const key = "r".repeat(48);
const now = new Date("2026-10-26T12:00:00.000Z");

function matches(document, query) {
  return Object.entries(query).every(([keyName, expected]) => {
    const actual = document[keyName];
    if (expected && typeof expected === "object" && "$gt" in expected)
      return actual > expected.$gt;
    if (expected && typeof expected === "object" && "$ne" in expected)
      return actual !== expected.$ne;
    return actual === expected;
  });
}

function memoryCollection() {
  const docs = [];
  return {
    docs,
    async insertOne(document) {
      docs.push(structuredClone(document));
    },
    async findOne(query) {
      const doc = docs.find((candidate) => matches(candidate, query));
      return doc ? structuredClone(doc) : null;
    },
    async findOneAndUpdate(query, update) {
      const doc = docs.find((candidate) => matches(candidate, query));
      if (!doc) return null;
      Object.assign(doc, update.$set);
      return structuredClone(doc);
    },
    async updateOne(query, update) {
      const doc = docs.find((candidate) => matches(candidate, query));
      if (!doc) return { modifiedCount: 0 };
      Object.assign(doc, update.$set);
      return { modifiedCount: 1 };
    },
  };
}

test("role invitations persist only a keyed token hash and enforce exact role scopes", async () => {
  const collection = memoryCollection();
  const { token, invitation } = await issueRoleInvitation(collection, {
    tenantId: "habi-test",
    role: "parent",
    playerId: "player-one",
    createdByIdentityHash: "a".repeat(64),
    hmacKey: key,
    now,
  });
  assert.equal(collection.docs.length, 1);
  assert.equal("token" in collection.docs[0], false);
  assert.notEqual(collection.docs[0].tokenHash, token);
  assert.deepEqual(await readRoleInvitation(collection, token, key, now), {
    tenantId: "habi-test",
    role: "parent",
    expiresAt: invitation.expiresAt,
  });
  await assert.rejects(
    issueRoleInvitation(collection, {
      tenantId: "habi-test",
      role: "coach",
      playerId: "player-one",
      createdByIdentityHash: "a".repeat(64),
      hmacKey: key,
      now,
    }),
    { message: "ROLE_INVITATION_INPUT_INVALID" },
  );
});

test("invite claim is single-identity, single-use, and retry-safe for the claimant", async () => {
  const collection = memoryCollection();
  const { token } = await issueRoleInvitation(collection, {
    tenantId: "habi-test",
    role: "coach",
    createdByIdentityHash: "a".repeat(64),
    hmacKey: key,
    now,
  });
  const first = await claimRoleInvitation(collection, {
    token,
    identityHash: "b".repeat(64),
    hmacKey: key,
    now,
  });
  assert.equal(first.alreadyClaimed, false);
  assert.equal(first.claimedIdentityHash, "b".repeat(64));
  const retry = await claimRoleInvitation(collection, {
    token,
    identityHash: "b".repeat(64),
    hmacKey: key,
    now,
  });
  assert.equal(retry.alreadyClaimed, true);
  assert.equal(
    await claimRoleInvitation(collection, {
      token,
      identityHash: "c".repeat(64),
      hmacKey: key,
      now,
    }),
    null,
  );
});

test("expired and revoked invitations cannot be claimed", async () => {
  const collection = memoryCollection();
  const expired = await issueRoleInvitation(collection, {
    tenantId: "habi-test",
    role: "coach",
    createdByIdentityHash: "a".repeat(64),
    hmacKey: key,
    now: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
  });
  assert.equal(
    await readRoleInvitation(collection, expired.token, key, now),
    null,
  );
  assert.equal(
    await revokeRoleInvitation(collection, expired.invitation.id, now),
    false,
  );

  const active = await issueRoleInvitation(collection, {
    tenantId: "habi-test",
    role: "coach",
    createdByIdentityHash: "a".repeat(64),
    hmacKey: key,
    now,
  });
  assert.equal(
    await revokeRoleInvitation(collection, active.invitation.id, now),
    true,
  );
  assert.equal(
    await readRoleInvitation(collection, active.token, key, now),
    null,
  );
});
