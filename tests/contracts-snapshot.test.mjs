import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COLLECTIONS,
  COLLECTION_SCHEMA,
  INTERNAL_COLLECTIONS,
  INTERNAL_RUNTIME_COLLECTIONS,
} from "../src/lib/database/migration-schema.mjs";
import { validateContractDocument } from "../src/lib/database/contract-validation.mjs";

test("runtime contract snapshot is pinned and covers every persisted collection", async () => {
  const [manifestBytes, sourceBytes] = await Promise.all([
    readFile(new URL("../contracts/source-manifest.json", import.meta.url)),
    readFile(
      new URL("../contracts/domain-schemas.source.json", import.meta.url),
    ),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const digest = createHash("sha256").update(sourceBytes).digest("hex");
  assert.equal(manifest.artifact, "domain-schemas.source.json");
  assert.equal(manifest.sha256, digest);
  assert.equal(
    Object.keys(COLLECTION_SCHEMA).length,
    COLLECTIONS.length + INTERNAL_RUNTIME_COLLECTIONS.length,
  );
  assert.equal(COLLECTION_SCHEMA.auth_transactions, null);
  assert.equal(COLLECTION_SCHEMA.session_sso_credentials, null);
  assert.equal(INTERNAL_COLLECTIONS.includes("session_sso_credentials"), false);
  assert.equal(
    Object.values(COLLECTION_SCHEMA).filter(Boolean).length,
    COLLECTIONS.length,
  );
  assert.deepEqual(
    Object.entries(COLLECTION_SCHEMA)
      .filter(([, definition]) => definition)
      .map(([collection]) => collection)
      .sort(),
    [...COLLECTIONS].sort(),
  );
});

test("runtime validation rejects a document outside the accepted contract", () => {
  assert.throws(
    () => validateContractDocument("players", { id: "player-without-tenant" }),
    /DOCUMENT_CONTRACT_INVALID/,
  );
});
