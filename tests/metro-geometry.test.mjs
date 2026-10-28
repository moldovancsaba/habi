import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMetroGeometry,
  metroLaneCounts,
  metroRoutePath,
} from "../src/lib/client/metro-geometry.mjs";
const event = (i, role = "coach") => ({
  id: `event-${i}`,
  actorRole: role,
  processId: `process-${i}`,
});
const branch = (i, overrides = {}) => ({
  id: `branch-${i}`,
  role: "coach",
  lane: 0,
  sideLane: 0,
  first: i,
  last: i,
  indices: [i],
  open: false,
  ...overrides,
});
function geometry(count = 1, overrides = {}) {
  return buildMetroGeometry({
    page: { continuations: [], nextCursor: null },
    events: Array.from({ length: count }, (_, i) => event(i)),
    branches: Array.from({ length: count }, (_, i) => branch(i)),
    anchors: Array.from({ length: count }, (_, i) => ({
      y: 100 + i * 160,
      edgeX: 76,
    })),
    width: 600,
    height: 160 * count,
    axis: 14,
    railX: 64,
    desktop: false,
    pitch: 18,
    clearance: 28,
    radius: 8,
    nodeSize: 8,
    ...overrides,
  });
}
test("a long sequential history reuses a full-width lane instead of collapsing into the trunk", () => {
  const result = geometry(100);
  assert.equal(result.stations.length, 100);
  assert.equal(new Set(result.stations.map((s) => s.x)).size, 1);
  assert.equal(result.stations[0].x, 32);
  assert.deepEqual(
    metroLaneCounts(Array.from({ length: 100 }, (_, i) => branch(i))),
    { all: 1, left: 0, right: 1 },
  );
});
test("overlapping branches keep distinct stations and connectors end at measured card edges", () => {
  const result = geometry(4, {
    branches: Array.from({ length: 4 }, (_, i) =>
      branch(i, { lane: i, sideLane: i }),
    ),
    railX: 136,
  });
  for (let i = 1; i < 4; i++)
    assert.ok(result.stations[i].x - result.stations[i - 1].x >= 18);
  assert.ok(result.connectors.every((c) => c.d.endsWith("H76")));
  assert.equal(result.stations[2].y, 420);
});
test("wide layout puts role branches on opposite sides and follows expanded-card anchor positions", () => {
  const result = geometry(2, {
    desktop: true,
    axis: 600,
    railX: 696,
    pitch: 32,
    events: [event(0, "parent"), event(1, "coach")],
    branches: [branch(0, { role: "parent" }), branch(1)],
    anchors: [
      { y: 123, edgeX: 488 },
      { y: 600, edgeX: 712 },
    ],
  });
  assert.equal(result.stations[0].x, 568);
  assert.equal(result.stations[1].x, 632);
  assert.equal(result.stations[1].y, 600);
  assert.ok(result.connectors[0].d.endsWith("H488"));
  assert.ok(result.connectors[1].d.endsWith("H712"));
});
test("a page cursor alone does not invent a continuing process", () => {
  const result = geometry(1, {
    page: { continuations: [], nextCursor: "unrelated-older-events" },
  });
  assert.ok(result.routes[1].d.endsWith("L14,128"));
  const continued = geometry(1, {
    page: {
      continuations: [{ processId: "process-0", direction: "before" }],
      nextCursor: "older",
    },
  });
  assert.ok(!continued.routes[1].d.endsWith("L14,128"));
  assert.equal(result.stations.length, 1);
  assert.equal(result.markers, undefined);
});
test("rounded routes preserve endpoints without invalid coordinates or diagonal shortcuts", () => {
  const path = metroRoutePath(
    [
      [14, 72],
      [14, 72],
      [32, 72],
      [32, 128],
      [14, 128],
    ],
    8,
  );
  assert.match(path, /^M14,72 /);
  assert.match(path, /Q32,72 32,80/);
  assert.ok(path.endsWith("L14,128"));
  assert.ok(!/NaN|undefined|Infinity/.test(path));
});
