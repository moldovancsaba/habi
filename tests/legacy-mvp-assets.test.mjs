import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy MVP serves the preserved Habi client without synthetic sample history", async () => {
  const [html, app, bootstrap, cloud, responsive, habi2] = await Promise.all([
    readFile(new URL("../public/legacy/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/bootstrap.js", import.meta.url), "utf8"),
    readFile(new URL("../public/cloud.js", import.meta.url), "utf8"),
    readFile(new URL("../public/responsive.js", import.meta.url), "utf8"),
    readFile(new URL("../public/habi2.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /\/bootstrap\.js/);
  assert.match(bootstrap, /fetch\('\/api\/app'/);
  assert.match(cloud, /fetch\('\/api\/app'/);
  assert.ok(responsive.length > 0);
  assert.ok(habi2.length > 0);
  assert.doesNotMatch(app, /seedSampleHistory/);
});
