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

function checkScope(principal, thread) {
  if (
    !thread ||
    thread.tenantId !== principal.tenantId ||
    (principal.role !== "coach" && thread.playerId !== principal.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
}
function threadDto(thread, latestActivityAt = thread.updatedAt) {
  return {
    id: thread.id,
    revision: thread.revision,
    playerId: thread.playerId,
    status: thread.status,
    openedAt: thread.openedAt,
    closedAt: thread.closedAt,
    latestActivityAt,
  };
}
function messageDto(message) {
  return {
    id: message.id,
    revision: message.revision,
    threadId: message.threadId,
    recordedBy: { displayName: null, role: message.recordedBy.role },
    replyTo: message.replyTo,
    text: message.text,
    submittedAt: message.submittedAt,
  };
}
function inputOf(request, name) {
  return request
    .json()
    .catch(() => {
      throw new HabiApiError("INVALID_INPUT");
    })
    .then((input) => {
      if (!isValidApiInput(name, input))
        throw new HabiApiError("INVALID_INPUT");
      return input;
    });
}
function idempotencyKey(request) {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  return key;
}

export async function createThread({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  if (!["parent", "coach"].includes(principal.role))
    throw new HabiApiError("ACCESS_DENIED");
  if (principal.role !== "coach" && principal.playerId !== playerId)
    throw new HabiApiError("NOT_FOUND");
  const input = await inputOf(request, "MessageInput");
  if (input.replyTo !== null || !input.text.trim())
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
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      const player = await tx
        .collection("players")
        .findOne({ tenantId: principal.tenantId, id: playerId }, { session });
      if (!player) throw new HabiApiError("NOT_FOUND");
      const common = {
        tenantId: principal.tenantId,
        playerId,
        schemaVersion: 2,
        revision: 1,
        retentionPolicyId: principal.retentionPolicyId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      const thread = {
        ...common,
        id: randomUUID(),
        status: "open",
        openedAt: now.toISOString(),
        closedAt: null,
      };
      const message = {
        ...common,
        id: randomUUID(),
        threadId: thread.id,
        replyTo: null,
        recordedBy: { actorId: principal.actorId, role: principal.role },
        text: input.text.trim(),
        submittedAt: now.toISOString(),
      };
      validateContractDocument("threads", thread);
      validateContractDocument("messages", message);
      await tx.collection("threads").insertOne(thread, { session });
      await tx.collection("messages").insertOne(message, { session });
      return { status: 201, resultRef: { id: thread.id, revision: 1 } };
    },
  });
  return {
    status: command.status,
    body: await getThread({ db, principal, id: command.resultRef.id }),
  };
}

export async function getThread({ db, principal, id }) {
  const thread = await db
    .collection("threads")
    .findOne({ tenantId: principal.tenantId, id });
  checkScope(principal, thread);
  const latest = await db
    .collection("messages")
    .find({ tenantId: principal.tenantId, threadId: id })
    .sort({ submittedAt: -1 })
    .limit(1)
    .next();
  return threadDto(thread, latest?.submittedAt ?? thread.openedAt);
}

export async function listThreads({
  db,
  principal,
  playerId = principal.playerId,
  cursor = /** @type {string | null} */ (null),
  cursorHmacKey,
  limit = 50,
  now = new Date(),
}) {
  if (principal.role !== "coach" && playerId !== principal.playerId)
    throw new HabiApiError("NOT_FOUND");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new HabiApiError("INVALID_INPUT");
  const position = cursor
    ? decodePageCursor(
        cursor,
        { principal, resource: "threads", scopeId: playerId, now },
        cursorHmacKey,
      )
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const threads = await db
    .collection("threads")
    .find({
      tenantId: principal.tenantId,
      playerId,
      ...pageFilter({ snapshotAt, position, timestampField: "openedAt" }),
    })
    .sort({ openedAt: -1, id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = threads.slice(0, limit);
  const items = await Promise.all(
    page.map(async (thread) => {
      const latest = await db
        .collection("messages")
        .find({ tenantId: principal.tenantId, threadId: thread.id })
        .sort({ submittedAt: -1 })
        .limit(1)
        .next();
      return threadDto(thread, latest?.submittedAt ?? thread.openedAt);
    }),
  );
  const nextCursor =
    threads.length > limit && page.length
      ? encodePageCursor(
          {
            principal,
            resource: "threads",
            scopeId: playerId,
            snapshotAt,
            at: page.at(-1).openedAt,
            id: page.at(-1).id,
            now,
          },
          cursorHmacKey,
        )
      : null;
  return {
    items,
    nextCursor,
    snapshotAt,
    accessRevision: principal.accessRevision,
  };
}

export async function listMessages({
  db,
  principal,
  threadId,
  cursor = /** @type {string | null} */ (null),
  cursorHmacKey,
  limit = 50,
  now = new Date(),
}) {
  const thread = await db
    .collection("threads")
    .findOne({ tenantId: principal.tenantId, id: threadId });
  checkScope(principal, thread);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new HabiApiError("INVALID_INPUT");
  const resource = `messages:${threadId}`;
  const position = cursor
    ? decodePageCursor(
        cursor,
        { principal, resource, scopeId: thread.playerId, now },
        cursorHmacKey,
      )
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const rows = await db
    .collection("messages")
    .find({
      tenantId: principal.tenantId,
      threadId,
      ...pageFilter({ snapshotAt, position, timestampField: "submittedAt" }),
    })
    .sort({ submittedAt: -1, id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit && page.length
      ? encodePageCursor(
          {
            principal,
            resource,
            scopeId: thread.playerId,
            snapshotAt,
            at: page.at(-1).submittedAt,
            id: page.at(-1).id,
            now,
          },
          cursorHmacKey,
        )
      : null;
  return {
    items: page.map(messageDto),
    nextCursor,
    snapshotAt,
    accessRevision: principal.accessRevision,
  };
}

export async function createMessage({
  request,
  client,
  db,
  principal,
  threadId,
  now = new Date(),
}) {
  const input = await inputOf(request, "MessageInput");
  const key = idempotencyKey(request);
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
    key,
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      const thread = await tx
        .collection("threads")
        .findOne({ tenantId: principal.tenantId, id: threadId }, { session });
      checkScope(principal, thread);
      if (thread.status !== "open") throw new HabiApiError("REVISION_CONFLICT");
      if (input.replyTo) {
        const parent = await tx
          .collection("messages")
          .findOne(
            { tenantId: principal.tenantId, threadId, id: input.replyTo },
            { session },
          );
        if (!parent) throw new HabiApiError("NOT_FOUND");
      }
      const message = {
        id: randomUUID(),
        tenantId: principal.tenantId,
        schemaVersion: 2,
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        retentionPolicyId: principal.retentionPolicyId,
        playerId: thread.playerId,
        threadId,
        replyTo: input.replyTo,
        recordedBy: { actorId: principal.actorId, role: principal.role },
        text: input.text,
        submittedAt: now.toISOString(),
      };
      validateContractDocument("messages", message);
      await tx.collection("messages").insertOne(message, { session });
      const updated = await tx.collection("threads").updateOne(
        {
          tenantId: principal.tenantId,
          id: threadId,
          revision: thread.revision,
          status: "open",
        },
        { $set: { updatedAt: now.toISOString() }, $inc: { revision: 1 } },
        { session },
      );
      if (updated.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return { status: 201, resultRef: { id: message.id, revision: 1 } };
    },
  });
  const saved = await db
    .collection("messages")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: messageDto(saved) };
}

export async function setThreadState({
  request,
  client,
  db,
  principal,
  id,
  state,
  now = new Date(),
}) {
  const input = await inputOf(request, "RevisionInput");
  const key = idempotencyKey(request);
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
    key,
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      const thread = await tx
        .collection("threads")
        .findOne({ tenantId: principal.tenantId, id }, { session });
      checkScope(principal, thread);
      if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
      if (thread.revision !== input.expectedRevision)
        throw new HabiApiError("REVISION_CONFLICT");
      const from = state === "closed" ? "open" : "closed";
      if (thread.status !== from) throw new HabiApiError("REVISION_CONFLICT");
      const updated = await tx.collection("threads").updateOne(
        {
          tenantId: principal.tenantId,
          id,
          revision: thread.revision,
          status: from,
        },
        {
          $set: {
            status: state,
            closedAt: state === "closed" ? now.toISOString() : null,
            updatedAt: now.toISOString(),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (updated.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return { status: 200, resultRef: { id, revision: thread.revision + 1 } };
    },
  });
  const saved = await db
    .collection("threads")
    .findOne({ tenantId: principal.tenantId, id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: threadDto(saved) };
}
