import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("API contract and response schemas are pinned to canonical API 2.4.8", async () => {
  const [apiBytes, apiManifestBytes, responseBytes, responseManifestBytes] =
    await Promise.all([
      readFile(new URL("../contracts/api.json", import.meta.url)),
      readFile(new URL("../contracts/api-manifest.json", import.meta.url)),
      readFile(
        new URL("../contracts/api-response-schemas.json", import.meta.url),
      ),
      readFile(
        new URL("../contracts/api-response-manifest.json", import.meta.url),
      ),
    ]);
  const api = JSON.parse(apiBytes.toString("utf8"));
  const apiManifest = JSON.parse(apiManifestBytes.toString("utf8"));
  const responseManifest = JSON.parse(responseManifestBytes.toString("utf8"));

  assert.equal(api.info.version, "2.4.8");
  assert.equal(apiManifest.apiVersion, "2.4.8");
  assert.equal(responseManifest.apiVersion, "2.4.8");
  assert.equal(
    createHash("sha256").update(apiBytes).digest("hex"),
    apiManifest.sha256,
  );
  assert.equal(
    createHash("sha256").update(responseBytes).digest("hex"),
    responseManifest.sha256,
  );
  assert.equal(responseManifest.apiVersion, api.info.version);

  const timelineSchema =
    api.paths["/v1/timeline"].get.responses["200"].content["application/json"]
      .schema.$ref;
  const recordOperation = api.paths["/v1/players/{playerId}/records/{id}"].get;
  const recordSchema =
    recordOperation.responses["200"].content["application/json"].schema.$ref;
  assert.equal(timelineSchema, "./schemas.json#/$defs/TimelinePageReadDTO");
  assert.equal(recordSchema, "./schemas.json#/$defs/RecordReadDTO");
  assert.deepEqual(recordOperation.security, [{ sessionCookie: [] }]);
  assert.ok(api.paths["/v1/checkin-sessions/{id}/answers"].post);
});
