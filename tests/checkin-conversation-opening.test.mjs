import test from "node:test";
import assert from "node:assert/strict";
import { createCheckinConversationOpening } from "../src/lib/workflows/checkin-conversation-opening.mjs";

const definitions = [
  ["energy", "Mennyi energiád van?", ["Sok", "Megfelelő", "Kevés"]],
  ["sleep", "Hogyan aludtál?", ["Kiválóan", "Jól", "Keveset"]],
];

test("creates an editable factual opening from saved answers", () => {
  assert.equal(
    createCheckinConversationOpening(
      {
        answerCodes: [
          { metric: "energy", code: 2 },
          { metric: "sleep", code: 1 },
        ],
      },
      definitions,
    ),
    "A legutóbbi állapotjelzésemben ezeket válaszoltam: Mennyi energiád van?: Kevés; Hogyan aludtál?: Jól. Szeretnék beszélgetni arról, ami nekem fontos.",
  );
});

test("does not invent text when the check-in has no recognized answers", () => {
  assert.equal(
    createCheckinConversationOpening({ answerCodes: [] }, definitions),
    "",
  );
  assert.equal(createCheckinConversationOpening(null, definitions), "");
});
