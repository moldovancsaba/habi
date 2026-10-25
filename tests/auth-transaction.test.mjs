import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthorizeUrl,
  consumeLoginTransaction,
  createLoginTransaction,
  safeReturnTo,
} from "../src/lib/auth/login-transaction.mjs";
import { validateContractDocument } from "../src/lib/database/contract-validation.mjs";

function memoryCollection() {
  const documents = [];
  return {
    documents,
    async updateMany(filter, update) {
      for (const document of documents) {
        if (
          document.browserBindingHash === filter.browserBindingHash &&
          document.consumedAt === null
        ) {
          document.consumedAt = update.$set.consumedAt;
        }
      }
    },
    async insertOne(document) {
      documents.push(structuredClone(document));
    },
    async findOneAndUpdate(filter, update) {
      const document = documents.find(
        (item) =>
          item.stateHash === filter.stateHash &&
          item.browserBindingHash === filter.browserBindingHash &&
          item.consumedAt === null &&
          item.expiresAt > filter.expiresAt.$gt,
      );
      if (!document) return null;
      document.consumedAt = update.$set.consumedAt;
      return structuredClone(document);
    },
  };
}

test("returnTo only accepts same-origin relative paths", () => {
  assert.equal(
    safeReturnTo("/players/p1?tab=timeline"),
    "/players/p1?tab=timeline",
  );
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ]) {
    assert.equal(safeReturnTo(value), "/");
  }
});

test("login transaction has S256 authorize parameters and no browser-stored verifier", () => {
  const transaction = createLoginTransaction({ returnTo: "/dashboard" });
  const url = new URL(
    buildAuthorizeUrl(
      {
        issuer: "https://sso.example",
        clientId: "habi-test",
        redirectUri: "https://habi.example/auth/callback",
      },
      transaction,
    ),
  );
  assert.equal(url.pathname, "/api/oauth/authorize");
  assert.equal(url.searchParams.get("state"), transaction.state);
  assert.equal(url.searchParams.get("nonce"), transaction.nonce);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("scope"),
    "openid profile email offline_access",
  );
  assert.notEqual(url.searchParams.get("code_challenge"), transaction.verifier);
  assert.ok(transaction.document.pkceVerifier);
  assert.equal(Object.hasOwn(transaction.document, "state"), false);
  assert.throws(
    () =>
      buildAuthorizeUrl(
        {
          issuer: "http://sso.example",
          clientId: "x",
          redirectUri: "https://habi.example/auth/callback",
        },
        transaction,
      ),
    /SSO_ISSUER_INVALID/,
  );
});

test("transaction schema rejects malformed or extra data", () => {
  const transaction = createLoginTransaction();
  assert.equal(
    validateContractDocument("auth_transactions", transaction.document),
    true,
  );
  assert.throws(
    () =>
      validateContractDocument("auth_transactions", {
        ...transaction.document,
        untrusted: true,
      }),
    /DOCUMENT_CONTRACT_INVALID/,
  );
});

test("state is browser-bound, expires, and can only be consumed once", async () => {
  const collection = memoryCollection();
  const now = new Date("2026-10-25T12:00:00.000Z");
  const transaction = createLoginTransaction({ now });
  await collection.insertOne(transaction.document);
  assert.equal(
    await consumeLoginTransaction(collection, {
      state: transaction.state,
      binding: "wrong",
      now,
    }),
    null,
  );
  const first = await consumeLoginTransaction(collection, {
    state: transaction.state,
    binding: transaction.binding,
    now,
  });
  assert.ok(first);
  assert.equal(
    await consumeLoginTransaction(collection, {
      state: transaction.state,
      binding: transaction.binding,
      now,
    }),
    null,
  );
  const expired = createLoginTransaction({
    now: new Date(now.getTime() - 11 * 60_000),
  });
  await collection.insertOne(expired.document);
  assert.equal(
    await consumeLoginTransaction(collection, {
      state: expired.state,
      binding: expired.binding,
      now,
    }),
    null,
  );
});

test("starting a later login for the same browser invalidates its prior transaction", async () => {
  const collection = memoryCollection();
  const now = new Date("2026-10-25T12:00:00.000Z");
  const binding = createLoginTransaction({ now }).binding;
  const first = createLoginTransaction({ binding, now });
  const second = createLoginTransaction({
    binding,
    now: new Date(now.getTime() + 1),
  });
  const { persistLoginTransaction } = await import(
    "../src/lib/auth/login-transaction.mjs"
  );
  await persistLoginTransaction(collection, first.document);
  await persistLoginTransaction(collection, second.document);
  assert.equal(
    await consumeLoginTransaction(collection, {
      state: first.state,
      binding,
      now,
    }),
    null,
  );
  assert.ok(
    await consumeLoginTransaction(collection, {
      state: second.state,
      binding,
      now,
    }),
  );
});
