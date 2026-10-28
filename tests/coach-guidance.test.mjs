import assert from "node:assert/strict";
import test from "node:test";
import {
  coachQuestionGuidance,
  isTrainingAttendanceQuestion,
  trainingGuidanceSource,
} from "../src/lib/workflows/coach-guidance.mjs";
const now = new Date("2026-10-28T10:00:00Z");
const source = (at, kind = "checkin_results") => ({
  id: "old",
  revision: 1,
  kind,
  at,
  text: "Ma nagyon jól ébredt és időben indult edzésre",
});
const guidance = (sources = [], role = "player", time = now) =>
  coachQuestionGuidance({
    question: "menjek ma edzésre?",
    sources,
    role,
    now: time,
  });
test("recognizes attendance decisions without confusing schedule questions", () => {
  for (const q of [
    "menjek ma edzésre?",
    "Mehetek edzesre?",
    "Kihagyjam az edzést?",
    "Should I attend training today?",
  ])
    assert.equal(isTrainingAttendanceQuestion(q), true);
  for (const q of [
    "Mikor menjek edzésre?",
    "Hánykor kezdődik az edzés?",
    "Mennyit edzettél?",
    "Hogy aludtam?",
  ])
    assert.equal(isTrainingAttendanceQuestion(q), false);
});
test("past 'today' records cannot establish today's condition", () => {
  const result = guidance([source("2026-10-27T10:00:00Z")]);
  assert.equal(result.hasCurrentCheckin, false);
  assert.match(result.unknowns[0], /nem kezelem mai állapotként/);
  assert.match(result.claim.text, /Ha ma/);
  assert.equal(result.claim.kind, "general");
  assert.deepEqual(result.claim.evidenceRefs, [
    { id: trainingGuidanceSource().id, revision: 1, span: null },
  ]);
  assert.ok(trainingGuidanceSource().text.includes(result.claim.text));
});
test("uses Budapest calendar days and asks about symptoms even with current checkin", () => {
  const result = guidance([source("2026-10-27T23:30:00Z")]);
  assert.equal(result.hasCurrentCheckin, true);
  assert.match(result.questions[0], /új panasz/);
  assert.equal(
    guidance([source("2026-10-28T12:00:00Z")]).hasCurrentCheckin,
    false,
  );
  assert.equal(
    guidance([source("2026-10-28T09:00:00Z", "records")]).hasCurrentCheckin,
    false,
  );
});
test("coach's first-person question does not assume the selected player's identity", () => {
  const result = guidance([], "coach");
  assert.match(result.claim.text, /saját edzésedről/);
  assert.match(result.questions[0], /Magadról/);
  assert.equal(
    coachQuestionGuidance({
      question: "Hogy aludtam?",
      role: "player",
      sources: [],
      now,
    }),
    null,
  );
});
