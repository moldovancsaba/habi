import { projectTimelineNodes } from "./timeline-projection.mjs";
import {
  compareTimelineKeys,
  readTimelineSources,
  hydrateTimelineSources,
} from "./timeline-sources.mjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";

function sign(payload, key) {
  if (typeof key !== "string" || Buffer.byteLength(key) < 32)
    throw new Error("CURSOR_KEY_INVALID");
  return createHmac("sha256", key)
    .update(`habi-timeline:${payload}`)
    .digest("base64url");
}
function encode(value, key) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}
function decode(token, key, principal, playerId, kind, from, to, now) {
  if (typeof token !== "string" || token.length > 4096)
    throw new HabiApiError("INVALID_INPUT");
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra !== undefined)
    throw new HabiApiError("INVALID_INPUT");
  const a = Buffer.from(supplied),
    b = Buffer.from(sign(payload, key));
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new HabiApiError("INVALID_INPUT");
  let value;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HabiApiError("INVALID_INPUT");
  if (
    value.version !== 2 ||
    value.actorId !== principal.actorId ||
    value.role !== principal.role ||
    typeof value.stream !== "string" ||
    value.tenantId !== principal.tenantId ||
    value.playerId !== playerId ||
    value.accessRevision !== principal.accessRevision ||
    value.kind !== kind ||
    value.from !== from ||
    value.to !== to ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= now.getTime() ||
    !Number.isFinite(Date.parse(value.snapshotAt)) ||
    typeof value.at !== "string" ||
    typeof value.id !== "string"
  )
    throw new HabiApiError("CURSOR_EXPIRED");
  return value;
}

async function readTimelinePage({
  db,
  principal,
  playerId = principal.playerId,
  kind = /** @type {string | null} */ (null),
  from = /** @type {string | null} */ (null),
  to = /** @type {string | null} */ (null),
  cursor = /** @type {string | null} */ (null),
  limit = 20,
  cursorHmacKey,
  now = new Date(),
}) {
  if (principal.role !== "coach" && playerId !== principal.playerId)
    throw new HabiApiError("NOT_FOUND");
  if (
    !playerId ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (kind && !/^[A-Za-z0-9_.-]{1,50}$/.test(kind)) ||
    (from !== null && !Number.isFinite(Date.parse(from))) ||
    (to !== null && !Number.isFinite(Date.parse(to))) ||
    (from && to && Date.parse(from) > Date.parse(to))
  )
    throw new HabiApiError("INVALID_INPUT");
  if (from) from = new Date(from).toISOString();
  if (to) to = new Date(to).toISOString();
  const position = cursor
    ? decode(cursor, cursorHmacKey, principal, playerId, kind, from, to, now)
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const upper = [to, snapshotAt].filter(Boolean).sort()[0];
  const { rows, playerOwnsResults } = await readTimelineSources({
    db,
    principal,
    playerId,
    position,
    from,
    upper,
    count: limit + 1,
    kind,
    snapshotAt,
  });
  rows.sort((a, b) =>
    compareTimelineKeys(
      { ...a.events, stream: a.stream },
      { ...b.events, stream: b.stream },
    ),
  );
  const selected = rows.slice(0, limit + 1);
  const data = await hydrateTimelineSources({
    db,
    principal,
    playerId,
    selected,
    playerOwnsResults,
  });
  const { nodes, processMap } = projectTimelineNodes({
    principal,
    playerId,
    ...data,
  });
  const byKey = new Map(
    nodes.map((node) => [
      JSON.stringify([node._stream, node.id, node.submittedAt]),
      node,
    ]),
  );
  const materialized = selected.map((row) =>
    byKey.get(JSON.stringify([row.stream, row.events.id, row.events.at])),
  );
  // A concurrently changed/deleted projection is not an empty successful page.
  // Restart against a fresh snapshot instead of inventing an old source revision.
  if (materialized.some((node) => !node))
    throw new HabiApiError("CURSOR_EXPIRED");
  const hasMore = materialized.length > limit;
  const page = materialized.slice(0, limit).map(({ _stream, ...node }) => node);
  const lastPosition = selected[Math.min(limit, selected.length) - 1];
  return {
    nodes: page,
    edges: page.flatMap((node) =>
      node.replyTo
        ? [{ from: node.id, to: node.replyTo, kind: "reply" }]
        : node.relatedId
          ? [{ from: node.id, to: node.relatedId, kind: "derived_from" }]
          : [],
    ),
    processes: [...new Set(page.map((node) => node.processId))].map(
      (id) => processMap.get(id) ?? { id, closedAt: null },
    ),
    continuations: [],
    nextCursor:
      hasMore && page.length
        ? encode(
            {
              version: 2,
              actorId: principal.actorId,
              role: principal.role,
              stream: lastPosition.stream,
              tenantId: principal.tenantId,
              playerId,
              accessRevision: principal.accessRevision,
              kind,
              from,
              to,
              snapshotAt,
              at: page.at(-1).submittedAt,
              id: page.at(-1).id,
              expiresAt:
                position?.expiresAt ??
                new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
            },
            cursorHmacKey,
          )
        : null,
    snapshotAt,
    accessRevision: principal.accessRevision,
  };
}

export async function readTimeline(options) {
  try {
    return await readTimelinePage(options);
  } catch (error) {
    if ([50, 292].includes(error?.code))
      throw new HabiApiError("DEPENDENCY_UNAVAILABLE", { retryAfter: 1 });
    throw error;
  }
}
