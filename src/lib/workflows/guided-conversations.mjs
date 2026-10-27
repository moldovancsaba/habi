import content from "../content/guided-conversations-v2.json" with {
  type: "json",
};
import routing from "../content/guided-chat-routing-v1.json" with {
  type: "json",
};

const MAX_OPENING = 1000;

function normalizeInput(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesTerm(input, term) {
  const phrase = normalizeInput(term);
  const words = input.split(" ");
  return phrase.includes(" ")
    ? ` ${input} `.includes(` ${phrase} `)
    : words.some(
        (word) =>
          word === phrase || (phrase.length >= 5 && word.startsWith(phrase)),
      );
}

export function rankGuidedCategories(input) {
  const normalized = normalizeInput(input);
  const matches = routing.categories
    .map((category, index) => ({
      id: category.id,
      index,
      score: category.keywords.reduce(
        (score, group) =>
          score + (group.some((term) => matchesTerm(normalized, term)) ? 1 : 0),
        0,
      ),
    }))
    .filter((category) => category.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const matchedIds = matches.map((category) => category.id);
  return [
    ...matchedIds,
    ...routing.categories
      .map((category) => category.id)
      .filter((id) => !matchedIds.includes(id)),
  ];
}

export function isGuidedConversationSafetyInput(input) {
  const normalized = normalizeInput(input);
  return routing.safetyKeywords.some((term) => matchesTerm(normalized, term));
}

export function resolveGuidedConversation(payload) {
  if (
    !payload ||
    typeof payload.categoryId !== "string" ||
    (payload.opening !== undefined &&
      (typeof payload.opening !== "string" ||
        payload.opening.length < 1 ||
        payload.opening.length > MAX_OPENING ||
        !payload.opening.trim())) ||
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

export function startGuidedConversation(categoryId, opening = "") {
  if (typeof opening !== "string" || opening.length > MAX_OPENING) return null;
  const payload = {
    categoryId,
    ...(opening.trim() ? { opening: opening.trim() } : {}),
    turns: [],
  };
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
    ...(payload.opening ? { opening: payload.opening } : {}),
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
    ...(payload.opening ? [`Te mondtad: ${payload.opening}`] : []),
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
