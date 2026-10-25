import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadTimelinePage } from "../src/lib/client/timeline-api.mjs";
import { isTimelinePageResponse } from "../src/lib/client/timeline-response-validator.mjs";

function dto() {
  return {
    nodes: [
      {
        id: "event-1",
        revision: 1,
        submittedAt: "2026-10-25T10:00:00.000Z",
        actorRole: "coach",
        kind: "observation",
        processId: "process-1",
        replyTo: null,
        relatedId: null,
      },
    ],
    edges: [],
    processes: [{ id: "process-1", closedAt: null }],
    continuations: [],
    nextCursor: null,
    snapshotAt: "2026-10-25T10:01:00.000Z",
    accessRevision: 2,
  };
}

function response(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("timeline schema snapshot matches its canonical source manifest", async () => {
  const schemaBytes = await readFile(
    fileURLToPath(
      new URL("../contracts/api-response-schemas.json", import.meta.url),
    ),
  );
  const manifest = JSON.parse(
    await readFile(
      fileURLToPath(
        new URL("../contracts/api-response-manifest.json", import.meta.url),
      ),
      "utf8",
    ),
  );
  assert.equal(manifest.apiVersion, "2.2.0");
  assert.equal(
    manifest.sourceCommit,
    "cc90a71cbf4196e61b91bd848474bc0d81330537",
  );
  assert.equal(
    createHash("sha256").update(schemaBytes).digest("hex"),
    manifest.sha256,
  );
});

test("pinned timeline validator accepts the canonical DTO and rejects extra fields", () => {
  assert.equal(isTimelinePageResponse(dto()), true);
  assert.equal(
    isTimelinePageResponse({
      ...dto(),
      nodes: [{ ...dto().nodes[0], tenantId: "x" }],
    }),
    false,
  );
  assert.equal(
    isTimelinePageResponse({
      ...dto(),
      edges: [{ from: "a", to: "b", kind: "reply", text: "x" }],
    }),
    false,
  );
  assert.equal(isTimelinePageResponse({ ...dto(), accessRevision: 0 }), false);
});

test("timeline loader uses same-origin transport, validates, and adapts the DTO", async () => {
  let captured;
  const result = await loadTimelinePage(
    { playerId: "player-1", kind: "observation", limit: 20 },
    {
      fetchImpl: async (path, options) => {
        captured = { path, options };
        return response(dto());
      },
    },
  );
  const parsed = new URL(captured.path, "https://habi.invalid");
  assert.equal(parsed.pathname, "/v1/timeline");
  assert.equal(parsed.searchParams.get("playerId"), "player-1");
  assert.equal(parsed.searchParams.get("kind"), "observation");
  assert.equal(parsed.searchParams.get("limit"), "20");
  assert.equal(captured.options.credentials, "same-origin");
  assert.equal(captured.options.cache, "no-store");
  assert.deepEqual(result.events[0], {
    id: "event-1",
    revision: 1,
    at: "2026-10-25T10:00:00.000Z",
    role: "coach",
    type: "observation",
    processId: "process-1",
    replyTo: null,
    relatedId: null,
    closedAt: null,
  });
  assert.equal(result.accessRevision, 2);
});

test("timeline loader fails closed on malformed response and query", async () => {
  let called = false;
  await assert.rejects(
    loadTimelinePage(
      {},
      {
        fetchImpl: async () => {
          called = true;
          return response({
            ...dto(),
            nodes: [{ ...dto().nodes[0], tenantId: "leak" }],
          });
        },
      },
    ),
    { code: "INVALID_API_RESPONSE", kind: "contract" },
  );
  assert.equal(called, true);

  called = false;
  await assert.rejects(
    loadTimelinePage(
      { limit: 51 },
      {
        fetchImpl: async () => {
          called = true;
        },
      },
    ),
    { message: "TIMELINE_QUERY_INVALID" },
  );
  assert.equal(called, false);
  await assert.rejects(
    loadTimelinePage(
      { debug: "secret" },
      {
        fetchImpl: async () => {
          called = true;
        },
      },
    ),
    { message: "TIMELINE_QUERY_INVALID" },
  );
  assert.equal(called, false);
});
