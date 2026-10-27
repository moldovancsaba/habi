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
  if (
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

function visibleRecord(principal, record, publications) {
  if (principal.role === "coach") return true;
  if (principal.role === "player")
    return record.sharingClass === "player_direct";
  if (["player_direct", "parent_shared"].includes(record.sharingClass))
    return true;
  return publications.some(
    (p) =>
      p.status === "active" &&
      p.resourceRef.id === record.id &&
      p.resourceRef.revision === record.revision,
  );
}

export async function readTimeline({
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
  const boundedTime = (field) => {
    const upperBound =
      to && Date.parse(to) < Date.parse(snapshotAt) ? to : snapshotAt;
    return {
      [field]: {
        $lte: upperBound,
        ...(from ? { $gte: from } : {}),
      },
    };
  };
  const [
    records,
    results,
    messages,
    plans,
    followUps,
    interpretations,
    publications,
    sessions,
    threads,
    turns,
  ] = await Promise.all([
    db
      .collection("records")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("submittedAt"),
      })
      .sort({ submittedAt: -1 })
      .limit(200)
      .toArray(),
    db
      .collection("checkin_results")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("completedAt"),
      })
      .sort({ completedAt: -1 })
      .limit(100)
      .toArray(),
    db
      .collection("messages")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("submittedAt"),
      })
      .sort({ submittedAt: -1 })
      .limit(200)
      .toArray(),
    db
      .collection("plans")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("createdAt"),
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    db
      .collection("follow_ups")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("createdAt"),
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray(),
    db
      .collection("interpretations")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("updatedAt"),
      })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray(),
    db
      .collection("publications")
      .find({ tenantId: principal.tenantId, playerId, status: "active" })
      .toArray(),
    db
      .collection("checkin_sessions")
      .find({ tenantId: principal.tenantId, playerId })
      .toArray(),
    db
      .collection("threads")
      .find({ tenantId: principal.tenantId, playerId })
      .toArray(),
    db
      .collection("turns")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("createdAt"),
      })
      .toArray(),
  ]);
  const nodes = [];
  const processMap = new Map();
  for (const session of sessions)
    processMap.set(session.id, {
      id: session.id,
      closedAt: session.completedAt ?? null,
    });
  for (const thread of threads)
    processMap.set(thread.id, {
      id: thread.id,
      closedAt: thread.closedAt ?? null,
    });
  const turnsById = new Map(turns.map((turn) => [turn.id, turn]));
  for (const record of records)
    if (!record.sessionId)
      processMap.set(record.id, { id: record.id, closedAt: null });
  for (const item of records) {
    if (!visibleRecord(principal, item, publications)) continue;
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.submittedAt,
      actorRole: item.recordedBy.role,
      sourceKind: item.source.kind,
      kind: item.kind,
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.sessionId ?? item.id,
      replyTo: null,
      relatedId: item.supersedesId ?? null,
    });
  }
  for (const item of results) {
    if (
      principal.role === "player" &&
      principal.actorId !==
        (
          await db
            .collection("players")
            .findOne({ tenantId: principal.tenantId, id: playerId })
        )?.actorId
    )
      continue;
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.completedAt,
      actorRole: "player",
      sourceKind: "self",
      kind: "checkin.completed",
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.sessionId,
      replyTo: null,
      relatedId: null,
    });
  }
  for (const item of messages) {
    const parentCanSee = principal.role !== "parent" || !item.privateToCoach;
    if (!parentCanSee) continue;
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.submittedAt,
      actorRole: item.recordedBy.role,
      sourceKind:
        item.recordedBy.role === "player"
          ? "self"
          : item.recordedBy.role === "parent"
            ? "proxy"
            : "observation",
      kind: "thread.message",
      summary: item.text,
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.threadId,
      replyTo: item.replyTo,
      relatedId: null,
    });
  }
  for (const item of plans) {
    const closed = ["declined", "completed", "withdrawn"].includes(item.status);
    processMap.set(item.id, {
      id: item.id,
      closedAt: closed ? item.updatedAt : null,
    });
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.createdAt,
      actorRole: "coach",
      sourceKind: "observation",
      kind: `plan.${item.status}`,
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.id,
      replyTo: null,
      relatedId: null,
    });
  }
  for (const item of followUps) {
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.createdAt,
      actorRole: item.recordedBy.role,
      sourceKind: item.source.kind,
      kind: "plan.follow_up",
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.planRef.id,
      replyTo: null,
      relatedId: item.planRef.id,
    });
  }
  for (const item of interpretations) {
    const turn = turnsById.get(item.turnId);
    const questionMessage = turn
      ? messages.find(
          (message) =>
            message.threadId === item.threadId &&
            message.text === turn.question &&
            message.submittedAt === turn.createdAt,
        )
      : null;
    const noEvidence = item.answer?.status === "no_evidence";
    if (
      principal.role !== "coach" &&
      !(principal.role === "parent" && noEvidence) &&
      !(item.answer?.status === "ready" && item.answer?.validity === "current")
    )
      continue;
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.updatedAt,
      actorRole: questionMessage?.recordedBy?.role ?? "parent",
      sourceKind: "proxy",
      kind: noEvidence ? "interpretation.no_evidence" : "interpretation.ready",
      summary: noEvidence
        ? "A Habi nem talált ellenőrizhető, forrásolt választ. Nem vont le következtetést."
        : "A kérdésre forrásolt magyarázat készült.",
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.threadId,
      replyTo: null,
      relatedId: questionMessage?.id ?? null,
    });
  }
  const filtered = nodes
    .filter(
      (node) =>
        node.submittedAt <= snapshotAt &&
        (!from || node.submittedAt >= from) &&
        (!to || node.submittedAt <= to) &&
        (!kind || node.kind === kind),
    )
    .sort(
      (a, b) =>
        b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id),
    );
  const afterPosition = position
    ? filtered.filter(
        (n) =>
          n.submittedAt < position.at ||
          (n.submittedAt === position.at && n.id < position.id),
      )
    : filtered;
  const page = afterPosition.slice(0, limit);
  const hasMore = afterPosition.length > limit;
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
