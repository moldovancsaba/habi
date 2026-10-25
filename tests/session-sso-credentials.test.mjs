import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionSsoCredential,
  getSessionAccessToken,
  readSessionSsoCredential,
  revokeSessionSsoCredential,
} from "../src/lib/auth/session-sso-credentials.mjs";
import { validateContractDocument } from "../src/lib/database/contract-validation.mjs";

const encryptionKey =
  "test-refresh-encryption-key-with-strong-length-0123456789";

function copy(value) {
  return structuredClone(value);
}

function matches(document, filter) {
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "$or") {
      if (!expected.some((branch) => matches(document, branch))) return false;
    } else if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      !(expected instanceof Date)
    ) {
      if ("$gt" in expected && !(document[key] > expected.$gt)) return false;
      if ("$lte" in expected && !(document[key] <= expected.$lte)) return false;
    } else if (document[key] !== expected) {
      return false;
    }
  }
  return true;
}

function memoryCollection() {
  const documents = [];
  return {
    documents,
    async insertOne(document) {
      if (documents.some((item) => item.sessionId === document.sessionId)) {
        const error = new Error("duplicate session");
        error.code = 11000;
        throw error;
      }
      documents.push(copy(document));
      return { insertedId: document.id };
    },
    async findOne(filter) {
      return copy(documents.find((item) => matches(item, filter)) ?? null);
    },
    async findOneAndUpdate(filter, update) {
      const document = documents.find((item) => matches(item, filter));
      if (!document) return null;
      Object.assign(document, copy(update.$set ?? {}));
      if (update.$inc) {
        for (const [key, amount] of Object.entries(update.$inc)) {
          document[key] = (document[key] ?? 0) + amount;
        }
      }
      return copy(document);
    },
    async updateOne(filter, update) {
      const document = documents.find((item) => matches(item, filter));
      if (!document) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(document, copy(update.$set ?? {}));
      if (update.$inc) {
        for (const [key, amount] of Object.entries(update.$inc)) {
          document[key] = (document[key] ?? 0) + amount;
        }
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

async function fixture({ expiresIn = 3600 } = {}) {
  const collection = memoryCollection();
  const now = new Date();
  const session = {
    id: "a".repeat(48),
    actorId: "actor-one",
    expiresAt: new Date(now.getTime() + 8 * 60 * 60_000),
  };
  const credential = await createSessionSsoCredential(collection, {
    session,
    issuer: "https://sso.example.test",
    clientId: "habi-test-client",
    accessToken: "access-token-original",
    refreshToken: "refresh-token-original",
    expiresIn,
    encryptionKey,
    now,
  });
  return { collection, session, credential, now };
}

test("session SSO credential is encrypted, strict, scoped, and session-expiring", async () => {
  const { collection, session, credential, now } = await fixture();
  assert.equal(
    validateContractDocument("session_sso_credentials", credential),
    true,
  );
  assert.equal(credential.accessCredential.purpose, "access");
  assert.equal(credential.refreshCredential.purpose, "refresh");
  assert.equal(
    JSON.stringify(credential).includes("access-token-original"),
    false,
  );
  assert.equal(
    JSON.stringify(credential).includes("refresh-token-original"),
    false,
  );
  assert.equal(
    credential.expiresAt.toISOString(),
    session.expiresAt.toISOString(),
  );
  assert.deepEqual(
    await readSessionSsoCredential(collection, { sessionId: session.id, now }),
    credential,
  );
  assert.throws(
    () =>
      validateContractDocument("session_sso_credentials", {
        ...credential,
        plaintextRefreshToken: "forbidden",
      }),
    /DOCUMENT_CONTRACT_INVALID/,
  );
});

test("expired access token refreshes and atomically rotates encrypted credentials", async () => {
  const { collection, session, now } = await fixture({ expiresIn: 1 });
  const current = collection.documents[0];
  current.accessTokenExpiresAt = new Date(now.getTime() - 1);
  let refreshCalls = 0;
  const token = await getSessionAccessToken({
    collection,
    sessionId: session.id,
    encryptionKey,
    now: () => new Date(now.getTime() + 10),
    refresh: async (oldRefreshToken) => {
      refreshCalls += 1;
      assert.equal(oldRefreshToken, "refresh-token-original");
      return {
        accessToken: "access-token-rotated",
        refreshToken: "refresh-token-rotated",
        expiresIn: 3600,
      };
    },
  });
  assert.equal(token, "access-token-rotated");
  assert.equal(refreshCalls, 1);
  assert.equal(current.revision, 2);
  assert.equal(current.refreshLeaseId, null);
  assert.equal(
    current.accessCredential.ciphertext.includes("access-token-rotated"),
    false,
  );
  const reused = await getSessionAccessToken({
    collection,
    sessionId: session.id,
    encryptionKey,
    now: () => new Date(now.getTime() + 11),
    refresh: async () => {
      throw new Error("valid access token should be reused");
    },
  });
  assert.equal(reused, "access-token-rotated");
});

test("concurrent requests share one refresh lease and use the rotated access token", async () => {
  const { collection, session, now } = await fixture({ expiresIn: 1 });
  collection.documents[0].accessTokenExpiresAt = new Date(now.getTime() - 1);
  let refreshCalls = 0;
  const refresh = async () => {
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      accessToken: "access-token-single-refresh",
      refreshToken: "refresh-token-single-refresh",
      expiresIn: 3600,
    };
  };
  const call = () =>
    getSessionAccessToken({
      collection,
      sessionId: session.id,
      encryptionKey,
      now: () => new Date(now.getTime() + 10),
      refresh,
      leaseMs: 2000,
      waitMs: 1000,
      pollMs: 10,
    });
  const results = await Promise.all([call(), call()]);
  assert.deepEqual(results, [
    "access-token-single-refresh",
    "access-token-single-refresh",
  ]);
  assert.equal(refreshCalls, 1);
  assert.equal(collection.documents[0].revision, 2);
});

test("SSO refresh rejection revokes the credential and logout deletes its authority", async () => {
  const { collection, session, now } = await fixture({ expiresIn: 1 });
  collection.documents[0].accessTokenExpiresAt = new Date(now.getTime() - 1);
  await assert.rejects(
    getSessionAccessToken({
      collection,
      sessionId: session.id,
      encryptionKey,
      now: () => new Date(now.getTime() + 10),
      refresh: async () => {
        throw new Error("SSO_REFRESH_REJECTED");
      },
    }),
    { message: "SSO_REFRESH_REJECTED" },
  );
  assert.ok(collection.documents[0].revokedAt instanceof Date);
  assert.equal(
    await readSessionSsoCredential(collection, {
      sessionId: session.id,
      now: new Date(now.getTime() + 20),
    }),
    null,
  );

  const next = await fixture();
  assert.equal(
    await revokeSessionSsoCredential(next.collection, {
      sessionId: next.session.id,
      now: next.now,
    }),
    true,
  );
  assert.equal(
    await readSessionSsoCredential(next.collection, {
      sessionId: next.session.id,
      now: next.now,
    }),
    null,
  );
});
