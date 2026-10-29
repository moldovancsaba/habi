import { randomUUID } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
import { isValidGuidedConversationDraft } from "./guided-conversations.mjs";

const DRAFT_KEYS = new Set([
  "daily-reflection",
  "weekly-reflection",
  "monthly-reflection",
  "guided-conversation",
  "guided-topic-conversation",
  "player-workspace",
  "support-loop",
]);
const MAX_TEXT = 1000;

function assertOwner(principal, playerId, draftKey) {
  if (!DRAFT_KEYS.has(draftKey)) throw new HabiApiError("NOT_FOUND");
  if (principal.role !== "player" || principal.playerId !== playerId)
    throw new HabiApiError("ACCESS_DENIED");
}

function dto(draft) {
  if (!draft) return null;
  return {
    id: draft.id,
    revision: draft.revision,
    playerId: draft.playerId,
    draftKey: draft.draftKey,
    contentVersion: draft.contentVersion,
    payload: draft.payload,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

export function isValidExperienceDraftPayload(
  draftKey,
  contentVersion,
  payload,
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return false;
  if (["player-workspace", "support-loop"].includes(draftKey)) {
    const keys =
      draftKey === "player-workspace"
        ? [
            "goal",
            "routine",
            "practice",
            "prepPerson",
            "prepSituation",
            "prepHelp",
            "example",
            "practiceGoalId",
          ]
        : ["event", "returnPlan", "review"];
    return (
      contentVersion === `${draftKey}-v1` &&
      Object.keys(payload).every((key) => keys.includes(key)) &&
      Object.values(payload).every(
        (value) => typeof value === "string" && value.length <= 2000,
      )
    );
  }
  if (draftKey === "daily-reflection")
    return (
      contentVersion === "daily-reflection-v1" &&
      Object.keys(payload).length === 2 &&
      ["moment", "helped"].every(
        (key) =>
          typeof payload[key] === "string" && payload[key].length <= MAX_TEXT,
      )
    );
  if (draftKey === "weekly-reflection")
    return (
      contentVersion === "weekly-reflection-v1" &&
      Object.keys(payload).length === 3 &&
      ["helped", "hard", "next"].every(
        (key) =>
          typeof payload[key] === "string" && payload[key].length <= MAX_TEXT,
      )
    );
  if (draftKey === "guided-conversation")
    return (
      ["guided-situation-v1", "guided-situation-v2"].includes(contentVersion) &&
      Object.keys(payload).length ===
        (contentVersion === "guided-situation-v2" ? 3 : 2) &&
      [
        "after-mistake",
        "too-fast",
        "too-many-instructions",
        "afraid-to-try",
        "disagreement",
        "outside-pressure",
        "less-joy",
        "asking-clarity",
        "feeling-left-out",
      ].includes(payload.situationId) &&
      Array.isArray(payload.answers) &&
      payload.answers.length <= 3 &&
      payload.answers.every(
        (answer) => Number.isInteger(answer) && answer >= 0 && answer <= 2,
      ) &&
      (contentVersion === "guided-situation-v1" ||
        (typeof payload.sourceCheckinId === "string" &&
          /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(payload.sourceCheckinId)))
    );
  if (draftKey === "guided-topic-conversation")
    return (
      ["guided-chat-v2", "guided-chat-v3"].includes(contentVersion) &&
      Object.keys(payload).length >= 2 &&
      Object.keys(payload).length <= 3 &&
      Object.keys(payload).every((key) =>
        [
          "categoryId",
          "turns",
          ...(contentVersion === "guided-chat-v3" ? ["opening"] : []),
        ].includes(key),
      ) &&
      isValidGuidedConversationDraft(payload)
    );
  return (
    draftKey === "monthly-reflection" &&
    contentVersion === "monthly-reflection-v1" &&
    Object.keys(payload).length === 4 &&
    Number.isInteger(payload.step) &&
    payload.step >= 0 &&
    payload.step <= 16 &&
    Array.isArray(payload.answers) &&
    payload.answers.length === 16 &&
    payload.answers.every(
      (answer) =>
        answer === null ||
        answer === "skip" ||
        answer === "not-applicable" ||
        (Number.isInteger(answer) && answer >= 1 && answer <= 5),
    ) &&
    typeof payload.nextFocus === "string" &&
    payload.nextFocus.length <= 500 &&
    typeof payload.note === "string" &&
    payload.note.length <= 1000
  );
}

function idempotencyKey(request) {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  return key;
}

async function ensurePlayerMembership(db, principal, playerId, session) {
  const player = await db
    .collection("players")
    .findOne({ tenantId: principal.tenantId, id: playerId }, { session });
  const membership = await db.collection("memberships").findOne(
    {
      tenantId: principal.tenantId,
      actorId: principal.actorId,
      playerId,
      role: "player",
      status: "active",
    },
    { session },
  );
  if (!player || !membership) throw new HabiApiError("NOT_FOUND");
}

export async function readExperienceDraft({
  db,
  principal,
  playerId,
  draftKey,
}) {
  assertOwner(principal, playerId, draftKey);
  await ensurePlayerMembership(db, principal, playerId);
  const draft = await db.collection("habi_experience_drafts").findOne({
    tenantId: principal.tenantId,
    playerId,
    actorId: principal.actorId,
    draftKey,
  });
  return { draft: dto(draft) };
}

export async function saveExperienceDraft({
  request,
  client,
  db,
  principal,
  playerId,
  draftKey,
  now = new Date(),
}) {
  assertOwner(principal, playerId, draftKey);
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (
    !isValidApiInput("ExperienceDraftWriteInput", body) ||
    !isValidExperienceDraftPayload(draftKey, body.contentVersion, body.payload)
  )
    throw new HabiApiError("INVALID_INPUT");

  const command = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    actorRole: principal.role,
    activityPlayerId: principal.playerId ?? null,
    method: request.method,
    path: new URL(request.url).pathname,
    key: idempotencyKey(request),
    body,
    now: () => now,
    async execute({ db: transactionDb, session }) {
      await ensurePlayerMembership(transactionDb, principal, playerId, session);
      if (
        draftKey === "guided-conversation" &&
        body.contentVersion === "guided-situation-v2"
      ) {
        const sourceCheckin = await transactionDb
          .collection("checkin_results")
          .findOne(
            {
              tenantId: principal.tenantId,
              playerId,
              id: body.payload.sourceCheckinId,
            },
            { session },
          );
        const sourceMetric =
          body.payload.situationId === "too-fast"
            ? "focus"
            : body.payload.situationId === "afraid-to-try"
              ? "mood"
              : null;
        const sourceAnswer = sourceCheckin?.answerCodes?.find(
          (answer) => answer.metric === sourceMetric,
        );
        if (!sourceAnswer || ![2, 3].includes(sourceAnswer.code))
          throw new HabiApiError("NOT_FOUND");
      }
      const collection = transactionDb.collection("habi_experience_drafts");
      const scope = {
        tenantId: principal.tenantId,
        playerId,
        actorId: principal.actorId,
        draftKey,
      };
      const current = await collection.findOne(scope, { session });
      if ((current?.revision ?? 0) !== body.expectedRevision)
        throw new HabiApiError("REVISION_CONFLICT");
      const at = now.toISOString();
      if (!current) {
        const draft = {
          id: randomUUID(),
          tenantId: principal.tenantId,
          schemaVersion: 2,
          revision: 1,
          createdAt: at,
          updatedAt: at,
          retentionPolicyId: principal.retentionPolicyId,
          playerId,
          actorId: principal.actorId,
          draftKey,
          contentVersion: body.contentVersion,
          payload: body.payload,
        };
        validateContractDocument("habi_experience_drafts", draft);
        await collection.insertOne(draft, { session });
        return { status: 201, resultRef: { id: draft.id, revision: 1 } };
      }
      const updated = await collection.updateOne(
        { ...scope, revision: body.expectedRevision },
        {
          $set: {
            contentVersion: body.contentVersion,
            payload: body.payload,
            updatedAt: at,
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (updated.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return {
        status: 200,
        resultRef: { id: current.id, revision: body.expectedRevision + 1 },
      };
    },
  });
  const draft = await db.collection("habi_experience_drafts").findOne({
    tenantId: principal.tenantId,
    playerId,
    actorId: principal.actorId,
    draftKey,
    id: command.resultRef.id,
  });
  if (!draft) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: { draft: dto(draft) } };
}

export async function deleteExperienceDraft({
  request,
  client,
  db,
  principal,
  playerId,
  draftKey,
}) {
  assertOwner(principal, playerId, draftKey);
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (
    !body ||
    Object.keys(body).length !== 1 ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 0
  )
    throw new HabiApiError("INVALID_INPUT");
  const command = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    actorRole: principal.role,
    activityPlayerId: principal.playerId ?? null,
    method: request.method,
    path: new URL(request.url).pathname,
    key: idempotencyKey(request),
    body,
    async execute({ db: transactionDb, session }) {
      await ensurePlayerMembership(transactionDb, principal, playerId, session);
      const collection = transactionDb.collection("habi_experience_drafts");
      const scope = {
        tenantId: principal.tenantId,
        playerId,
        actorId: principal.actorId,
        draftKey,
      };
      const current = await collection.findOne(scope, { session });
      if ((current?.revision ?? 0) !== body.expectedRevision)
        throw new HabiApiError("REVISION_CONFLICT");
      if (current)
        await collection.deleteOne(
          { ...scope, revision: current.revision },
          { session },
        );
      return { status: 200, resultRef: null };
    },
  });
  return { status: command.status, body: { cleared: true } };
}
