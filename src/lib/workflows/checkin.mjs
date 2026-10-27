import { randomUUID } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { decodePageCursor, encodePageCursor } from "./page-cursor.mjs";

export const CHECKIN_METRICS = Object.freeze([
  "energy",
  "sleep",
  "focus",
  "mood",
  "load",
]);
const FEEDBACK_VERSION = "checkin-feedback-neutral-hu-1";
const INTERPRETATION =
  "A válaszok a saját beszámolódat rögzítik. Összpontszámot és diagnózist nem számítunk.";
const SUGGESTION =
  "Ha szeretnéd, beszélj a válaszaidról egy számodra megbízható felnőttel.";

function publicFailure(error) {
  if (error instanceof HabiApiError) return error;
  if (
    ["REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(error?.message) ||
    error?.code === 11000
  ) {
    return new HabiApiError("REVISION_CONFLICT");
  }
  if (error?.message === "INVALID_INPUT")
    return new HabiApiError("INVALID_INPUT");
  return error;
}

async function parseInput(request, schema) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput(schema, body)) throw new HabiApiError("INVALID_INPUT");
  return body;
}

function readIdempotencyKey(request) {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key)) {
    throw new HabiApiError("INVALID_INPUT");
  }
  return key;
}

function requirePlayerWrite(principal, playerId) {
  if (principal.role !== "player" || principal.playerId !== playerId) {
    throw new HabiApiError("ACCESS_DENIED");
  }
}

function requirePathId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw new HabiApiError("INVALID_INPUT");
  }
}

function baseDocument({ id = randomUUID(), tenantId, retentionPolicyId, now }) {
  const at = now.toISOString();
  return {
    id,
    tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    retentionPolicyId,
  };
}

export function checkinSessionReadDto(session, answers = []) {
  const answerByMetric = new Map(
    answers.map((answer) => [answer.metric, answer]),
  );
  return {
    id: session.id,
    revision: session.revision,
    playerId: session.playerId,
    status: session.status,
    instrumentVersion: session.instrumentVersion,
    timeZone: session.timeZone,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    answerRefs: session.answerRefs,
    answers: CHECKIN_METRICS.filter((metric) => answerByMetric.has(metric)).map(
      (metric) => answerByMetric.get(metric),
    ),
  };
}

function answerReadDto(record) {
  return {
    id: record.id,
    revision: record.revision,
    metric: record.metric,
    answerCode: record.answerCode,
    submittedAt: record.submittedAt,
  };
}

export function checkinResultReadDto(result) {
  return {
    id: result.id,
    revision: result.revision,
    playerId: result.playerId,
    sessionRef: { id: result.sessionId, revision: result.sessionRevision },
    instrumentVersion: result.instrumentVersion,
    feedbackVersion: result.feedbackVersion,
    completedAt: result.completedAt,
    answerCodes: result.answerCodes,
    sourceRefs: result.sourceRefs,
    interpretation: result.interpretation,
    suggestion: result.suggestion,
    personalText: result.personalText,
    timeZone: result.timeZone,
  };
}

async function loadAnswers(db, tenantId, sessionId, mongoSession) {
  const records = await db
    .collection("records")
    .find(
      { tenantId, sessionId, kind: "checkin_answer" },
      { session: mongoSession },
    )
    .toArray();
  records.sort(
    (a, b) =>
      CHECKIN_METRICS.indexOf(a.metric) - CHECKIN_METRICS.indexOf(b.metric),
  );
  return records;
}

async function loadSession(db, principal, id, mongoSession) {
  const playerId = principal.playerId;
  if (!playerId) throw new HabiApiError("ACCESS_DENIED");
  const session = await db
    .collection("checkin_sessions")
    .findOne(
      { tenantId: principal.tenantId, id, playerId },
      { session: mongoSession },
    );
  if (!session) throw new HabiApiError("NOT_FOUND");
  return session;
}

export async function createCheckinSession({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  try {
    requirePathId(playerId);
    requirePlayerWrite(principal, playerId);
    const body = await parseInput(request, "CheckinStartInput");
    try {
      new Intl.DateTimeFormat("en", { timeZone: body.timeZone }).format(now);
    } catch {
      throw new HabiApiError("INVALID_INPUT");
    }
    const key = readIdempotencyKey(request);
    const command = await runIdempotentCommand({
      client,
      db,
      tenantId: principal.tenantId,
      retentionPolicyId: principal.retentionPolicyId,
      actorOrClientId: principal.actorId,
      method: "POST",
      path: new URL(request.url).pathname,
      key,
      body,
      now: () => now,
      async execute({ db: transactionDb, session }) {
        const player = await transactionDb
          .collection("players")
          .findOne({ tenantId: principal.tenantId, id: playerId }, { session });
        if (!player) throw new HabiApiError("NOT_FOUND");
        const document = {
          ...baseDocument({
            tenantId: principal.tenantId,
            retentionPolicyId: principal.retentionPolicyId,
            now,
          }),
          playerId,
          status: "started",
          instrumentVersion: body.instrumentVersion,
          timeZone: body.timeZone,
          startedAt: now.toISOString(),
          completedAt: null,
          answerRefs: [],
        };
        validateContractDocument("checkin_sessions", document);
        await transactionDb
          .collection("checkin_sessions")
          .insertOne(document, { session });
        return {
          status: 201,
          resultRef: { id: document.id, revision: document.revision },
        };
      },
    });
    const session = await db
      .collection("checkin_sessions")
      .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
    if (!session) throw new Error("TRANSACTION_RESULT_MISSING");
    return { status: command.status, body: checkinSessionReadDto(session) };
  } catch (error) {
    throw publicFailure(error);
  }
}

export async function saveCheckinAnswer({
  request,
  client,
  db,
  principal,
  id,
  now = new Date(),
}) {
  try {
    requirePathId(id);
    requirePlayerWrite(principal, principal.playerId);
    const body = await parseInput(request, "CheckinAnswerInput");
    const key = readIdempotencyKey(request);
    const command = await runIdempotentCommand({
      client,
      db,
      tenantId: principal.tenantId,
      retentionPolicyId: principal.retentionPolicyId,
      actorOrClientId: principal.actorId,
      method: "POST",
      path: new URL(request.url).pathname,
      key,
      body,
      now: () => now,
      async execute({ db: transactionDb, session }) {
        const checkin = await loadSession(
          transactionDb,
          principal,
          id,
          session,
        );
        if (checkin.status !== "started" && checkin.status !== "partial") {
          throw new HabiApiError("REVISION_CONFLICT");
        }
        if (checkin.revision !== body.expectedRevision) {
          throw new HabiApiError("REVISION_CONFLICT");
        }
        if (checkin.answerRefs.length >= CHECKIN_METRICS.length) {
          throw new HabiApiError("REVISION_CONFLICT");
        }
        const existingMetric = await transactionDb
          .collection("records")
          .findOne(
            {
              tenantId: principal.tenantId,
              sessionId: checkin.id,
              metric: body.metric,
              kind: "checkin_answer",
            },
            { session },
          );
        if (existingMetric) throw new HabiApiError("REVISION_CONFLICT");
        const record = {
          ...baseDocument({
            tenantId: principal.tenantId,
            retentionPolicyId: principal.retentionPolicyId,
            now,
          }),
          playerId: principal.playerId,
          kind: "checkin_answer",
          recordedBy: { actorId: principal.actorId, role: "player" },
          source: { kind: "self", respondentActorId: principal.actorId },
          occurredAt: now.toISOString(),
          submittedAt: now.toISOString(),
          timeZone: checkin.timeZone,
          sharingClass: "player_direct",
          text: null,
          sessionId: checkin.id,
          metric: body.metric,
          answerCode: body.answerCode,
          questionVersion: checkin.instrumentVersion,
          context: null,
          supersedesId: null,
        };
        validateContractDocument("records", record);
        await transactionDb
          .collection("records")
          .insertOne(record, { session });
        const updated = await transactionDb
          .collection("checkin_sessions")
          .updateOne(
            {
              tenantId: principal.tenantId,
              id: checkin.id,
              revision: body.expectedRevision,
              status: checkin.status,
            },
            {
              $set: { status: "partial", updatedAt: now.toISOString() },
              $inc: { revision: 1 },
              $push: {
                answerRefs: { id: record.id, revision: record.revision },
              },
            },
            { session },
          );
        if (updated.modifiedCount !== 1)
          throw new HabiApiError("REVISION_CONFLICT");
        return {
          status: 201,
          resultRef: { id: record.id, revision: record.revision },
        };
      },
    });
    const record = await db
      .collection("records")
      .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
    if (!record) throw new Error("TRANSACTION_RESULT_MISSING");
    return { status: command.status, body: answerReadDto(record) };
  } catch (error) {
    throw publicFailure(error);
  }
}

export async function completeCheckin({
  request,
  client,
  db,
  principal,
  id,
  now = new Date(),
}) {
  try {
    requirePathId(id);
    requirePlayerWrite(principal, principal.playerId);
    const body = await parseInput(request, "RevisionInput");
    const key = readIdempotencyKey(request);
    const command = await runIdempotentCommand({
      client,
      db,
      tenantId: principal.tenantId,
      retentionPolicyId: principal.retentionPolicyId,
      actorOrClientId: principal.actorId,
      method: "POST",
      path: new URL(request.url).pathname,
      key,
      body,
      now: () => now,
      async execute({ db: transactionDb, session }) {
        const prior = await transactionDb
          .collection("checkin_results")
          .findOne(
            { tenantId: principal.tenantId, sessionId: id },
            { session },
          );
        if (prior)
          return {
            status: 201,
            resultRef: { id: prior.id, revision: prior.revision },
          };
        const checkin = await loadSession(
          transactionDb,
          principal,
          id,
          session,
        );
        if (checkin.status !== "started" && checkin.status !== "partial") {
          throw new HabiApiError("REVISION_CONFLICT");
        }
        if (checkin.revision !== body.expectedRevision) {
          throw new HabiApiError("REVISION_CONFLICT");
        }
        const answers = await loadAnswers(
          transactionDb,
          principal.tenantId,
          checkin.id,
          session,
        );
        if (!answers.length) throw new HabiApiError("INVALID_INPUT");
        const completedAt = now.toISOString();
        const result = {
          ...baseDocument({
            tenantId: principal.tenantId,
            retentionPolicyId: principal.retentionPolicyId,
            now,
          }),
          playerId: principal.playerId,
          sessionId: checkin.id,
          sessionRevision: checkin.revision + 1,
          instrumentVersion: checkin.instrumentVersion,
          feedbackVersion: FEEDBACK_VERSION,
          completedAt,
          timeZone: checkin.timeZone,
          sourceRefs: answers.map((answer) => ({
            id: answer.id,
            revision: answer.revision,
            span: answer.metric,
          })),
          answerCodes: answers.map((answer) => ({
            metric: answer.metric,
            code: answer.answerCode,
          })),
          interpretation: INTERPRETATION,
          suggestion: SUGGESTION,
          personalText: null,
        };
        validateContractDocument("checkin_results", result);
        const updated = await transactionDb
          .collection("checkin_sessions")
          .updateOne(
            {
              tenantId: principal.tenantId,
              id: checkin.id,
              revision: body.expectedRevision,
              status: checkin.status,
            },
            {
              $set: {
                status: "completed",
                completedAt,
                updatedAt: completedAt,
              },
              $inc: { revision: 1 },
            },
            { session },
          );
        if (updated.modifiedCount !== 1)
          throw new HabiApiError("REVISION_CONFLICT");
        await transactionDb
          .collection("checkin_results")
          .insertOne(result, { session });
        return {
          status: 201,
          resultRef: { id: result.id, revision: result.revision },
        };
      },
    });
    const result = await db
      .collection("checkin_results")
      .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
    if (!result) throw new Error("TRANSACTION_RESULT_MISSING");
    return { status: command.status, body: checkinResultReadDto(result) };
  } catch (error) {
    throw publicFailure(error);
  }
}

export async function readCheckinSession({ db, principal, id }) {
  requirePathId(id);
  const session = await loadSession(db, principal, id);
  const answers = await loadAnswers(db, principal.tenantId, id);
  return checkinSessionReadDto(session, answers.map(answerReadDto));
}

export async function listOpenCheckinSessions({ db, principal, playerId }) {
  requirePlayerWrite(principal, playerId);
  const sessions = await db
    .collection("checkin_sessions")
    .find({
      tenantId: principal.tenantId,
      playerId,
      status: { $in: ["started", "partial"] },
    })
    .sort({ startedAt: -1, id: -1 })
    .limit(20)
    .toArray();
  return {
    items: await Promise.all(
      sessions.map(async (session) =>
        checkinSessionReadDto(
          session,
          (await loadAnswers(db, principal.tenantId, session.id)).map(
            answerReadDto,
          ),
        ),
      ),
    ),
  };
}

export async function readCheckinResult({ db, principal, id }) {
  requirePathId(id);
  const result = await db.collection("checkin_results").findOne({
    tenantId: principal.tenantId,
    id,
  });
  if (
    !result ||
    (principal.role !== "coach" && result.playerId !== principal.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
  return checkinResultReadDto(result);
}

export async function listCheckinResults({
  db,
  principal,
  playerId,
  limit = 20,
  from = /** @type {string | null} */ (null),
  to = /** @type {string | null} */ (null),
  cursor = /** @type {string | null} */ (null),
  cursorHmacKey = "",
  now = new Date(),
}) {
  requirePathId(playerId);
  if (
    principal.role !== "coach" &&
    (!principal.playerId || principal.playerId !== playerId)
  ) {
    throw new HabiApiError("NOT_FOUND");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (
    (from !== null && !Number.isFinite(Date.parse(from))) ||
    (to !== null && !Number.isFinite(Date.parse(to))) ||
    (from && to && Date.parse(from) > Date.parse(to))
  ) {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (from) from = new Date(from).toISOString();
  if (to) to = new Date(to).toISOString();
  const resource = `checkin-results:${from ?? ""}:${to ?? ""}`;
  const scope = { principal, resource, scopeId: playerId, now };
  const position = cursor
    ? decodePageCursor(cursor, scope, cursorHmacKey)
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const player = await db.collection("players").findOne({
    tenantId: principal.tenantId,
    id: playerId,
  });
  if (!player) throw new HabiApiError("NOT_FOUND");
  const items = await db
    .collection("checkin_results")
    .find({
      tenantId: principal.tenantId,
      playerId,
      completedAt: {
        $lte: to && Date.parse(to) < Date.parse(snapshotAt) ? to : snapshotAt,
        ...(from ? { $gte: from } : {}),
      },
      ...(position
        ? {
            $or: [
              { completedAt: { $lt: position.at } },
              { completedAt: position.at, id: { $lt: position.id } },
            ],
          }
        : {}),
    })
    .sort({ completedAt: -1, id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = items.slice(0, limit);
  const nextCursor =
    items.length > limit
      ? encodePageCursor(
          {
            ...scope,
            snapshotAt,
            at: page.at(-1).completedAt,
            id: page.at(-1).id,
          },
          cursorHmacKey,
        )
      : null;
  return {
    items: page.map(checkinResultReadDto),
    nextCursor,
    snapshotAt,
    accessRevision: principal.accessRevision,
  };
}
