import assert from "node:assert/strict";
import test from "node:test";
import {
  isGoalReviewDue,
  latestGoalReviewDate,
  nextGoalReviewDate,
} from "../src/lib/workflows/goal-review.mjs";

test("goal review cycles use local calendar days and cross month/year boundaries", () => {
  assert.equal(nextGoalReviewDate("2026-10-27", 7), "2026-11-03");
  assert.equal(nextGoalReviewDate("2026-12-25", 14), "2027-01-08");
  assert.equal(nextGoalReviewDate("2026-10-27", 28), "2026-11-24");
  assert.equal(nextGoalReviewDate("2026-10-27", 0), null);
});

test("latest goal review schedule wins and overdue dates are due", () => {
  const records = [
    {
      text: "Saját cél újranézés · goal-1 · 2026-11-10",
      occurredAt: "2026-10-28T09:00:00.000Z",
    },
    {
      text: "Saját cél újranézés · goal-1 · 2026-11-03",
      occurredAt: "2026-10-27T09:00:00.000Z",
    },
    {
      text: "Saját cél újranézés · goal-2 · 2026-10-20",
      occurredAt: "2026-10-29T09:00:00.000Z",
    },
  ];
  assert.equal(latestGoalReviewDate(records, "goal-1"), "2026-11-10");
  assert.equal(latestGoalReviewDate(records, "goal-2"), "2026-10-20");
  assert.equal(latestGoalReviewDate(records, "unknown"), null);
  assert.equal(
    latestGoalReviewDate(
      [
        ...records,
        {
          text: "Saját cél újranézés · goal-1 · kikapcsolva",
          occurredAt: "2026-10-30T09:00:00.000Z",
        },
      ],
      "goal-1",
    ),
    null,
  );
  assert.equal(isGoalReviewDue("2026-10-27", "2026-10-27"), true);
  assert.equal(isGoalReviewDue("2026-10-28", "2026-10-27"), false);
});
