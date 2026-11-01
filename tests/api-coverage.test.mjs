import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  checkApiCoverage,
  exportsMethod,
  routeFor,
} from "../scripts/lib/api-coverage.mjs";
const ownerIssue = "https://github.com/moldovancsaba/habi/issues/572";
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), "habi-coverage-"));
  try {
    await mkdir(join(root, "src/app/api/v1/widgets/[id]"), { recursive: true });
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const operation = { operationId: "read_widget" };
const api = {
  info: { version: "1" },
  paths: { "/v1/widgets/{id}": { get: operation } },
};
const row = {
  ...operation,
  method: "GET",
  path: "/v1/widgets/{id}",
  state: "implemented",
  reason: "Fixture",
  ownerIssue,
};
test("runtime coverage validates the real advertised API without claiming pending features complete", async () => {
  const root = resolve(new URL("..", import.meta.url).pathname);
  const report = await checkApiCoverage({
    root,
    api: JSON.parse(await readFile(join(root, "contracts/api.json"))),
    manifest: JSON.parse(
      await readFile(join(root, "contracts/api-operation-dispositions.json")),
    ),
  });
  assert.deepEqual(report.errors, []);
  assert.equal(report.documentedOperations, 114);
  assert.equal(report.fullyImplemented, false);
  assert.ok(report.counts.pending > 0);
});
test("syntax-based handler discovery handles aliases/reexports and never imports route code", () =>
  fixture(async (root) => {
    const path = join(root, routeFor(row.path));
    await writeFile(
      join(root, "src/app/api/v1/widgets/handler.ts"),
      'throw new Error("MUST_NOT_EXECUTE"); export async function read() { return 1; }',
    );
    await writeFile(path, 'export { read as GET } from "../handler";');
    assert.equal(await exportsMethod(path, "GET", root), true);
    await writeFile(
      path,
      "const handler = () => 1; export { handler as GET };",
    );
    assert.equal(await exportsMethod(path, "GET", root), true);
    await writeFile(
      path,
      '// export async function GET() {}\nconst message = "export const GET = 1";',
    );
    assert.equal(await exportsMethod(path, "GET", root), false);
    await writeFile(path, 'export { GET } from "./route";');
    assert.equal(await exportsMethod(path, "GET", root), false);
  }));
test("coverage rejects unclassified operations, broken implementation and replacement cycles", () =>
  fixture(async (root) => {
    const run = (operations) =>
      checkApiCoverage({
        root,
        api,
        manifest: { apiVersion: "1", operations },
      });
    assert.match((await run([])).errors.join(), /Unclassified/);
    assert.match((await run([row])).errors.join(), /Missing implemented/);
    assert.match(
      (
        await run([
          { ...row, state: "replacement", replacement: "GET /v1/widgets/{id}" },
        ])
      ).errors.join(),
      /cycle/,
    );
    assert.match(
      (
        await run([
          { ...row, state: "replacement", replacement: "GET /v1/absent" },
        ])
      ).errors.join(),
      /Missing implemented replacement/,
    );
    await writeFile(
      join(root, routeFor(row.path)),
      "export async function GET() {}",
    );
    assert.equal((await run([row])).fullyImplemented, true);
    assert.match(
      (await run([{ ...row, state: "pending" }])).errors.join(),
      /reconcile/,
    );
  }));
test("path normalization preserves dynamic route identity and rejects traversal", () => {
  assert.equal(
    routeFor("/v1/widgets/{id}"),
    "src/app/api/v1/widgets/[id]/route.ts",
  );
  assert.equal(routeFor("/auth/logout"), "src/app/auth/logout/route.ts");
  assert.throws(() => routeFor("/v1/../secret"));
});
