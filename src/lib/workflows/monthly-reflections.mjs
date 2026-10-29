import { randomUUID } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
import monthlyContent from "../content/monthly-reflection-v1.json" with {
  type: "json",
};

function idempotencyKey(request) {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  return key;
}

function toDto(item) {
  return {
    id: item.id,
    playerId: item.playerId,
    period: item.period,
    contentVersion: item.contentVersion,
    answers: item.answers,
    nextFocus: item.nextFocus,
    note: item.note,
    recordId: item.recordId,
    createdAt: item.createdAt,
  };
}

async function assertAccess(db, principal, playerId, session) {
  const player = await db
    .collection("players")
    .findOne({ tenantId: principal.tenantId, id: playerId }, { session });
  if (!player) throw new HabiApiError("NOT_FOUND");
  const membershipQuery = {
    tenantId: principal.tenantId,
    actorId: principal.actorId,
    role: principal.role,
    status: "active",
    ...(principal.role === "coach"
      ? { $or: [{ playerId }, { playerId: null }] }
      : { playerId }),
  };
  if (!["player", "parent", "coach"].includes(principal.role))
    throw new HabiApiError("ACCESS_DENIED");
  if (principal.role !== "coach" && principal.playerId !== playerId)
    throw new HabiApiError("NOT_FOUND");
  const membership = await db
    .collection("memberships")
    .findOne(membershipQuery, { session });
  if (!membership) throw new HabiApiError("NOT_FOUND");
}

function diaryText(input) {
  const periodLabel = `${input.period.slice(0, 4)}. ${input.period.slice(5)}.`;
  const lines = [
    `Havi visszatekintés · ${periodLabel} · v${monthlyContent.version}`,
  ];
  for (const answer of input.answers) {
    const question = monthlyContent.questions[answer.questionIndex];
    const value =
      typeof answer.value === "number"
        ? monthlyContent.choices[answer.value - 1]
        : answer.value === "not-applicable"
          ? monthlyContent.notApplicable
          : monthlyContent.skipped;
    lines.push(
      `${answer.questionIndex + 1}. ${question.domain} · ${question.text}\nVálasz: ${value}`,
    );
  }
  lines.push(
    `Amire a következő hónapban figyelek: ${input.nextFocus || "Most nem választottam."}`,
  );
  lines.push(`Saját megjegyzés: ${input.note || "Nem adtam hozzá."}`);
  return lines.join("\n");
}

export async function createMonthlyReflection({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  if (principal.role !== "player" || principal.playerId !== playerId)
    throw new HabiApiError("ACCESS_DENIED");
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (
    !isValidApiInput("MonthlyReflectionInput", body) ||
    body.answers.some((answer, index) => answer.questionIndex !== index)
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
      await assertAccess(transactionDb, principal, playerId, session);
      const draftScope = {
        tenantId: principal.tenantId,
        playerId,
        actorId: principal.actorId,
        draftKey: "monthly-reflection",
      };
      const draft = await transactionDb
        .collection("habi_experience_drafts")
        .findOne(draftScope, { session });
      if (!draft || draft.revision !== body.expectedDraftRevision)
        throw new HabiApiError("REVISION_CONFLICT");
      if (
        draft.contentVersion !== body.contentVersion ||
        !Array.isArray(draft.payload?.answers) ||
        draft.payload.answers.some(
          (value, index) => value !== body.answers[index].value,
        )
      )
        throw new HabiApiError("REVISION_CONFLICT");

      const reflections = transactionDb.collection("monthly_reflections");
      if (
        await reflections.findOne(
          { tenantId: principal.tenantId, playerId, period: body.period },
          { session },
        )
      )
        throw new HabiApiError("REVISION_CONFLICT");

      const at = now.toISOString();
      const reflectionId = randomUUID();
      const recordId = randomUUID();
      const reflection = {
        id: reflectionId,
        tenantId: principal.tenantId,
        schemaVersion: 1,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        retentionPolicyId: principal.retentionPolicyId,
        playerId,
        actorId: principal.actorId,
        period: body.period,
        contentVersion: body.contentVersion,
        answers: body.answers,
        nextFocus: body.nextFocus || null,
        note: body.note || null,
        recordId,
      };
      const record = {
        id: recordId,
        tenantId: principal.tenantId,
        schemaVersion: 2,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        retentionPolicyId: principal.retentionPolicyId,
        playerId,
        kind: "diary",
        recordedBy: { actorId: principal.actorId, role: "player" },
        source: { kind: "self", respondentActorId: principal.actorId },
        occurredAt: body.occurredAt,
        submittedAt: at,
        timeZone: body.timeZone,
        sharingClass: "player_direct",
        text: diaryText(body),
        sessionId: null,
        metric: null,
        answerCode: null,
        questionVersion: null,
        context: null,
        supersedesId: null,
      };
      validateContractDocument("monthly_reflections", reflection);
      validateContractDocument("records", record);
      await reflections.insertOne(reflection, { session });
      await transactionDb.collection("records").insertOne(record, { session });
      await transactionDb
        .collection("habi_experience_drafts")
        .deleteOne(
          { ...draftScope, revision: body.expectedDraftRevision },
          { session },
        );
      return {
        status: 201,
        resultRef: { id: reflectionId, revision: 1 },
      };
    },
  }).catch((error) => {
    if (error?.code === 11000) throw new HabiApiError("REVISION_CONFLICT");
    throw error;
  });

  const saved = await db.collection("monthly_reflections").findOne({
    tenantId: principal.tenantId,
    id: command.resultRef.id,
  });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: toDto(saved) };
}

export async function listMonthlyReflections({
  db,
  principal,
  playerId,
  limit = 24,
}) {
  await assertAccess(db, principal, playerId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 60)
    throw new HabiApiError("INVALID_INPUT");
  const items = await db
    .collection("monthly_reflections")
    .find({ tenantId: principal.tenantId, playerId })
    .sort({ period: -1, createdAt: -1 })
    .limit(limit)
    .toArray();
  return { items: items.map(toDto) };
}
