import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptRefreshCredential,
  encryptRefreshCredential,
} from "../src/lib/auth/refresh-credential.mjs";

const key = "test-key-material-that-is-long-enough-for-hkdf";
const scope = {
  issuer: "https://sso.example.test",
  clientId: "habi-test-client",
  actorId: "actor-test-1",
};

test("encrypted refresh credential is randomized and decrypts only in scope", () => {
  const first = encryptRefreshCredential("refresh-secret", scope, key);
  const second = encryptRefreshCredential("refresh-secret", scope, key);
  assert.notDeepEqual(first, second);
  assert.equal(first.algorithm, "A256GCM");
  assert.equal(decryptRefreshCredential(first, scope, key), "refresh-secret");
  assert.notEqual(JSON.stringify(first).includes("refresh-secret"), true);
  assert.throws(
    () =>
      decryptRefreshCredential(
        first,
        { ...scope, actorId: "another-actor" },
        key,
      ),
    { message: "REFRESH_CREDENTIAL_INVALID" },
  );
  assert.throws(
    () => decryptRefreshCredential(first, scope, `${key}-changed`),
    { message: "REFRESH_CREDENTIAL_INVALID" },
  );
});

test("refresh credential rejects malformed envelope, scope and weak key", () => {
  assert.throws(
    () => encryptRefreshCredential("refresh-secret", scope, "short"),
    { message: "REFRESH_ENCRYPTION_KEY_INVALID" },
  );
  assert.throws(
    () =>
      encryptRefreshCredential(
        "refresh-secret",
        { ...scope, actorId: "" },
        key,
      ),
    { message: "REFRESH_CREDENTIAL_SCOPE_INVALID" },
  );
  assert.throws(() => decryptRefreshCredential({ version: 2 }, scope, key), {
    message: "REFRESH_CREDENTIAL_INVALID",
  });
  const valid = encryptRefreshCredential("refresh-secret", scope, key);
  assert.throws(
    () => decryptRefreshCredential({ ...valid, ciphertext: "%%%" }, scope, key),
    { message: "REFRESH_CREDENTIAL_INVALID" },
  );
  assert.throws(
    () =>
      encryptRefreshCredential(
        "refresh-secret",
        { ...scope, issuer: "http://sso.example.test" },
        key,
      ),
    { message: "REFRESH_CREDENTIAL_SCOPE_INVALID" },
  );
});
