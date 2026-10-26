import assert from "node:assert/strict";
import test from "node:test";
import { readTimeline } from "../src/lib/workflows/timeline.mjs";

function collection(items = []) {
  return {
    find(filter = {}) {
      let found = items.filter((item) => {
        for (const [key, value] of Object.entries(filter)) {
          if (value && typeof value === "object" && "$lte" in value) {
            if (item[key] > value.$lte) return false;
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
