import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCheckinChart,
  metricGraphicLevel,
} from "../src/lib/workflows/checkin-chart.mjs";

const now = Date.parse("2026-10-27T12:00:00Z");
function entry(id, date, code) {
  return {
    id,
    completedAt: date,
    answerCodes: code === null ? [] : [{ metric: "energy", code }],
  };
}

test("answer graphics preserve the original level mapping, including training load", () => {
  for (const metric of ["energy", "sleep", "focus", "mood"]) {
    assert.deepEqual(
      [0, 1, 2, 3].map((code) => metricGraphicLevel(metric, code)),
      [4, 3, 2, 1],
    );
  }
  assert.deepEqual(
    [0, 1, 2, 3].map((code) => metricGraphicLevel("load", code)),
    [1, 2, 3, 4],
  );
  for (const code of [null, undefined, -1, 4, 1.5, "1"])
    assert.equal(metricGraphicLevel("energy", code), null);
});

test("chart sorts actual timestamps and retains separate same-day submissions", () => {
  const result = buildCheckinChart(
    [
      entry("late", "2026-10-27T10:00:00Z", 1),
      entry("early", "2026-10-27T08:00:00Z", 0),
    ],
    "energy",
    14,
    now,
  );
  assert.deepEqual(
    result.points.map(({ id, value }) => ({ id, value })),
    [
      { id: "early", value: 0 },
      { id: "late", value: 1 },
    ],
  );
  assert.match(result.path, / Q /);
  assert.doesNotMatch(result.path, /[LC]/);
});

test("missing days and unanswered questions break the metro route", () => {
  const result = buildCheckinChart(
    [
      entry("one", "2026-10-23T10:00:00Z", 1),
      entry("gap", "2026-10-25T10:00:00Z", 0),
      entry("skipped", "2026-10-26T10:00:00Z", null),
      entry("last", "2026-10-27T10:00:00Z", 3),
    ],
    "energy",
    14,
    now,
  );
  assert.equal(result.points[2].y, null);
  assert.equal(result.path.split("M ").length - 1, 3);
  assert.doesNotMatch(result.path, /[HQV]/);
});

test("period filtering excludes future, invalid, and old records without fabricating points", () => {
  const result = buildCheckinChart(
    [
      entry("old", "2026-09-01T10:00:00Z", 1),
      entry("future", "2026-10-28T10:00:00Z", 2),
      entry("invalid-date", "unknown", 1),
      entry("invalid-code", "2026-10-26T10:00:00Z", 9),
    ],
    "energy",
    14,
    now,
  );
  assert.equal(result.points.length, 1);
  assert.equal(result.points[0].value, null);
  assert.equal(result.path, "");
  assert.deepEqual(buildCheckinChart([], "energy", 14, now).points, []);
});
