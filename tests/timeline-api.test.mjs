import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  loadTimelinePage,
  loadTimelineRecord,
} from "../src/lib/client/timeline-api.mjs";
import {
  isRecordReadResponse,
  isTimelinePageResponse,
} from "../src/lib/client/timeline-response-validator.mjs";

function dto() {
  return {
    nodes: [
      {
        id: "event-1",
        revision: 1,
        playerId: "player-1",
        submittedAt: "2026-10-25T10:00:00.000Z",
        actorRole: "coach",
        sourceKind: "observation",
        kind: "observation",
        summary: "A timeline event summary",
        resourceRef: { id: "record-1", revision: 3 },
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
  assert.equal(manifest.apiVersion, "2.4.14");
  assert.equal(
    manifest.sourceRepository,
    "https://github.com/moldovancsaba/habi",
  );
  assert.equal(manifest.sourcePath, "contracts/api-response-schemas.json");
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
  assert.equal(
    isTimelinePageResponse({
      ...dto(),
      nodes: [{ ...dto().nodes[0], resourceRef: { id: "record-1" } }],
    }),
    false,
  );
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
    summary: "A timeline event summary",
    playerId: "player-1",
    sourceKind: "observation",
    resourceRef: { id: "record-1", revision: 3 },
    processId: "process-1",
    replyTo: null,
    relatedId: null,
    closedAt: null,
  });
  assert.equal(result.accessRevision, 2);
});

function recordDto(overrides = {}) {
  return {
    id: "record-1",
    revision: 3,
    playerId: "player-1",
    kind: "observation",
    recordedBy: { role: "coach", displayName: "Coach" },
    source: { kind: "observation", respondent: null },
    occurredAt: "2026-10-25T09:55:00.000Z",
    submittedAt: "2026-10-25T10:00:00.000Z",
    sharingClass: "coach",
    text: "Synthetic test record",
    sessionId: null,
    ...overrides,
  };
}

test("linked record loader uses exact event reference and validates record identity", async () => {
  let captured;
  const record = recordDto();
  assert.equal(isRecordReadResponse(record), true);
  const result = await loadTimelineRecord(dto().nodes[0], {
    fetchImpl: async (path, options) => {
      captured = { path, options };
      return response(record);
    },
  });
  assert.equal(captured.path, "/v1/players/player-1/records/record-1");
  assert.equal(captured.options.credentials, "same-origin");
  assert.equal(captured.options.cache, "no-store");
  assert.deepEqual(result, record);
});

test("linked record loader fails closed on mismatched owner, ID, or revision", async () => {
  for (const mismatch of [
    { playerId: "player-2" },
    { id: "record-2" },
    { revision: 4 },
  ]) {
    await assert.rejects(
      loadTimelineRecord(dto().nodes[0], {
        fetchImpl: async () => response(recordDto(mismatch)),
      }),
      { message: "LINKED_RECORD_MISMATCH" },
    );
  }

  let called = false;
  await assert.rejects(
    loadTimelineRecord(
      { ...dto().nodes[0], playerId: "../other" },
      {
        fetchImpl: async () => {
          called = true;
        },
      },
    ),
    { message: "TIMELINE_EVENT_INVALID" },
  );
  assert.equal(called, false);
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
