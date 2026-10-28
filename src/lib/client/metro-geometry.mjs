/** Round only orthogonal corners; preserve the measured endpoints. */
export function metroRoutePath(input, radius = 8) {
  const points = input.filter(
    (point, i) =>
      !i || point[0] !== input[i - 1][0] || point[1] !== input[i - 1][1],
  );
  const n = (value) => Number(value.toFixed(3));
  if (!points.length) return "";
  const commands = [`M${n(points[0][0])},${n(points[0][1])}`];
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i],
      prev = points[i - 1],
      next = points[i + 1];
    const turn =
      next && (x - prev[0]) * (next[1] - y) !== (y - prev[1]) * (next[0] - x);
    const r = turn
      ? Math.min(
          radius,
          (Math.abs(x - prev[0]) + Math.abs(y - prev[1])) / 2,
          (Math.abs(next[0] - x) + Math.abs(next[1] - y)) / 2,
        )
      : 0;
    if (r > 0)
      commands.push(
        `L${n(x - Math.sign(x - prev[0]) * r)},${n(y - Math.sign(y - prev[1]) * r)}`,
        `Q${n(x)},${n(y)} ${n(x + Math.sign(next[0] - x) * r)},${n(y + Math.sign(next[1] - y) * r)}`,
      );
    else commands.push(`L${n(x)},${n(y)}`);
  }
  return commands.join(" ");
}

export function metroLaneCounts(branches) {
  const count = (items, field) =>
    Math.max(0, ...items.map((branch) => branch[field] + 1));
  return {
    all: count(branches, "lane"),
    left: count(
      branches.filter((b) => b.role !== "coach"),
      "sideLane",
    ),
    right: count(
      branches.filter((b) => b.role === "coach"),
      "sideLane",
    ),
  };
}

/** Geometry uses the role badge centre and actual card edge, never card padding.
 * Lane spacing depends on simultaneously occupied lanes, not total event count.
 */
export function buildMetroGeometry({
  page,
  events,
  branches,
  anchors,
  width,
  height,
  axis,
  railX,
  desktop,
  pitch,
  clearance,
  radius,
  nodeSize,
}) {
  const lanes = metroLaneCounts(branches);
  const routes = [],
    stations = [],
    connectors = [];
  if (!anchors.length)
    return { width, height, axis, routes, stations, connectors };
  const n = (value) => Number(value.toFixed(3));
  routes.push({
    id: "main",
    role: "player",
    d: `M${n(axis)},${n(anchors[0].y - clearance)} V${n(anchors.at(-1).y + clearance)}`,
  });
  for (const branch of branches) {
    const side = branch.role === "coach" ? "right" : "left";
    const count = desktop ? lanes[side] : lanes.all;
    const step = Math.min(
      pitch,
      Math.max(0, Math.abs(railX - axis) - nodeSize) / (count + 1),
    );
    const x =
      axis +
      (desktop && side === "left" ? -1 : 1) *
        step *
        ((desktop ? branch.sideLane : branch.lane) + 1);
    const processIds = new Set(
      branch.indices.map((index) => events[index].processId),
    );
    const continues = (direction) =>
      page.continuations.some(
        (item) =>
          processIds.has(item.processId) && item.direction === direction,
      );
    const top = anchors[branch.first].y - clearance,
      bottom = anchors[branch.last].y + clearance;
    const points =
      branch.open || continues("after")
        ? [
            [x, top],
            [x, bottom],
          ]
        : [
            [axis, top],
            [x, top],
            [x, bottom],
          ];
    if (!continues("before")) points.push([axis, bottom]);
    routes.push({
      id: branch.id,
      role: branch.role,
      d: metroRoutePath(points, radius),
    });
    for (const index of branch.indices) {
      const event = events[index],
        anchor = anchors[index];
      stations.push({ id: event.id, x, y: anchor.y, role: event.actorRole });
      connectors.push({
        id: event.id,
        role: event.actorRole,
        d: `M${n(x)},${n(anchor.y)} H${n(anchor.edgeX)}`,
      });
    }
  }
  return { width, height, axis, routes, stations, connectors };
}
