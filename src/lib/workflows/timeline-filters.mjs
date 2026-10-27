export function filterTimelinePage(
  page,
  { kind = "all", role = "all", days = 0, now = Date.now() },
) {
  if (!page) return null;
  const nodes = page.nodes.filter(
    (node) =>
      (kind === "all" || node.kind === kind) &&
      (role === "all" || node.actorRole === role) &&
      (!days || Date.parse(node.submittedAt) >= now - days * 86400000),
  );
  const ids = new Set(nodes.map((node) => node.id));
  return {
    ...page,
    nodes,
    edges: page.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
  };
}
