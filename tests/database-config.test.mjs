import assert from "node:assert/strict";
import test from "node:test";
import { readAtlasConfig } from "../src/lib/database/config.mjs";
import { evaluateDatabaseReadiness } from "../src/lib/database/readiness.mjs";

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
