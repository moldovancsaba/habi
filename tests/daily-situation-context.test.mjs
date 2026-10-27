import test from "node:test";
import assert from "node:assert/strict";
import { getDailySituationOptions } from "../src/lib/workflows/daily-situation-context.mjs";

const metrics = [
  [
    "focus",
    "Mennyire tudsz figyelni?",
    ["Nagyon jól", "Jól", "Nehezen", "Alig"],
  ],
  [
    "mood",
    "Hogy érzed magad?",
    ["Nagyon jól", "Jól", "Lehangoltan", "Feszült"],
  ],
  [
    "energy",
    "Mennyi energiád van?",
    ["Sok", "Megfelelő", "Kevés", "Kimerültem"],
  ],
];

test("offers exact authored daily-context routes only for difficult answered metrics", () => {
  assert.deepEqual(
    getDailySituationOptions(
      {
        id: "checkin-1",
        completedAt: "2026-10-27T10:00:00.000Z",
        answerCodes: [
          { metric: "energy", code: 3 },
          { metric: "focus", code: 2 },
          { metric: "mood", code: 3 },
        ],
      },
      metrics,
    ),
    [
      {
        situationId: "too-fast",
        title: "A mai figyelmemről beszélgetek",
        checkinId: "checkin-1",
        completedAt: "2026-10-27T10:00:00.000Z",
        metric: "focus",
        question: "Mennyire tudsz figyelni?",
        answer: "Nehezen",
      },
      {
        situationId: "afraid-to-try",
        title: "A mai hangulatomról beszélgetek",
        checkinId: "checkin-1",
        completedAt: "2026-10-27T10:00:00.000Z",
        metric: "mood",
        question: "Hogy érzed magad?",
        answer: "Feszült",
      },
    ],
  );
});

test("does not invent a route for missing, unknown, or ordinary answers", () => {
  assert.deepEqual(getDailySituationOptions(null, metrics), []);
  assert.deepEqual(
    getDailySituationOptions(
      {
        id: "checkin-2",
        answerCodes: [
          { metric: "focus", code: 1 },
          { metric: "mood", code: 0 },
          { metric: "unknown", code: 3 },
        ],
      },
      metrics,
    ),
    [],
  );
});
