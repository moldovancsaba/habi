import assert from "node:assert/strict";
import test from "node:test";
import {
  isOwnGoalRecord,
  ownGoalLineageStatus,
  ownGoalText,
  replacedGoalId,
} from "../src/lib/workflows/goal-lineage.mjs";

const original = {
  id: "goal-1",
  kind: "diary",
  text: "Saját cél: Edzés előtt bemelegítek.",
  occurredAt: "2026-10-27T10:00:00.000Z",
};
const replacement = {
  id: "goal-2",
  kind: "diary",
  text: "Saját célcsere · goal-1 · Minden edzés után nyújtok · tíz percet.",
  occurredAt: "2026-10-27T11:00:00.000Z",
};

test("a goal replacement is one new goal record linked to its predecessor", () => {
  assert.equal(isOwnGoalRecord(original), true);
  assert.equal(isOwnGoalRecord(replacement), true);
  assert.equal(ownGoalText(original), "Edzés előtt bemelegítek.");
  assert.equal(
    ownGoalText(replacement),
    "Minden edzés után nyújtok · tíz percet.",
  );
  assert.equal(replacedGoalId(replacement), "goal-1");
});

test("replacement and restoration preserve a visible, reversible history", () => {
  const restoration = {
    id: "goal-3",
    kind: "diary",
    text: "Saját célcsere · goal-2 · Edzés előtt bemelegítek.",
    occurredAt: "2026-10-28T11:00:00.000Z",
  };
  const goals = [original, replacement, restoration];
  const records = [
    ...goals,
    {
      id: "status-1",
      text: "Saját cél állapot · goal-1 · paused",
      occurredAt: "2026-10-27T10:30:00.000Z",
    },
  ];
  assert.equal(ownGoalLineageStatus(original, goals, records), "superseded");
  assert.equal(ownGoalLineageStatus(replacement, goals, records), "superseded");
  assert.equal(ownGoalLineageStatus(restoration, goals, records), "active");
});

test("ordinary records are not mistaken for goal history", () => {
  assert.equal(
    isOwnGoalRecord({ kind: "observation", text: "Saját cél: x" }),
    false,
  );
  assert.equal(
    replacedGoalId({ kind: "diary", text: "Saját célcsere · malformed" }),
    null,
  );
});
