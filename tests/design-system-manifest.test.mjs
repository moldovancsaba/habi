import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Habi shared CSS is the pinned accepted prototype design system", async () => {
  const css = await readFile(
    fileURLToPath(new URL("../global.css", import.meta.url)),
  );
  const manifest = JSON.parse(
    await readFile(
      fileURLToPath(
        new URL("../design/design-system-manifest.json", import.meta.url),
      ),
      "utf8",
    ),
  );
  assert.equal(manifest.prototypeVersion, 101);
  assert.equal(
    manifest.sourceCommit,
    "ef6eea568961327026bddbbcea1faa2728e6006d",
  );
  assert.equal(createHash("sha256").update(css).digest("hex"), manifest.sha256);
});
