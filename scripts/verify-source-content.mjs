import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { verifySourceContent } from "./lib/source-content.mjs";
const args = process.argv.slice(2);
if (args.some((a) => a !== "--require-complete"))
  throw new Error(
    "Usage: node scripts/verify-source-content.mjs [--require-complete]",
  );
const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(
  await readFile(
    resolve(root, "contracts/source-content-manifest.json"),
    "utf8",
  ),
);
const report = await verifySourceContent(manifest, root);
console.log(JSON.stringify(report, null, 2));
if (
  report.errors.length ||
  (args.includes("--require-complete") && !report.complete)
)
  process.exitCode = 1;
