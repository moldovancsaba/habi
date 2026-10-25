import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COLLECTIONS,
  COLLECTION_SCHEMA,
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
  assert.equal(Object.keys(COLLECTION_SCHEMA).length, COLLECTIONS.length);
  assert.deepEqual(
    Object.keys(COLLECTION_SCHEMA).sort(),
    [...COLLECTIONS].sort(),
  );
});

test("runtime validation rejects a document outside the accepted contract", () => {
  assert.throws(
    () => validateContractDocument("players", { id: "player-without-tenant" }),
    /DOCUMENT_CONTRACT_INVALID/,
  );
});
