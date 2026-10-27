import { randomUUID } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
import {
  decodePageCursor,
  encodePageCursor,
  pageFilter,
} from "./page-cursor.mjs";

const base = (id, principal, now) => ({
  id,
  tenantId: principal.tenantId,
  schemaVersion: 2,
  revision: 1,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  retentionPolicyId: principal.retentionPolicyId,
});

async function bodyOf(request, schema) {
  let value;
  try {
    value = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput(schema, value)) throw new HabiApiError("INVALID_INPUT");
  return value;
}

function assertPlayerScope(principal, playerId) {
  if (principal.playerId !== playerId && principal.role !== "coach")
    throw new HabiApiError("NOT_FOUND");
}

async function hasReadableSource(db, principal, playerId, ref) {
  const candidates = [
    "records",
    "checkin_results",
    "reports",
    "extractions",
    "interpretations",
  ];
  for (const collectionName of candidates) {
    const item = await db.collection(collectionName).findOne({
      tenantId: principal.tenantId,
      playerId,
      id: ref.id,
      revision: ref.revision,
    });
    if (!item) continue;
    if (principal.role !== "parent" || collectionName !== "records")
      return true;
    if (["player_direct", "parent_shared"].includes(item.sharingClass))
      return true;
    const publication = await db.collection("publications").findOne({
      tenantId: principal.tenantId,
      playerId,
      status: "active",
      resourceRef: { id: ref.id, revision: ref.revision },
    });
    return Boolean(publication);
  }
  return false;
}

function dto(plan) {
  return {
    id: plan.id,
    revision: plan.revision,
    playerId: plan.playerId,
    status: plan.status,
    sourceRefs: plan.sourceRefs,
    actions: plan.actions,
    acceptances: plan.acceptances,
  };
}

export async function createPlan({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  assertPlayerScope(principal, playerId);
  if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
  const input = await bodyOf(request, "ActionInput");
  if (input.sourceRefs.length === 0 && input.answerRef === null)
    throw new HabiApiError("INVALID_INPUT");
  for (const ref of input.sourceRefs) {
    if (!(await hasReadableSource(db, principal, playerId, ref)))
      throw new HabiApiError("NOT_FOUND");
  }
  if (
    input.answerRef &&
    !(await hasReadableSource(db, principal, playerId, input.answerRef))
  )
    throw new HabiApiError("NOT_FOUND");
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  for (const action of input.actions) {
    const owner = await db.collection("memberships").findOne({
      tenantId: principal.tenantId,
      actorId: action.ownerActorId,
      status: "active",
      $or: [{ playerId }, { playerId: null, role: "coach" }],
    });
    if (!owner) throw new HabiApiError("INVALID_INPUT");
  }
  const id = randomUUID();
  const plan = {
    ...base(id, principal, now),
    playerId,
    status: "proposed",
    sourceRefs: input.sourceRefs,
    answerRef: input.answerRef,
    actions: input.actions,
    acceptances: [],
  };
  validateContractDocument("plans", plan);
  const command = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    method: request.method,
    path: new URL(request.url).pathname,
    key,
    body: input,
    now: () => now,
    async execute({ db: transactionDb, session }) {
      const player = await transactionDb
        .collection("players")
        .findOne({ tenantId: principal.tenantId, id: playerId }, { session });
      if (!player) throw new HabiApiError("NOT_FOUND");
      await transactionDb.collection("plans").insertOne(plan, { session });
      return { status: 201, resultRef: { id, revision: 1 } };
    },
  });
  const saved = await db
    .collection("plans")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: dto(saved) };
}

export async function listPlans({
  db,
  principal,
  playerId,
  cursor = /** @type {string | null} */ (null),
  cursorHmacKey,
  limit = 50,
  now = new Date(),
}) {
  assertPlayerScope(principal, playerId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new HabiApiError("INVALID_INPUT");
  const position = cursor
    ? decodePageCursor(
        cursor,
        { principal, resource: "plans", scopeId: playerId, now },
        cursorHmacKey,
      )
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const rows = await db
    .collection("plans")
    .find({
      tenantId: principal.tenantId,
      playerId,
      ...pageFilter({ snapshotAt, position }),
    })
    .sort({ createdAt: -1, id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit && page.length
      ? encodePageCursor(
          {
            principal,
            resource: "plans",
            scopeId: playerId,
            snapshotAt,
            at: page.at(-1).createdAt,
            id: page.at(-1).id,
            now,
          },
          cursorHmacKey,
        )
      : null;
  return {
    items: page.map(dto),
    nextCursor,
    snapshotAt,
    accessRevision: principal.accessRevision,
  };
}

export async function getPlan({ db, principal, id }) {
  const plan = await db
    .collection("plans")
    .findOne({ tenantId: principal.tenantId, id });
  if (
    !plan ||
    (principal.role !== "coach" && principal.playerId !== plan.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
  return dto(plan);
}

async function mutatePlan({
  request,
  client,
  db,
  principal,
  id,
  schema,
  mutate,
  now = new Date(),
}) {
  const input = await bodyOf(request, schema);
  const key = request.headers.get("idempotency-key");
  const expected = request.headers.get("if-match");
  if (
    !key ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key) ||
    !/^[1-9][0-9]*$/.test(expected ?? "")
  )
    throw new HabiApiError("INVALID_INPUT");
  const command = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    method: request.method,
    path: new URL(request.url).pathname,
    key,
    body: input,
    now: () => now,
    async execute({ db: transactionDb, session }) {
      const plan = await transactionDb
        .collection("plans")
        .findOne({ tenantId: principal.tenantId, id }, { session });
      if (
        !plan ||
        (principal.role !== "coach" && principal.playerId !== plan.playerId)
      )
        throw new HabiApiError("NOT_FOUND");
      if (
        plan.revision !== Number(expected) ||
        input.expectedRevision !== plan.revision
      )
        throw new HabiApiError("REVISION_CONFLICT");
      const patch = mutate(plan, input, principal, now);
      if (!patch) throw new HabiApiError("ACCESS_DENIED");
      const updated = {
        ...plan,
        ...patch,
        revision: plan.revision + 1,
        updatedAt: now.toISOString(),
      };
      validateContractDocument("plans", updated);
      const result = await transactionDb
        .collection("plans")
        .replaceOne(
          { tenantId: principal.tenantId, id, revision: plan.revision },
          updated,
          { session },
        );
      if (result.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return { status: 200, resultRef: { id, revision: updated.revision } };
    },
  });
  const saved = await db
    .collection("plans")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: dto(saved) };
}

export function decidePlan(args) {
  return mutatePlan({
    ...args,
    schema: "PlanDecisionInput",
    mutate(plan, input, principal, now) {
      if (
        !["parent", "player"].includes(principal.role) ||
        plan.status !== "proposed"
      )
        return null;
      return {
        status: input.decision === "accept" ? "active" : "declined",
        acceptances: [
          ...plan.acceptances,
          {
            actorId: principal.actorId,
            role: principal.role,
            revision: plan.revision,
            decision: input.decision,
            at: now.toISOString(),
          },
        ],
      };
    },
  });
}

export function transitionPlan(args) {
  return mutatePlan({
    ...args,
    schema: "PlanTransitionInput",
    mutate(plan, input, principal) {
      if (
        principal.role !== "coach" ||
        !["active", "paused"].includes(plan.status)
      )
        return null;
      if (input.status === "withdrawn" && plan.status === "active")
        return { status: "withdrawn" };
      if (input.status === "paused" && plan.status === "active")
        return { status: "paused" };
      if (
        input.status === "completed" &&
        ["active", "paused"].includes(plan.status)
      )
        return { status: "completed" };
      return null;
    },
  });
}

export async function createFollowUp({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  assertPlayerScope(principal, playerId);
  const input = await bodyOf(request, "FollowUpInput");
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  const followUp = {
    ...base(randomUUID(), principal, now),
    playerId,
    planRef: input.planRef,
    actionId: input.actionId,
    recordedBy: { actorId: principal.actorId, role: principal.role },
    source: {
      kind:
        principal.role === "player"
          ? "self"
          : principal.role === "parent"
            ? "proxy"
            : "observation",
      respondentActorId: principal.role === "player" ? principal.actorId : null,
    },
    occurredAt: input.occurredAt,
    context: input.context,
    outcome: input.outcome,
    text: input.text,
    comparable: input.comparable,
    comparabilityReason: input.comparabilityReason,
  };
  const command = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    method: request.method,
    path: new URL(request.url).pathname,
    key,
    body: input,
    now: () => now,
    async execute({ db: transactionDb, session }) {
      const plan = await transactionDb
        .collection("plans")
        .findOne(
          { tenantId: principal.tenantId, playerId, id: input.planRef.id },
          { session },
        );
      if (
        !plan ||
        plan.revision !== input.planRef.revision ||
        plan.status !== "active" ||
        !plan.actions.some((item) => item.id === input.actionId)
      )
        throw new HabiApiError("NOT_FOUND");
      validateContractDocument("follow_ups", followUp);
      await transactionDb
        .collection("follow_ups")
        .insertOne(followUp, { session });
      return { status: 201, resultRef: { id: followUp.id, revision: 1 } };
    },
  });
  const saved = await db
    .collection("follow_ups")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: followUpDto(saved) };
}

function followUpDto(item) {
  return {
    id: item.id,
    revision: item.revision,
    playerId: item.playerId,
    planRef: item.planRef,
    actionId: item.actionId,
    recordedBy: item.recordedBy,
    source: item.source,
    occurredAt: item.occurredAt,
    outcome: item.outcome,
    text: item.text,
  };
}

export async function listFollowUps({
  db,
  principal,
  playerId,
  cursor = /** @type {string | null} */ (null),
  cursorHmacKey,
  limit = 50,
  now = new Date(),
}) {
  assertPlayerScope(principal, playerId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new HabiApiError("INVALID_INPUT");
  const position = cursor
    ? decodePageCursor(
        cursor,
        { principal, resource: "follow-ups", scopeId: playerId, now },
        cursorHmacKey,
      )
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const rows = await db
    .collection("follow_ups")
    .find({
      tenantId: principal.tenantId,
      playerId,
      ...pageFilter({ snapshotAt, position }),
    })
    .sort({ createdAt: -1, id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit && page.length
      ? encodePageCursor(
          {
            principal,
            resource: "follow-ups",
            scopeId: playerId,
            snapshotAt,
            at: page.at(-1).createdAt,
            id: page.at(-1).id,
            now,
          },
          cursorHmacKey,
        )
      : null;
  return {
    items: page.map(followUpDto),
    nextCursor,
    snapshotAt,
    accessRevision: principal.accessRevision,
  };
}

export async function getFollowUp({ db, principal, id }) {
  const item = await db
    .collection("follow_ups")
    .findOne({ tenantId: principal.tenantId, id });
  if (
    !item ||
    (principal.role !== "coach" && principal.playerId !== item.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
  return followUpDto(item);
}
