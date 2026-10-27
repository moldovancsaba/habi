import content from "../content/guided-conversations-v2.json" with {
  type: "json",
};

export function resolveGuidedConversation(payload) {
  if (
    !payload ||
    typeof payload.categoryId !== "string" ||
    !Array.isArray(payload.turns) ||
    payload.turns.length > 5 ||
    !payload.turns.every((turn) => typeof turn === "string")
  )
    return null;
  const category = content.categories.find(
    (item) => item.id === payload.categoryId,
  );
  const tree = category ? content.trees[category.tree] : null;
  if (!category || !tree) return null;

  let nodeId = tree.start;
  let outcome = null;
  const turns = [];
  for (const [index, encoded] of payload.turns.entries()) {
    if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(encoded) || outcome) return null;
    const [turnNodeId, optionId] = encoded.split(":");
    if (turnNodeId !== nodeId) return null;
    const node = tree.nodes[nodeId];
    const option = node?.options.find((item) => item.id === optionId);
    if (!node || !option) return null;
    turns.push({ node, option });
    if (tree.outcomes[option.next]) {
      outcome = tree.outcomes[option.next];
      nodeId = "";
      if (index !== payload.turns.length - 1) return null;
    } else if (tree.nodes[option.next]) {
      nodeId = option.next;
    } else {
      return null;
    }
  }
  return {
    category,
    tree,
    turns,
    currentNodeId: outcome ? null : nodeId,
    currentNode: outcome ? null : tree.nodes[nodeId],
    outcome,
  };
}

export function startGuidedConversation(categoryId) {
  const payload = { categoryId, turns: [] };
  return resolveGuidedConversation(payload) ? payload : null;
}

export function advanceGuidedConversation(payload, optionId) {
  const resolved = resolveGuidedConversation(payload);
  if (!resolved?.currentNode) return null;
  const option = resolved.currentNode.options.find(
    (item) => item.id === optionId,
  );
  if (!option) return null;
  const next = {
    categoryId: payload.categoryId,
    turns: [...payload.turns, `${resolved.currentNodeId}:${option.id}`],
  };
  return resolveGuidedConversation(next) ? next : null;
}

export function isValidGuidedConversationDraft(payload) {
  return Boolean(resolveGuidedConversation(payload));
}

export function createGuidedConversationSummary(payload) {
  const state = resolveGuidedConversation(payload);
  if (!state?.outcome) return null;
  return [
    "Habi · vezetett beszélgetés",
    `Téma: ${state.category.label}`,
    "",
    ...state.turns.flatMap(({ node, option }) => [
      node.response,
      node.question,
      `Válasz: ${option.label}`,
      "",
    ]),
    "Habi válasza",
    state.outcome.text,
  ].join("\n");
}

export function createSavedConversationExport(record) {
  if (
    record?.kind !== "diary" ||
    typeof record.text !== "string" ||
    !record.text.startsWith("Vezetett beszélgetés ·")
  ) {
    return null;
  }
  return record.text;
}
