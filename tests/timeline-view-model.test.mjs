import assert from "node:assert/strict";
import test from "node:test";
import { adaptTimelinePage } from "../src/lib/client/timeline-view-model.mjs";

function page(overrides = {}) {
  return {
    nodes: [
      {
        id: "event-1",
        revision: 3,
        submittedAt: "2026-10-25T10:00:00.000Z",
        actorRole: "parent",
        kind: "observation",
        processId: "thread-1",
        replyTo: "event-0",
        relatedId: null,
        tenantId: "tenant-secret",
        retentionPolicyId: "retention-secret",
        email: "private@example.test",
        text: "must not be inferred or copied from storage-shaped extras",
      },
    ],
    edges: [{ from: "event-1", to: "event-0", kind: "reply" }],
    processes: [
      {
        id: "thread-1",
        status: "closed",
        closedAt: "2026-10-25T11:00:00.000Z",
      },
    ],
    continuations: [{ processId: "thread-1", direction: "before" }],
    nextCursor: "cursor-next-page",
    snapshotAt: "2026-10-25T12:00:00.000Z",
    accessRevision: 9,
    ...overrides,
  };
}

test("timeline adapter maps authorized DTO names and preserves process and page state", () => {
  const dto = page();
  const view = adaptTimelinePage(dto);
  assert.deepEqual(view.events[0], {
    id: "event-1",
    revision: 3,
    at: "2026-10-25T10:00:00.000Z",
    role: "parent",
    type: "observation",
    processId: "thread-1",
    replyTo: "event-0",
    relatedId: null,
    closedAt: "2026-10-25T11:00:00.000Z",
  });
  assert.deepEqual(view.edges, dto.edges);
  assert.deepEqual(view.continuations, dto.continuations);
  assert.equal(view.nextCursor, dto.nextCursor);
  assert.equal(view.snapshotAt, dto.snapshotAt);
  assert.equal(view.accessRevision, 9);
  assert.equal(Object.hasOwn(view.events[0], "tenantId"), false);
  assert.equal(Object.hasOwn(view.events[0], "retentionPolicyId"), false);
  assert.equal(Object.hasOwn(view.events[0], "email"), false);
  assert.equal(Object.hasOwn(view.events[0], "text"), false);
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.events), true);
});

test("adapter preserves explicit open state and never invents closure without process evidence", () => {
  const open = adaptTimelinePage(
    page({
      processes: [{ id: "thread-1", status: "open", closedAt: null }],
    }),
  );
  assert.equal(Object.hasOwn(open.events[0], "closedAt"), true);
  assert.equal(open.events[0].closedAt, null);

  const missingProcess = adaptTimelinePage(page({ processes: [] }));
  assert.equal(Object.hasOwn(missingProcess.events[0], "closedAt"), false);
});

test("adapter rejects malformed page/event data instead of dropping records", () => {
  assert.throws(() => adaptTimelinePage({}), {
    message: "TIMELINE_PAGE_INVALID",
  });
  assert.throws(
    () =>
      adaptTimelinePage(
        page({ nodes: [{ ...page().nodes[0], submittedAt: "not-a-date" }] }),
      ),
    { message: "TIMELINE_EVENT_INVALID" },
  );
  assert.throws(
    () =>
      adaptTimelinePage(
        page({ processes: [{ id: "thread-1", closedAt: "bad" }] }),
      ),
    { message: "TIMELINE_PROCESS_INVALID" },
  );
});
