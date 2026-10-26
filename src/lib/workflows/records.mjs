import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";

const PAGE_SIZE = 50;

function recordDto(record) {
  return {
    id: record.id,
    revision: record.revision,
    playerId: record.playerId,
    kind: record.kind,
    recordedBy: record.recordedBy,
    source: record.source,
    occurredAt: record.occurredAt,
    submittedAt: record.submittedAt,
    sharingClass: record.sharingClass,
    text: record.text,
    metric: record.metric ?? null,
    answerCode: record.answerCode ?? null,
    sessionId: record.sessionId,
  };
}

function safeRecordFor(principal, record, publications) {
  if (principal.role === "coach") return true;
  if (principal.role === "player")
    return (
      principal.playerId === record.playerId &&
      record.sharingClass === "player_direct"
    );
  if (["player_direct", "parent_shared"].includes(record.sharingClass))
    return true;
  return publications.some(
    (publication) =>
      publication.status === "active" &&
      publication.resourceRef.id === record.id &&
      publication.resourceRef.revision === record.revision,
  );
}

function inputFor(request) {
  return request.json().catch(() => {
    throw new HabiApiError("INVALID_INPUT");
  });
}

export async function createRecord({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  if (
    playerId !== principal.playerId &&
    principal.role !== "coach" &&
    principal.role !== "parent"
  )
    throw new HabiApiError("ACCESS_DENIED");
  const body = await inputFor(request);
  if (!isValidApiInput("RecordInput", body))
    throw new HabiApiError("INVALID_INPUT");
  if (body.kind === "checkin_answer") throw new HabiApiError("ACCESS_DENIED");
  if (
    principal.role === "player" &&
    (body.kind === "observation" || body.sourceKind !== "self")
  )
    throw new HabiApiError("ACCESS_DENIED");
  if (principal.role === "parent" && body.sourceKind !== "proxy")
    throw new HabiApiError("ACCESS_DENIED");
  if (principal.role === "coach" && body.kind !== "observation")
    throw new HabiApiError("ACCESS_DENIED");
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  const sharingClass =
    principal.role === "player"
      ? "player_direct"
      : principal.role === "parent"
        ? "parent_shared"
        : "coach";
  const command = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    method: request.method,
    path: new URL(request.url).pathname,
    key,
    body,
    now: () => now,
    async execute({ db: transactionDb, session }) {
      const player = await transactionDb
        .collection("players")
        .findOne({ tenantId: principal.tenantId, id: playerId }, { session });
      const membership = await transactionDb.collection("memberships").findOne(
        {
          tenantId: principal.tenantId,
          actorId: principal.actorId,
          playerId: principal.role === "coach" ? null : playerId,
          role: principal.role,
          status: "active",
        },
        { session },
      );
      if (!player || !membership) throw new HabiApiError("NOT_FOUND");
      const record = {
        id: randomUUID(),
        tenantId: principal.tenantId,
        schemaVersion: 2,
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        retentionPolicyId: principal.retentionPolicyId,
        playerId,
        kind: body.kind,
        recordedBy: { actorId: principal.actorId, role: principal.role },
        source: {
          kind:
            body.sourceKind === "self"
              ? "self"
              : body.sourceKind === "proxy"
                ? "proxy"
                : "observation",
          respondentActorId:
            principal.role === "player" ? principal.actorId : null,
        },
        occurredAt: body.occurredAt,
        submittedAt: now.toISOString(),
        timeZone: body.timeZone,
        sharingClass,
        text: body.text,
        sessionId: body.sessionId,
        metric: body.metric,
        answerCode: body.answerCode,
        questionVersion: null,
        context: body.context,
        supersedesId: null,
      };
      validateContractDocument("records", record);
      await transactionDb.collection("records").insertOne(record, { session });
      return {
        status: 201,
        resultRef: { id: record.id, revision: record.revision },
      };
    },
  });
  const saved = await db
    .collection("records")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: recordDto(saved) };
}

function cursorMac(payload, key) {
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") < 32)
    throw new Error("CURSOR_KEY_INVALID");
  return createHmac("sha256", key)
    .update(`habi-record-cursor:${payload}`)
    .digest("base64url");
}

function encodeCursor(value, key) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${cursorMac(payload, key)}`;
}

function decodeCursor(token, key, principal, playerId, from, to, now) {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra !== undefined)
    throw new HabiApiError("INVALID_INPUT");
  const expected = Buffer.from(cursorMac(payload, key));
  const actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new HabiApiError("INVALID_INPUT");
  let value;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (
    value.version !== 1 ||
    value.tenantId !== principal.tenantId ||
    value.playerId !== playerId ||
    value.from !== from ||
    value.to !== to ||
    value.accessRevision !== principal.accessRevision ||
    !Number.isFinite(Date.parse(value.snapshotAt)) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= now.getTime() ||
    typeof value.at !== "string" ||
    typeof value.id !== "string"
  )
    throw new HabiApiError("INVALID_INPUT");
  return value;
}

/**
 * @param {{ db: any, principal: any, playerId: string, cursor?: string | null, cursorHmacKey: string, limit?: number, from?: string | null, to?: string | null, now?: Date }} options
 */
export async function listRecords({
  db,
  principal,
  playerId,
  cursor = null,
  cursorHmacKey,
  limit = PAGE_SIZE,
  from = null,
  to = null,
  now = new Date(),
}) {
  if (principal.role !== "coach" && principal.playerId !== playerId)
    throw new HabiApiError("NOT_FOUND");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new HabiApiError("INVALID_INPUT");
  if (
    (from && !Number.isFinite(Date.parse(from))) ||
    (to && !Number.isFinite(Date.parse(to))) ||
    (from && to && Date.parse(from) > Date.parse(to))
  )
    throw new HabiApiError("INVALID_INPUT");
  const publications = await db
    .collection("publications")
    .find({ tenantId: principal.tenantId, playerId, status: "active" })
    .toArray();
  const position = cursor
    ? decodeCursor(cursor, cursorHmacKey, principal, playerId, from, to, now)
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const visibility =
    principal.role === "coach"
      ? {}
      : principal.role === "player"
        ? { sharingClass: "player_direct" }
        : {
            $or: [
              { sharingClass: { $in: ["player_direct", "parent_shared"] } },
              ...publications.map((item) => ({
                id: item.resourceRef.id,
                revision: item.resourceRef.revision,
              })),
            ],
          };
  const filters = [
    {
      tenantId: principal.tenantId,
      playerId,
      submittedAt: { $lte: snapshotAt },
      ...visibility,
    },
  ];
  if (position)
    filters.push({
      $or: [
        { submittedAt: { $lt: position.at } },
        { submittedAt: position.at, id: { $lt: position.id } },
      ],
    });
  if (from) filters.push({ occurredAt: { $gte: from } });
  if (to) filters.push({ occurredAt: { $lte: to } });
  const candidates = await db
    .collection("records")
    .find({ $and: filters })
    .sort({ submittedAt: -1, id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = candidates
    .slice(0, limit)
    .filter((record) => safeRecordFor(principal, record, publications));
  const hasMore = candidates.length > limit;
  return {
    items: page.map(recordDto),
    nextCursor:
      hasMore && page.length
        ? encodeCursor(
            {
              version: 1,
              tenantId: principal.tenantId,
              playerId,
              from,
              to,
              accessRevision: principal.accessRevision,
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
  };
}

export async function getRecord({ db, principal, playerId, id }) {
  if (principal.role !== "coach" && principal.playerId !== playerId)
    throw new HabiApiError("NOT_FOUND");
  const record = await db
    .collection("records")
    .findOne({ tenantId: principal.tenantId, playerId, id });
  if (!record) throw new HabiApiError("NOT_FOUND");
  const publications = await db
    .collection("publications")
    .find({ tenantId: principal.tenantId, playerId, status: "active" })
    .toArray();
  if (!safeRecordFor(principal, record, publications))
    throw new HabiApiError("NOT_FOUND");
  return recordDto(record);
}
