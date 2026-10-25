import { MongoClient } from "mongodb";
import { readLocalTestTarget } from "./database-target.mjs";

async function main() {
  const config = readLocalTestTarget(process.env);
  const parsed = new URL(config.uri);
  if (!config.database.endsWith("_test") || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  }
  const client = new MongoClient(config.uri, { appName: "habi-local-test-reset", connectTimeoutMS: 5_000, serverSelectionTimeoutMS: 5_000 });
  try {
    await client.connect();
    await client.db(config.database).dropDatabase();
    process.stdout.write("Local synthetic test database reset.\n");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const safe = new Set(["LOCAL_TEST_MIGRATION_ONLY", "LOCAL_TEST_DATABASE_REQUIRED"]);
  process.stderr.write(`${safe.has(error.message) ? error.message : "DATABASE_RESET_FAILED"}\n`);
  process.exitCode = 1;
});
