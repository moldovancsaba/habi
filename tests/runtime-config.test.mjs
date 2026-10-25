import assert from "node:assert/strict";
import test from "node:test";
import {
  validateRuntimeConfig,
  validateRuntimeStartup,
} from "../src/lib/runtime-config.mjs";

const local = {
  HG_ENVIRONMENT: "development",
  HG_APP_ORIGIN: "http://localhost:3000",
  HG_SYNTHETIC_DATA_ONLY: "true",
  HG_EXTERNAL_ENABLED: "false",
};

const hosted = {
  HG_ENVIRONMENT: "test",
  HG_APP_ORIGIN: "https://habi-test.example",
  HG_SYNTHETIC_DATA_ONLY: "false",
  HG_EXTERNAL_ENABLED: "false",
  HG_ATLAS_URI: "mongodb+srv://example.invalid/db",
  HG_ATLAS_DATABASE: "habi_test",
  HG_SSO_ISSUER: "https://sso.example",
  HG_SSO_CLIENT_ID: "test-client",
  HG_SSO_CLIENT_SECRET: "x".repeat(40),
  HG_SSO_REDIRECT_URI: "https://habi-test.example/auth/callback",
  HG_SESSION_HMAC_KEY: "s".repeat(40),
  HG_REFRESH_ENCRYPTION_KEY: "r".repeat(40),
  HG_CURSOR_HMAC_KEY: "c".repeat(40),
  HG_WORKER_SERVICE_ID: "habi-test-worker",
  HG_WORKER_BEARER_SHA256: "a".repeat(64),
};

test("allows only synthetic localhost configuration for development", () => {
  assert.equal(validateRuntimeConfig(local).syntheticOnly, true);
  assert.throws(
    () =>
      validateRuntimeConfig({
        ...local,
        HG_APP_ORIGIN: "https://public.example",
      }),
    /localhost origin/,
  );
  assert.throws(
    () => validateRuntimeConfig({ ...local, HG_ATLAS_URI: "mongodb+srv://x" }),
    /must not receive service secrets/,
  );
  assert.throws(
    () =>
      validateRuntimeConfig({
        ...local,
        HG_WORKER_CLIENT_SECRET: "worker-placeholder",
      }),
    /forbidden in the web runtime/,
  );
});

test("allows an explicitly gated localhost synthetic workflow test database", () => {
  const config = validateRuntimeConfig({
    ...local,
    HG_ENVIRONMENT: "test",
    HG_APP_ORIGIN: "http://localhost:3000",
    HG_SYNTHETIC_DATA_ONLY: "true",
    HG_LOCAL_TEST_MODE: "true",
    HG_MIGRATION_ALLOW_LOCAL_TEST_DB: "true",
    HABI_TEST_MONGODB_URI: "mongodb://127.0.0.1:27017/?replicaSet=habiTestRs",
    HABI_TEST_MONGODB_DATABASE: "habi_workflow_test",
  });
  assert.equal(config.localTestMode, true);
  assert.equal(config.syntheticOnly, true);
});

test("local workflow test mode rejects hosted databases and secrets", () => {
  const valid = {
    ...local,
    HG_ENVIRONMENT: "test",
    HG_APP_ORIGIN: "http://localhost:3000",
    HG_SYNTHETIC_DATA_ONLY: "true",
    HG_LOCAL_TEST_MODE: "true",
    HG_MIGRATION_ALLOW_LOCAL_TEST_DB: "true",
    HABI_TEST_MONGODB_URI: "mongodb://127.0.0.1:27017/?replicaSet=habiTestRs",
    HABI_TEST_MONGODB_DATABASE: "habi_workflow_test",
  };
  assert.throws(
    () =>
      validateRuntimeConfig({
        ...valid,
        HG_ATLAS_URI: "mongodb+srv://atlas.test",
      }),
    /must not receive hosted secrets/,
  );
  assert.throws(
    () =>
      validateRuntimeConfig({
        ...valid,
        HABI_TEST_MONGODB_URI: "mongodb+srv://cluster.example",
      }),
    /localhost _test database/,
  );
  assert.throws(
    () =>
      validateRuntimeConfig({
        ...valid,
        HABI_TEST_MONGODB_DATABASE: "habi_prod",
      }),
    /localhost _test database/,
  );
});

test("fails closed when hosted runtime values are incomplete", () => {
  assert.throws(
    () => validateRuntimeConfig({ ...hosted, HG_ATLAS_URI: "" }),
    /HG_ATLAS_URI/,
  );
  assert.throws(
    () => validateRuntimeConfig({ ...hosted, HG_SYNTHETIC_DATA_ONLY: "true" }),
    /false/,
  );
});

test("requires valid Atlas and same-origin HTTPS SSO callback", () => {
  assert.equal(validateRuntimeConfig(hosted).environment, "test");
  assert.throws(
    () =>
      validateRuntimeConfig({ ...hosted, HG_ATLAS_URI: "https://db.example" }),
    /Atlas URI/,
  );
  assert.throws(
    () =>
      validateRuntimeConfig({
        ...hosted,
        HG_SSO_REDIRECT_URI: "https://attacker.example/auth/callback",
      }),
    /must match/,
  );
  assert.throws(
    () => validateRuntimeConfig({ ...hosted, HG_CURSOR_HMAC_KEY: "short" }),
    /32 bytes/,
  );
});

test("keeps external provider disabled and skips validation only during build", () => {
  assert.throws(
    () => validateRuntimeConfig({ ...local, HG_EXTERNAL_ENABLED: "true" }),
    /External AI is disabled/,
  );
  assert.throws(
    () =>
      validateRuntimeConfig({
        ...local,
        HG_EXTERNAL_API_KEY: "provider-placeholder",
      }),
    /forbidden in the web runtime/,
  );
  assert.doesNotThrow(() =>
    validateRuntimeStartup({ NEXT_PHASE: "phase-production-build" }),
  );
});
