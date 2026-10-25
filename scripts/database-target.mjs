import { readAtlasConfig } from "../src/lib/database/config.mjs";

export function readLocalTestTarget(env) {
  if (
    env.HG_ENVIRONMENT !== "test" ||
    env.HG_MIGRATION_ALLOW_LOCAL_TEST_DB !== "true"
  ) {
    throw new Error("LOCAL_TEST_MIGRATION_ONLY");
  }
  const config = readAtlasConfig({ ...env, HG_SYNTHETIC_DATA_ONLY: "false" });
  const parsed = new URL(config.uri);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (
    !allowedHosts.has(parsed.hostname) ||
    !config.database.endsWith("_test")
  ) {
    throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  }
  return config;
}
