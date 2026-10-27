import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceGuidedConversation,
  isValidGuidedConversationDraft,
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
