import { MongoClient } from "mongodb";
import { runMigrations } from "../src/lib/database/migrations/runner.mjs";
import { readLocalTestTarget } from "./database-target.mjs";

async function main() {
  const config = readLocalTestTarget(process.env);
  const client = new MongoClient(config.uri, {
    appName: "habi-local-test-migration",
    connectTimeoutMS: 5_000,
    serverSelectionTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    const result = await runMigrations(client.db(config.database));
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
    `${safeErrors.has(error.message) ? error.message : "DATABASE_MIGRATION_FAILED"}\n`,
  );
  process.exitCode = 1;
});
