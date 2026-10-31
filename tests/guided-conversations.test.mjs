import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceGuidedConversation,
  createSavedConversationExport,
  createGuidedConversationSummary,
  guidedConversationSafetyReply,
  isGuidedConversationSafetyInput,
  isValidGuidedConversationDraft,
  rankGuidedCategories,
  resolveGuidedConversation,
  startGuidedConversation,
} from "../src/lib/workflows/guided-conversations.mjs";

test("authored topic paths advance through real options and end at a fixed outcome", () => {
  let draft = startGuidedConversation("dreams");
  assert.ok(draft);
  assert.equal(resolveGuidedConversation(draft)?.currentNodeId, "emotion");
  draft = advanceGuidedConversation(draft, "first");
  assert.ok(draft);
  assert.equal(resolveGuidedConversation(draft)?.currentNodeId, "frequency");
  draft = advanceGuidedConversation(draft, "sometimes");
  assert.ok(draft);
  assert.equal(resolveGuidedConversation(draft)?.currentNodeId, "support");
  draft = advanceGuidedConversation(draft, "nobody");
  assert.ok(draft);
  assert.equal(resolveGuidedConversation(draft)?.currentNodeId, "next");
  draft = advanceGuidedConversation(draft, "small");
  assert.ok(draft);
  assert.equal(resolveGuidedConversation(draft)?.outcome?.id, "small-step");
  assert.equal(resolveGuidedConversation(draft)?.currentNode, null);
  assert.equal(isValidGuidedConversationDraft(draft), true);
});

test("saved guided conversations can be exported from their journal record", () => {
  const text = "Vezetett beszélgetés · A jövőm\nKöszönöm.\nKérdés\nVálasz";
  assert.equal(createSavedConversationExport({ kind: "diary", text }), text);
  assert.equal(
    createSavedConversationExport({ kind: "observation", text }),
    null,
  );
  assert.equal(
    createSavedConversationExport({ kind: "diary", text: "Másik bejegyzés" }),
    null,
  );
});

test("topic draft rejects invalid categories, branches, and turns after an outcome", () => {
  assert.equal(startGuidedConversation("unknown"), null);
  assert.equal(
    isValidGuidedConversationDraft({
      categoryId: "dreams",
      turns: ["emotion:unsafe", "frequency:sometimes"],
    }),
    false,
  );
  assert.equal(
    isValidGuidedConversationDraft({
      categoryId: "dreams",
      turns: [
        "emotion:first",
        "frequency:sometimes",
        "support:nobody",
        "next:small",
        "emotion:first",
      ],
    }),
    false,
  );
});

test("every category is mapped to a valid authored tree", () => {
  for (const categoryId of [
    "dreams",
    "competition",
    "sport",
    "pressure",
    "focus",
    "habits",
    "support",
  ]) {
    assert.ok(startGuidedConversation(categoryId));
  }
});

test("free-text prompts rank topics deterministically and preserve safety routing", () => {
  const first = rankGuidedCategories("Félek a következő versenytől");
  assert.deepEqual(first, rankGuidedCategories("Félek a következő versenytől"));
  assert.ok(first.indexOf("competition") < first.indexOf("dreams"));
  assert.ok(first.indexOf("pressure") < first.indexOf("dreams"));
  assert.equal(isGuidedConversationSafetyInput("Bántani magam"), true);
  assert.equal(
    isGuidedConversationSafetyInput("Nem érzem jól magam az edzésen"),
    false,
  );
  assert.deepEqual(rankGuidedCategories("egy teljesen más mondat"), [
    "dreams",
    "competition",
    "sport",
    "pressure",
    "focus",
    "habits",
    "support",
  ]);
});

test("free-text opening survives each turn and becomes part of the summary", () => {
  let draft = startGuidedConversation("dreams", "Szeretnék fejlődni");
  assert.equal(draft?.opening, "Szeretnék fejlődni");
  draft = advanceGuidedConversation(draft, "first");
  assert.equal(draft?.opening, "Szeretnék fejlődni");
  assert.ok(
    createGuidedConversationSummary({
      categoryId: "dreams",
      opening: "Szeretnék fejlődni",
      turns: [
        "emotion:first",
        "frequency:sometimes",
        "support:nobody",
        "next:small",
      ],
    })?.includes("Te mondtad: Szeretnék fejlődni"),
  );
  assert.equal(
    isValidGuidedConversationDraft({
      categoryId: "dreams",
      opening: " ",
      turns: [],
    }),
    false,
  );
});

test("completed topic exports preserve the exact authored exchange", () => {
  let draft = startGuidedConversation("dreams");
  for (const optionId of ["first", "sometimes", "nobody", "small"]) {
    draft = advanceGuidedConversation(draft, optionId);
    assert.ok(draft);
  }
  const state = resolveGuidedConversation(draft);
  const summary = createGuidedConversationSummary(draft);
  assert.ok(state?.outcome?.text);
  assert.ok(summary?.startsWith("Habi · vezetett beszélgetés\nTéma:"));
  assert.ok(summary?.includes(state.category.label));
  for (const { node, option } of state.turns) {
    assert.ok(summary?.includes(node.response));
    assert.ok(summary?.includes(node.question));
    assert.ok(summary?.includes(`Válasz: ${option.label}`));
  }
  assert.ok(summary?.endsWith(state.outcome.text));
  assert.equal(
    createGuidedConversationSummary({ categoryId: "dreams", turns: [] }),
    null,
  );
});

test("hopelessness phrases route to safety and the AI coach gets the authored safety copy in one message", () => {
  for (const input of [
    "Semmi értelme az egésznek, nem akarok már edzésre járni.",
    "Nincs értelme edzeni",
    "Utálom magam",
  ])
    assert.equal(isGuidedConversationSafetyInput(input), true, input);
  for (const input of [
    "Feladom a versenyt",
    "Menjek ma edzésre?",
    "Nem érzem jól magam az edzésen",
  ])
    assert.equal(isGuidedConversationSafetyInput(input), false, input);
  const reply = guidedConversationSafetyReply().text;
  for (const authored of [
    "Fontos, amit írtál.",
    "Biztonságban vagy most?",
    "Most rögtön menj egy szülődhöz vagy más megbízható felnőtthöz.",
    "Válassz ma egy nyugodt pillanatot egy szülőddel vagy megbízható felnőttel.",
  ])
    assert.ok(reply.includes(authored), authored);
});
