import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { migrationChecksums } from "../src/lib/database/migrations/checksums.mjs";

test("migration checksum manifest matches each source file", async () => {
  for (const [id, entry] of Object.entries(migrationChecksums)) {
    const source = await readFile(
      new URL(`../src/lib/database/migrations/${entry.file}`, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(source).digest("hex"),
      entry.checksum,
      `${id} checksum must be updated when its migration source changes`,
    );
  }
});
