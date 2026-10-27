import assert from "node:assert/strict";
import test from "node:test";
import { readTimeline } from "../src/lib/workflows/timeline.mjs";

function collection(items = []) {
  return {
    find(filter = {}) {
      let found = items.filter((item) => {
        for (const [key, value] of Object.entries(filter)) {
          if (
            value &&
            typeof value === "object" &&
            ("$lte" in value || "$gte" in value)
          ) {
            if (value.$lte && item[key] > value.$lte) return false;
            if (value.$gte && item[key] < value.$gte) return false;
          } else if (item[key] !== value) return false;
        }
        return true;
      });
      const cursor = {
        sort(order) {
          const [[key, direction]] = Object.entries(order);
          found = [...found].sort(
            (a, b) => direction * a[key].localeCompare(b[key]),
          );
          return cursor;
        },
        limit(count) {
          found = found.slice(0, count);
          return cursor;
        },
        toArray: async () => found,
      };
      return cursor;
    },
    async findOne() {
      return null;
    },
  };
}

test("timeline keeps the question and its no-evidence outcome as linked events", async () => {
  const askedAt = "2026-10-26T10:15:00.000Z";
  const answeredAt = "2026-10-26T10:16:30.000Z";
  const question = "Miért volt ma nehéz az edzés?";
  const db = {
    collection(name) {
      const entries = {
        messages: [
          {
            tenantId: "habi",
            playerId: "player-1",
            id: "message-1",
            revision: 1,
            threadId: "thread-1",
            replyTo: null,
            recordedBy: { actorId: "parent-1", role: "parent" },
            text: question,
            submittedAt: askedAt,
          },
        ],
        turns: [
          {
            tenantId: "habi",
            playerId: "player-1",
            id: "turn-1",
            threadId: "thread-1",
            question,
            createdAt: askedAt,
          },
        ],
        interpretations: [
          {
            tenantId: "habi",
            playerId: "player-1",
            id: "interpretation-1",
            revision: 1,
            turnId: "turn-1",
            threadId: "thread-1",
            createdAt: answeredAt,
            updatedAt: answeredAt,
            answer: { status: "no_evidence", validity: "current" },
          },
        ],
        threads: [
          {
            tenantId: "habi",
            playerId: "player-1",
            id: "thread-1",
            closedAt: null,
          },
        ],
      };
      return collection(entries[name] ?? []);
    },
  };
  const result = await readTimeline({
    db,
    principal: {
      tenantId: "habi",
      playerId: "player-1",
      role: "parent",
      actorId: "parent-1",
      accessRevision: 1,
    },
    cursorHmacKey: "0123456789abcdef0123456789abcdef",
    now: new Date("2026-10-26T10:20:00.000Z"),
  });
  assert.equal(result.nodes.length, 2);
  const answer = result.nodes.find(
    (node) => node.kind === "interpretation.no_evidence",
  );
  const prompt = result.nodes.find((node) => node.kind === "thread.message");
  assert.equal(prompt.summary, question);
  assert.equal(
    answer.summary,
    "A Habi nem talált ellenőrizhető, forrásolt választ. Nem vont le következtetést.",
  );
  assert.equal(answer.relatedId, prompt.id);
  assert.equal(answer.submittedAt, answeredAt);
});

test("timeline can be filtered to a time window and its cursor is bound to that window", async () => {
  const principal = {
    tenantId: "habi",
    playerId: "player-1",
    role: "parent",
    actorId: "parent-1",
    accessRevision: 1,
  };
  const events = [
    {
      tenantId: "habi",
      playerId: "player-1",
      id: "old",
      revision: 1,
      threadId: "thread-1",
      replyTo: null,
      recordedBy: { actorId: "parent-1", role: "parent" },
      text: "outside",
      submittedAt: "2026-10-25T23:59:59.000Z",
    },
    {
      tenantId: "habi",
      playerId: "player-1",
      id: "inside-1",
      revision: 1,
      threadId: "thread-1",
      replyTo: null,
      recordedBy: { actorId: "parent-1", role: "parent" },
      text: "inside one",
      submittedAt: "2026-10-26T10:15:00.000Z",
    },
    {
      tenantId: "habi",
      playerId: "player-1",
      id: "inside-2",
      revision: 1,
      threadId: "thread-1",
      replyTo: null,
      recordedBy: { actorId: "parent-1", role: "parent" },
      text: "inside two",
      submittedAt: "2026-10-26T10:16:30.000Z",
    },
  ];
  const db = {
    collection(name) {
      const entries = {
        messages: events,
        threads: [{ id: "thread-1", closedAt: null }],
      };
      return collection(entries[name] ?? []);
    },
  };
  const options = {
    db,
    principal,
    cursorHmacKey: "0123456789abcdef0123456789abcdef",
    now: new Date("2026-10-26T10:20:00.000Z"),
    from: "2026-10-26T00:00:00.000Z",
    to: "2026-10-26T23:59:59.999Z",
    limit: 1,
  };
  const first = await readTimeline(options);
  assert.equal(first.nodes.length, 1);
  assert.equal(first.nodes[0].id, "inside-2");
  assert.ok(first.nextCursor);
  const second = await readTimeline({ ...options, cursor: first.nextCursor });
  assert.equal(second.nodes.length, 1);
  assert.equal(second.nodes[0].id, "inside-1");
  await assert.doesNotReject(
    readTimeline({
      ...options,
      from: "2026-10-26T02:00:00+02:00",
      to: "2026-10-27T01:59:59.999+02:00",
    }),
  );
  await assert.rejects(
    readTimeline({
      ...options,
      cursor: first.nextCursor,
      from: "2026-10-25T00:00:00.000Z",
    }),
    { message: "CURSOR_EXPIRED" },
  );
});
