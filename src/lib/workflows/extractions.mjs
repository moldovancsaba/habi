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

function extractionDto(item) {
  return {
    id: item.id,
    revision: item.revision,
    reportRef: item.reportRef,
    reportHash: item.reportHash,
    method: item.method,
    status: item.status,
    fields: item.fields,
    supersedesId: item.supersedesId,
  };
}
function scope(principal, item) {
  if (
    !item ||
    item.tenantId !== principal.tenantId ||
    (principal.role !== "coach" && item.playerId !== principal.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
}
function keyOf(request) {
  const value = request.headers.get("idempotency-key");
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value))
    throw new HabiApiError("INVALID_INPUT");
  return value;
}
async function jsonOf(request, schema) {
  let value;
  try {
    value = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput(schema, value)) throw new HabiApiError("INVALID_INPUT");
  return value;
}

export async function createExtraction({
  request,
  client,
  db,
  principal,
  reportId,
  now = new Date(),
}) {
  if (!["parent", "coach"].includes(principal.role))
    throw new HabiApiError("ACCESS_DENIED");
  const input = await jsonOf(request, "ExtractionInput");
  const key = keyOf(request);
  const id = randomUUID();
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
      const report = await tx.collection("reports").findOne(
        {
          tenantId: principal.tenantId,
          id: reportId,
          ...(principal.role === "coach"
            ? {}
            : { playerId: principal.playerId }),
        },
        { session },
      );
      if (
        report?.status !== "ready" ||
        report.revision !== input.reportRef.revision ||
        input.reportRef.id !== reportId
      )
        throw new HabiApiError("NOT_FOUND");
      if (!input.fields.length) throw new HabiApiError("INVALID_INPUT");
      const pairs = new Set();
      const fields = input.fields.map((field) => {
        const pair = `${field.field}\u0000${field.page}`;
        if (pairs.has(pair)) throw new HabiApiError("INVALID_INPUT");
        pairs.add(pair);
        return {
          ...field,
          review: {
            status: "pending",
            actorId: null,
            rationale: "Ellenőrzésre vár.",
            at: null,
          },
        };
      });
      const latest = await tx
        .collection("extractions")
        .find({
          tenantId: principal.tenantId,
          playerId: report.playerId,
          "reportRef.id": report.id,
        })
        .sort({ revision: -1 })
        .limit(1)
        .next();
      const extraction = {
        id,
        tenantId: principal.tenantId,
        schemaVersion: 2,
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        retentionPolicyId: principal.retentionPolicyId,
        playerId: report.playerId,
        reportRef: input.reportRef,
        reportHash: report.fileHash,
        method: "manual_reviewed",
        status: "awaiting_review",
        fields,
        supersedesId: latest?.id ?? null,
      };
      validateContractDocument("extractions", extraction);
      await tx.collection("extractions").insertOne(extraction, { session });
      return { status: 201, resultRef: { id, revision: 1 } };
    },
  });
  const saved = await db
    .collection("extractions")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: extractionDto(saved) };
}

export async function getExtraction({ db, principal, id }) {
  const item = await db
    .collection("extractions")
    .findOne({ tenantId: principal.tenantId, id });
  scope(principal, item);
  return extractionDto(item);
}

export async function listExtractions({
  db,
  principal,
  reportId,
  cursor = /** @type {string | null} */ (null),
  cursorHmacKey,
  limit = 50,
  now = new Date(),
}) {
  const report = await db
    .collection("reports")
    .findOne({ tenantId: principal.tenantId, id: reportId });
  if (
    !report ||
    (principal.role !== "coach" && report.playerId !== principal.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new HabiApiError("INVALID_INPUT");
  const resource = `extractions:${reportId}`;
  const position = cursor
    ? decodePageCursor(
        cursor,
        { principal, resource, scopeId: report.playerId, now },
        cursorHmacKey,
      )
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const rows = await db
    .collection("extractions")
    .find({
      tenantId: principal.tenantId,
      playerId: report.playerId,
      "reportRef.id": reportId,
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
            resource,
            scopeId: report.playerId,
            snapshotAt,
            at: page.at(-1).createdAt,
            id: page.at(-1).id,
            now,
          },
          cursorHmacKey,
        )
      : null;
  return {
    items: page.map(extractionDto),
    nextCursor,
    snapshotAt,
    accessRevision: principal.accessRevision,
  };
}

export async function reviewExtraction({
  request,
  client,
  db,
  principal,
  id,
  now = new Date(),
}) {
  if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
  const input = await jsonOf(request, "ExtractionReviewInput");
  const key = keyOf(request);
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
      const item = await tx
        .collection("extractions")
        .findOne({ tenantId: principal.tenantId, id }, { session });
      scope(principal, item);
      if (
        item.revision !== input.expectedRevision ||
        item.status === "verified" ||
        item.status === "rejected"
      )
        throw new HabiApiError("REVISION_CONFLICT");
      const decisions = new Map(
        input.fields.map((field) => [
          `${field.field}\u0000${field.page}`,
          field,
        ]),
      );
      if (
        decisions.size !== input.fields.length ||
        [...decisions.keys()].some(
          (key) =>
            !item.fields.some(
              (field) => `${field.field}\u0000${field.page}` === key,
            ),
        )
      )
        throw new HabiApiError("INVALID_INPUT");
      const fields = item.fields.map((field) => {
        const decision = decisions.get(`${field.field}\u0000${field.page}`);
        if (!decision) return field;
        return {
          ...field,
          review: {
            status: decision.decision === "approve" ? "approved" : "rejected",
            actorId: principal.actorId,
            rationale: decision.rationale,
            at: now.toISOString(),
          },
        };
      });
      const status = fields.some((field) => field.review.status === "rejected")
        ? "rejected"
        : fields.every((field) => field.review.status === "approved")
          ? "verified"
          : "awaiting_review";
      const updated = {
        ...item,
        fields,
        status,
        revision: item.revision + 1,
        updatedAt: now.toISOString(),
      };
      validateContractDocument("extractions", updated);
      const result = await tx
        .collection("extractions")
        .replaceOne(
          { tenantId: principal.tenantId, id, revision: item.revision },
          updated,
          { session },
        );
      if (result.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return { status: 200, resultRef: { id, revision: updated.revision } };
    },
  });
  const saved = await db
    .collection("extractions")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: extractionDto(saved) };
}
