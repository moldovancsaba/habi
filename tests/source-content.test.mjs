import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { verifySourceContent } from "../scripts/lib/source-content.mjs";
test("source manifest distinguishes missing originals from mapped product content", async () => {
  const root = resolve(new URL("..", import.meta.url).pathname);
  const report = await verifySourceContent(
    JSON.parse(
      await readFile(join(root, "contracts/source-content-manifest.json")),
    ),
    root,
  );
  assert.deepEqual(report.errors, []);
  assert.equal(report.complete, false);
  assert.ok(report.unavailableSources.includes("HBG-C008"));
  assert.ok(report.pendingReview.length > 0);
});
test("source verifier rejects changed bytes, unavailable enumeration and unsubstantiated approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "habi-source-"));
  try {
    await writeFile(join(root, "source.txt"), "Original general source");
    const source = {
      id: "source",
      path: "source.txt",
      availability: "available",
      sha256: createHash("sha256")
        .update("Original general source")
        .digest("hex"),
    };
    const section = {
      sourceId: "source",
      sectionId: "one",
      title: "One",
      version: "1",
      disposition: "mapped",
      destination: "source.txt",
      reason: "Fixture",
      rightsState: "unverified",
      reviewState: "pending",
    };
    const run = (s = source, t = section) =>
      verifySourceContent({ sources: [s], sections: [t] }, root);
    assert.equal((await run()).complete, true);
    assert.match(
      (
        await run(source, { ...section, reviewState: "approved" })
      ).errors.join(),
      /approval receipt/,
    );
    assert.match(
      (
        await run({
          ...source,
          availability: "unavailable",
          sha256: null,
          sectionsEnumerated: false,
          reason: "Absent",
        })
      ).errors.join(),
      /original bytes/,
    );
    await writeFile(join(root, "source.txt"), "Changed");
    assert.match((await run()).errors.join(), /digest changed/);
    assert.match(
      (await run({ ...source, path: "../outside" })).errors.join(),
      /outside source/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
