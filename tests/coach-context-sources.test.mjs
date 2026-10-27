import test from "node:test";
import assert from "node:assert/strict";
import { collectCoachContextSourceRefs } from "../src/lib/workflows/interpretations.mjs";

function database(fixtures) {
  const calls = [];
  return {
    calls,
    collection(name) {
      return {
        find(query) {
          calls.push({ name, query });
          let items = fixtures[name].filter((item) =>
            Object.entries(query).every(([key, value]) => {
              const actual = key
                .split(".")
                .reduce((current, part) => current?.[part], item);
              return actual === value;
            }),
          );
          return {
            sort() {
              return this;
            },
            limit(count) {
              items = items.slice(0, count);
              return this;
            },
            async toArray() {
              return items;
            },
          };
        },
      };
    },
  };
}

const base = { tenantId: "tenant-a", playerId: "player-a", revision: 1 };

test("coach context pins only this player's eligible recent sources, capped at twenty", async () => {
  const fixtures = Object.fromEntries(
    [
      "records",
      "checkin_results",
      "assessment_results",
      "monthly_reflections",
      "plans",
      "follow_ups",
      "reports",
      "extractions",
      "interpretations",
    ].map((name) => [name, []]),
  );
  fixtures.records = Array.from({ length: 25 }, (_, index) => ({
    ...base,
    id: `record-${index}`,
    createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }));
  fixtures.records.push({
    ...base,
    id: "other-player",
    playerId: "player-b",
    createdAt: "2026-12-31T00:00:00Z",
  });
  fixtures.reports = [
    {
      ...base,
      id: "ready-report",
      status: "ready",
      createdAt: "2026-02-01T00:00:00Z",
    },
    {
      ...base,
      id: "restricted-report",
      status: "restricted",
      createdAt: "2026-12-01T00:00:00Z",
    },
  ];
  fixtures.extractions = [
    {
      ...base,
      id: "verified-extraction",
      status: "verified",
      createdAt: "2026-02-02T00:00:00Z",
    },
    {
      ...base,
      id: "pending-extraction",
      status: "awaiting_review",
      createdAt: "2026-12-02T00:00:00Z",
    },
  ];
  fixtures.interpretations = [
    {
      ...base,
      id: "current-answer",
      answer: { status: "ready", validity: "current" },
      createdAt: "2026-02-03T00:00:00Z",
    },
    {
      ...base,
      id: "stale-answer",
      answer: { status: "ready", validity: "stale" },
      createdAt: "2026-12-03T00:00:00Z",
    },
  ];
  fixtures.checkin_results = [
    { ...base, id: "checkin", completedAt: "2026-03-01T00:00:00Z" },
  ];
  fixtures.assessment_results = [
    { ...base, id: "assessment", createdAt: "2026-04-01T00:00:00Z" },
  ];
  const db = database(fixtures);
  const refs = await collectCoachContextSourceRefs(
    db,
    { role: "coach", tenantId: "tenant-a" },
    "player-a",
  );

  assert.equal(refs.length, 20);
  assert.equal(refs[0].id, "assessment");
  assert.ok(refs.some((ref) => ref.id === "verified-extraction"));
  assert.ok(refs.some((ref) => ref.id === "current-answer"));
  assert.ok(
    !refs.some((ref) =>
      [
        "other-player",
        "restricted-report",
        "pending-extraction",
        "stale-answer",
      ].includes(ref.id),
    ),
  );
  assert.ok(refs.every((ref) => ref.span === null));
  assert.ok(
    db.calls.every(
      ({ query }) =>
        query.tenantId === "tenant-a" && query.playerId === "player-a",
    ),
  );
  assert.deepEqual(
    db.calls.find(({ name }) => name === "interpretations").query,
    {
      tenantId: "tenant-a",
      playerId: "player-a",
      "answer.status": "ready",
      "answer.validity": "current",
    },
  );
});

test("only a coach can request player-wide context", async () => {
  await assert.rejects(
    collectCoachContextSourceRefs(
      database({}),
      { role: "parent", tenantId: "tenant-a" },
      "player-a",
    ),
    { message: "ACCESS_DENIED" },
  );
});
