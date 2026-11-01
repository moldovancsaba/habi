import { runComplianceCheck } from "@sovereignsquad/gds-compliance";
import { readFile } from "node:fs/promises";
const targets = ["src/app/coach-assessments.tsx", "src/app/record-correction.tsx", "src/app/gds-provider.tsx"];
const report = runComplianceCheck({ manifestPath: "./gds-adoption.json" });
const scoped = report.findings.filter((f) => !f.file || targets.some((p) => f.file.endsWith(p)));
for (const path of targets) {
  const source = await readFile(path, "utf8");
  // A scanner pass alone is not proof of GDS controls; enforce the actual new-flow boundary.
  if (/<(?:button|input|textarea|select|dialog)\b|\bstyle=|\.module\.css|@mantine\/|(?:#[0-9a-f]{3,8})\b/i.test(source)) scoped.push({ file: path, severity: "error", rule: "habi.gds-boundary", message: "New audited flow bypasses the shipped GDS control/style boundary." });
}
console.log(JSON.stringify({ scope: "New audited assessment/correction/provider files only. Existing workspace is a recorded partial migration, not full-repository compliance.", checked: targets, findings: scoped, legacyOrOtherFindings: report.findings.length - scoped.length }, null, 2));
if (scoped.some((f) => f.severity === "error")) process.exitCode = 1;
