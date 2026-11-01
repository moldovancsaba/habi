import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkApiCoverage } from "./lib/api-coverage.mjs";
const args = process.argv.slice(2);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (args.length && !(args.length === 2 && args[0] === "--manifest")) {
  throw new Error(
    "Usage: node scripts/check-api-coverage.mjs [--manifest contracts/api-operation-dispositions.json]",
  );
}
const report = await checkApiCoverage({
  api: JSON.parse(await readFile(resolve(root, "contracts/api.json"), "utf8")),
  manifest: JSON.parse(
    await readFile(
      resolve(root, args[1] ?? "contracts/api-operation-dispositions.json"),
      "utf8",
    ),
  ),
  root,
});
console.log(JSON.stringify(report, null, 2));
// Coverage integrity is not feature completion: pending operations remain counted explicitly.
if (report.errors.length) process.exitCode = 1;
