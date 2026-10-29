import assert from "node:assert/strict";
import test from "node:test";
import { readAtlasConfig } from "../src/lib/database/config.mjs";
import { evaluateDatabaseReadiness } from "../src/lib/database/readiness.mjs";
import { dependencyUnavailableError } from "../src/lib/database/dependency-error.mjs";
import { toHabiErrorResponse } from "../src/lib/api/error-response.mjs";
import { readLocalTestTarget } from "../scripts/database-target.mjs";
import { hashRequestBody } from "../src/lib/database/idempotent-command.mjs";

test("accepts configured Atlas settings as an immutable object", () => {
  const config = readAtlasConfig({
    HG_ATLAS_URI:
      "mongodb+srv://account:secret@example.mongodb.net/?retryWrites=true",
    HG_ATLAS_DATABASE: "habi",
    HG_SYNTHETIC_DATA_ONLY: "false",
  });

  assert.deepEqual(config, {
    uri: "mongodb+srv://account:secret@example.mongodb.net/?retryWrites=true",
    database: "habi",
  });
  assert.equal(Object.isFrozen(config), true);
});

test("accepts only the explicitly gated localhost synthetic test database", () => {
  assert.deepEqual(
    readAtlasConfig({
      HG_ENVIRONMENT: "test",
      HG_LOCAL_TEST_MODE: "true",
      HG_SYNTHETIC_DATA_ONLY: "true",
      HG_MIGRATION_ALLOW_LOCAL_TEST_DB: "true",
      HABI_TEST_MONGODB_URI: "mongodb://127.0.0.1:27017/?replicaSet=habiTestRs",
      HABI_TEST_MONGODB_DATABASE: "habi_workflow_test",
    }),
    {
      uri: "mongodb://127.0.0.1:27017/?replicaSet=habiTestRs",
      database: "habi_workflow_test",
    },
  );
  assert.throws(
    () =>
      readAtlasConfig({
        HG_ENVIRONMENT: "test",
        HG_LOCAL_TEST_MODE: "true",
        HG_SYNTHETIC_DATA_ONLY: "true",
        HG_MIGRATION_ALLOW_LOCAL_TEST_DB: "true",
        HABI_TEST_MONGODB_URI: "mongodb+srv://cluster.example",
        HABI_TEST_MONGODB_DATABASE: "habi_workflow_test",
      }),
    /LOCAL_TEST_DATABASE_REQUIRED/,
  );
});

test("rejects missing, synthetic, malformed, or unsafe database configuration", () => {
  assert.throws(() => readAtlasConfig({}), { message: "ATLAS_CONFIG_MISSING" });
  assert.throws(
    () =>
      readAtlasConfig({
        HG_ATLAS_URI: "mongodb://localhost:27017",
        HG_ATLAS_DATABASE: "habi",
        HG_SYNTHETIC_DATA_ONLY: "true",
      }),
    { message: "ATLAS_DISABLED_FOR_SYNTHETIC_ENV" },
  );
  assert.throws(
    () =>
      readAtlasConfig({
        HG_ATLAS_URI: "https://example.test",
        HG_ATLAS_DATABASE: "habi",
      }),
    { message: "ATLAS_CONFIG_INVALID" },
  );
  assert.throws(
    () =>
      readAtlasConfig({
        HG_ATLAS_URI: "mongodb://localhost",
        HG_ATLAS_DATABASE: "habi/other",
      }),
    { message: "ATLAS_CONFIG_INVALID" },
  );
});

test("readiness reports dependency outages without leaking driver errors", async () => {
  const failed = await evaluateDatabaseReadiness(async () => {
    throw new Error("mongodb://user:secret@cluster.invalid");
  });

  assert.deepEqual(failed, {
    status: 503,
    body: { ok: false, service: "habi", error: "DEPENDENCY_UNAVAILABLE" },
  });

  const healthy = await evaluateDatabaseReadiness(async () => undefined);
  assert.deepEqual(healthy, {
    status: 200,
    body: { ok: true, service: "habi" },
  });
});

test("database tooling accepts only explicitly enabled localhost test databases", () => {
  const local = readLocalTestTarget({
    HG_ENVIRONMENT: "test",
    HG_MIGRATION_ALLOW_LOCAL_TEST_DB: "true",
    HG_ATLAS_URI: "mongodb://127.0.0.1:27099/?replicaSet=habiTestRs",
    HG_ATLAS_DATABASE: "habi_ci_test",
  });
  assert.equal(local.database, "habi_ci_test");
  assert.throws(
    () =>
      readLocalTestTarget({
        HG_ENVIRONMENT: "production",
        HG_MIGRATION_ALLOW_LOCAL_TEST_DB: "true",
        HG_ATLAS_URI: "mongodb://127.0.0.1:27099",
        HG_ATLAS_DATABASE: "habi_prod_test",
      }),
    { message: "LOCAL_TEST_MIGRATION_ONLY" },
  );
  assert.throws(
    () =>
      readLocalTestTarget({
        HG_ENVIRONMENT: "test",
        HG_MIGRATION_ALLOW_LOCAL_TEST_DB: "true",
        HG_ATLAS_URI: "mongodb+srv://cluster.example.net",
        HG_ATLAS_DATABASE: "habi_test",
      }),
    { message: "LOCAL_TEST_DATABASE_REQUIRED" },
  );
  assert.throws(
    () =>
      readLocalTestTarget({
        HG_ENVIRONMENT: "test",
        HG_MIGRATION_ALLOW_LOCAL_TEST_DB: "true",
        HG_ATLAS_URI: "mongodb://127.0.0.1:27099",
        HG_ATLAS_DATABASE: "habi_production",
      }),
    { message: "LOCAL_TEST_DATABASE_REQUIRED" },
  );
});

test("idempotency request hashing canonicalizes JSON keys and rejects non-JSON values", () => {
  assert.equal(
    hashRequestBody({ b: 2, a: { y: true, x: null } }),
    hashRequestBody({ a: { x: null, y: true }, b: 2 }),
  );
  assert.throws(() => hashRequestBody({ value: undefined }), {
    message: "IDEMPOTENCY_BODY_NOT_JSON",
  });
  assert.throws(() => hashRequestBody(new Date()), {
    message: "IDEMPOTENCY_BODY_NOT_JSON",
  });
});

test("a database connection failure answers 503 and keeps the bare message", async () => {
  const error = dependencyUnavailableError();
  assert.equal(error.message, "DEPENDENCY_UNAVAILABLE");
  assert.equal(error.code, "DEPENDENCY_UNAVAILABLE");

  const response = toHabiErrorResponse(error, { requestId: "req-1" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    code: "DEPENDENCY_UNAVAILABLE",
    requestId: "req-1",
    retryAfter: null,
  });
});
