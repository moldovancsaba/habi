import { MongoClient } from "mongodb";
import { applySyntheticSeed } from "../src/lib/database/seed.mjs";
import { runMigrations } from "../src/lib/database/migrations/runner.mjs";
import { readLocalTestTarget } from "./database-target.mjs";

async function main() {
  const config = readLocalTestTarget(process.env);
  const client = new MongoClient(config.uri, {
    appName: "habi-local-test-seed",
    connectTimeoutMS: 5_000,
    serverSelectionTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    const db = client.db(config.database);
    await runMigrations(db);
    const result = await applySyntheticSeed(db);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const safeErrors = new Set([
    "LOCAL_TEST_MIGRATION_ONLY",
    "LOCAL_TEST_DATABASE_REQUIRED",
  ]);
  process.stderr.write(
    `${safeErrors.has(error.message) ? error.message : "DATABASE_SEED_FAILED"}\n`,
  );
  process.exitCode = 1;
});
