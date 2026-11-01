import { randomUUID } from "node:crypto";
import content from "../content/coach-assessments-v1.json" with {
  type: "json",
};
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { buildCoachAssessment } from "./coach-assessments.mjs";

const invalid = () => {
  throw new HabiApiError("INVALID_INPUT");
};
async function authorise(db, principal, playerId, session) {
  if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
  const opts = session ? { session } : undefined;
  const player = await db
    .collection("players")
    .findOne({ tenantId: principal.tenantId, id: playerId }, opts);
  const membership = await db.collection("memberships").findOne(
    {
      tenantId: principal.tenantId,
      actorId: principal.actorId,
      role: "coach",
      playerId: null,
      status: "active",
    },
    opts,
  );
  if (!player || !membership) throw new HabiApiError("NOT_FOUND");
}
function dto(a) {
  return {
    id: a.id,
    revision: a.revision,
    playerId: a.playerId,
    status: a.status,
    actorId: a.actorId ?? null,
    createdAt: a.createdAt,
    expiresAt: a.expiresAt,
    capture: a.capture ?? null,
    submittedItems: a.submittedItems ?? [],
    resultRef: a.resultRef ?? null,
  };
}
export async function readAssessmentAttempt({
  db,
  principal,
  id,
  now = new Date(),
}) {
  const a = await db
    .collection("assessment_attempts")
    .findOne({ tenantId: principal.tenantId, id });
  if (!a) throw new HabiApiError("NOT_FOUND");
  await authorise(db, principal, a.playerId);
  // Expired attempts cannot resume. The expiry boundary is deterministic even before an operator sweep.
  return dto(
    a.status === "started" && a.expiresAt <= now.toISOString()
      ? { ...a, status: "expired" }
      : a,
  );
}
export async function listAssessmentAttempts({ db, principal, playerId }) {
  await authorise(db, principal, playerId);
  const items = await db
    .collection("assessment_attempts")
    .find({ tenantId: principal.tenantId, playerId })
    .sort({ createdAt: -1, id: -1 })
    .limit(100)
    .toArray();
  return { items: items.map(dto) };
}
export async function writeAssessmentAttempt({
  request,
  client,
  db,
  principal,
  playerId = /** @type {string | null} */ (null),
  id = /** @type {string | null} */ (null),
  action = "start",
  now = new Date(),
}) {
  let input;
  try {
    input = await request.json();
  } catch {
    invalid();
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key)) invalid();
  if (!id) {
    if (
      !isValidApiInput("CoachAssessmentInput", input) ||
      input.answers !== undefined ||
      !content.topics.some((t) => t.id === input.topicId)
    )
      invalid();
    if (
      input.mode === "cognitive" &&
      !content.topics.some(
        (t) => t.id === input.topicId && t.domain === "cognitive",
      )
    )
      invalid();
  } else {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      invalid();
    const allowed =
      action === "answers"
        ? ["expectedRevision", "itemId", "value"]
        : action === "complete"
          ? ["expectedRevision", "fields"]
          : ["expectedRevision"];
    if (Object.keys(input).some((k) => !allowed.includes(k))) invalid();
    const prior = await db
      .collection("assessment_attempts")
      .findOne({ tenantId: principal.tenantId, id });
    if (!prior) throw new HabiApiError("NOT_FOUND");
    playerId = prior.playerId;
  }
  await authorise(db, principal, playerId);
  const receipt = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    actorRole: principal.role,
    activityPlayerId: playerId,
    method: request.method,
    path: new URL(request.url).pathname,
    key,
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      await authorise(tx, principal, playerId, session);
      const at = now.toISOString();
      if (!id) {
        const a = {
          id: randomUUID(),
          tenantId: principal.tenantId,
          schemaVersion: 2,
          revision: 1,
          createdAt: at,
          updatedAt: at,
          retentionPolicyId: principal.retentionPolicyId,
          playerId,
          instrumentManifestId: `coach-assessments-${String(content.version).replace(/[^A-Za-z0-9_-]/g, "-")}`,
          status: "started",
          context: {
            setting: "training",
            activity: `coach-assessment:${input.topicId}`,
            durationMinutes: null,
          },
          lastAnsweredAt: at,
          expiresAt: new Date(now.getTime() + 4 * 3600000).toISOString(),
          answerRefs: [],
          actorId: principal.actorId,
          capture: { ...input, answers: [] },
          submittedItems: [],
          resultRef: null,
        };
        validateContractDocument("assessment_attempts", a);
        await tx.collection("assessment_attempts").insertOne(a, { session });
        return { status: 201, resultRef: { id: a.id, revision: 1 } };
      }
      const a = await tx
        .collection("assessment_attempts")
        .findOne({ tenantId: principal.tenantId, id }, { session });
      if (!a || a.actorId !== principal.actorId)
        throw new HabiApiError("NOT_FOUND");
      if (a.revision !== input.expectedRevision || a.status !== "started")
        throw new HabiApiError("REVISION_CONFLICT");
      if (!a.capture) throw new HabiApiError("REVISION_CONFLICT");
      const next = { ...a, revision: a.revision + 1, updatedAt: at };
      delete next._id;
      if (a.expiresAt <= at) {
        next.status = "expired";
      } else if (action === "answers") {
        const item = content.items.find(
          (i) => i.id === input.itemId && i.construct_id === a.capture.topicId,
        );
        if (
          a.capture.mode !== "questionnaire" ||
          !item ||
          !(
            input.value === null ||
            (Number.isInteger(input.value) &&
              input.value >= 1 &&
              input.value <= 5)
          )
        )
          invalid();
        if (a.submittedItems.some((i) => i.itemId === item.id))
          throw new HabiApiError("REVISION_CONFLICT");
        next.submittedItems = [
          ...a.submittedItems,
          {
            itemId: item.id,
            itemVersion: String(item.version),
            value: input.value,
            submittedAt: at,
          },
        ];
        next.lastAnsweredAt = at;
      } else if (action === "interrupt") {
        next.status = "interrupted";
      } else if (action === "complete") {
        const fields = input.fields ?? {};
        if (
          !fields ||
          typeof fields !== "object" ||
          Array.isArray(fields) ||
          Object.keys(fields).some(
            (k) =>
              ![
                "context",
                "example",
                "reflection",
                "scenarioId",
                "value",
                "scale",
                "source",
                "reference",
              ].includes(k),
          )
        )
          invalid();
        const items = content.items.filter(
          (i) => i.construct_id === a.capture.topicId,
        );
        if (
          a.capture.mode === "questionnaire" &&
          items.some(
            (item) => !a.submittedItems.some((s) => s.itemId === item.id),
          )
        )
          invalid();
        const capture = {
          ...a.capture,
          ...fields,
          answers: items.map(
            (i) =>
              a.submittedItems.find((s) => s.itemId === i.id)?.value ?? null,
          ),
        };
        const text = buildCoachAssessment(capture);
        const result = {
          id: randomUUID(),
          tenantId: principal.tenantId,
          schemaVersion: 2,
          revision: 1,
          createdAt: at,
          updatedAt: at,
          retentionPolicyId: principal.retentionPolicyId,
          playerId,
          kind: "observation",
          recordedBy: { actorId: principal.actorId, role: "coach" },
          source: {
            kind: capture.mode === "cognitive" ? "observation" : "proxy",
            respondentActorId: null,
          },
          occurredAt: at,
          submittedAt: at,
          timeZone: "UTC",
          sharingClass: "coach",
          text,
          sessionId: a.id,
          metric: null,
          answerCode: null,
          questionVersion: null,
          context: a.context,
          supersedesId: null,
        };
        validateContractDocument("records", result);
        await tx.collection("records").insertOne(result, { session });
        next.status = "completed";
        next.capture = capture;
        next.resultRef = { id: result.id, revision: 1 };
      } else invalid();
      validateContractDocument("assessment_attempts", next);
      const changed = await tx.collection("assessment_attempts").replaceOne(
        {
          tenantId: principal.tenantId,
          id,
          revision: a.revision,
          status: "started",
        },
        next,
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return { status: 200, resultRef: { id, revision: next.revision } };
    },
  });
  return {
    status: receipt.status,
    body: await readAssessmentAttempt({
      db,
      principal,
      id: receipt.resultRef.id,
      now,
    }),
  };
}
