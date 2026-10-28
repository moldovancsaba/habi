import assert from "node:assert/strict";
import test from "node:test";
import {
  messageUnderstanding,
  reportedDay,
} from "../src/lib/workflows/coach-messages.mjs";
test("an update is recorded as attributed information rather than a check-in explanation", () => {
  const u = messageUnderstanding(
    "jobb a közérzete, kiderült, hogy elfelejtett reggelizni",
    "coach",
  );
  assert.ok(u.acts.includes("update"));
  assert.equal(u.subject, "player");
  assert.deepEqual(
    u.notes.map((n) => n.quote),
    ["jobb a közérzete", "kiderült, hogy elfelejtett reggelizni"],
  );
});
test("questions and hypothetical premises never become established player facts", () => {
  for (const text of [
    "Lehet, hogy elfelejtett reggelizni?",
    "Csaba jobban van?",
    "Menjek ma edzésre?",
  ])
    assert.equal(messageUnderstanding(text, "coach").notes.length, 0);
  const hypothesis = messageUnderstanding("Talán a reggeli kimaradt.", "coach");
  assert.ok(hypothesis.notes.every((n) => n.kind === "hypothesis"));
});
test("exact quotations keep negation and author preferences separate from player reports", () => {
  const u = messageUnderstanding("Nem vagyok jobban.", "coach", {
    subject: "player",
    notes: [{ quote: "vagyok jobban", kind: "update" }],
  });
  assert.equal(u.subject, "author");
  assert.ok(u.notes.every((n) => n.quote.includes("Nem")));
  const feedback = messageUnderstanding(
    "Rövidebb válaszokat szeretnék, ezt már elmondtam.",
    "coach",
  );
  assert.equal(feedback.subject, "author");
  assert.ok(feedback.acts.includes("feedback"));
  assert.ok(feedback.acts.includes("preference"));
});
test("relative day is resolved against message time in Budapest including midnight and DST", () => {
  assert.equal(reportedDay("2026-10-27T23:30:00Z", "ma"), "2026-10-28");
  assert.equal(reportedDay("2026-10-27T23:30:00Z", "tegnap"), "2026-10-27");
  assert.equal(reportedDay("2026-03-29T22:30:00Z", "ma"), "2026-03-30");
  assert.equal(reportedDay("2026-10-28T12:00:00Z", null), null);
});

test("a message can contain both a report and a question", () => {
  const u = messageUnderstanding(
    "Jobb a közérzete. Mit kérdezzek tőle?",
    "coach",
  );
  assert.ok(u.acts.includes("question"));
  assert.ok(u.notes.some((n) => n.quote.includes("Jobb a közérzete")));
  assert.ok(!u.notes.some((n) => n.quote.includes("Mit kérdezzek")));
});
