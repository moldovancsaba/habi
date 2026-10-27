import test from "node:test";
import assert from "node:assert/strict";
import {
  createGoalExport,
  summarizeRecordedAnswers,
} from "../src/lib/workflows/goal-export.mjs";

const goal = {
  id: "goal-1",
  occurredAt: "2026-10-27T08:15:00.000Z",
};
const records = [
  {
    text: "Saját cél visszatekintés · goal-1 · A bemelegítés segített.",
    occurredAt: "2026-10-27T09:00:00.000Z",
  },
  {
    text: "Saját cél állapot · goal-1 · paused",
    occurredAt: "2026-10-27T08:30:00.000Z",
  },
  {
    text: "Saját cél visszatekintés · another-goal · Másik cél jegyzete",
    occurredAt: "2026-10-27T09:30:00.000Z",
  },
];

test("goal export contains the goal and state without extra history by default", () => {
  const output = createGoalExport({
    goal,
    goalText: "Edzés előtt bemelegítek.",
    status: "active",
    records,
  });
  assert.match(output, /HABI · A saját vállalásom/);
  assert.match(output, /Edzés előtt bemelegítek\./);
  assert.match(output, /Állapot: aktív/);
  assert.doesNotMatch(output, /A bemelegítés segített/);
});

test("goal export includes only matching goal history when selected", () => {
  const output = createGoalExport({
    goal,
    goalText: "Edzés előtt bemelegítek.",
    status: "paused",
    records,
    includeHistory: true,
  });
  assert.ok(
    output.indexOf("Állapotváltozás") < output.indexOf("Visszatekintés"),
  );
  assert.match(output, /A bemelegítés segített\./);
  assert.doesNotMatch(output, /Másik cél jegyzete/);
});

test("trend summary counts recorded answers and identifies the latest only", () => {
  const summary = summarizeRecordedAnswers(
    [
      { date: "2026-10-26T08:00:00.000Z", value: 1 },
      { date: "2026-10-27T08:00:00.000Z", value: 0 },
      { date: "2026-10-28T08:00:00.000Z", value: 1 },
    ],
    ["Sok", "Megfelelő"],
  );
  assert.match(summary, /3 rögzített válasz/);
  assert.match(summary, /Sok: 1 · Megfelelő: 2/);
  assert.match(summary, /Legutóbbi válasz: Megfelelő/);
  assert.doesNotMatch(summary, /javult|romlott|átlag|trend/i);
});

test("trend summary explicitly handles no valid recorded answers", () => {
  assert.equal(
    summarizeRecordedAnswers([{ date: "x", value: 9 }], ["Sok", "Kevés"]),
    "Ebben az időszakban nincs rögzített válasz.",
  );
});
