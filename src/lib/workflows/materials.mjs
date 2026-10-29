import { randomUUID } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
import { verifySourceSet } from "./interpretations.mjs";
import {
  decodePageCursor,
  encodePageCursor,
  pageFilter,
} from "./page-cursor.mjs";

function dto(item) {
  return {
    id: item.id,
    revision: item.revision,
    playerId: item.playerId,
    materialId: item.materialId,
    version: item.version,
    status: item.status,
    title: item.title,
    text: item.text,
    createdBy: item.createdBy,
    sourceRefs: item.sourceRefs,
    supersedesRef: item.supersedesRef,
  };
}
function scopeCheck(principal, playerId) {
  if (principal.role !== "coach" && principal.playerId !== playerId)
    throw new HabiApiError("NOT_FOUND");
}

export async function createCoachMaterial({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
  scopeCheck(principal, playerId);
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput("CoachMaterialInput", input))
    throw new HabiApiError("INVALID_INPUT");
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  await verifySourceSet(db, principal, playerId, input.sourceRefs);
  const id = randomUUID();
  const materialId = randomUUID();
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
      await verifySourceSet(tx, principal, playerId, input.sourceRefs, session);
      let version = 1;
      let series = materialId;
      if (input.supersedesRef) {
        const prior = await tx.collection("coach_materials").findOne(
          {
            tenantId: principal.tenantId,
            playerId,
            id: input.supersedesRef.id,
            revision: input.supersedesRef.revision,
          },
          { session },
        );
        if (!prior) throw new HabiApiError("REVISION_CONFLICT");
        const isPublished = await tx.collection("publications").findOne(
          {
            tenantId: principal.tenantId,
            playerId,
            resourceRef: { id: prior.id, revision: prior.revision },
            status: "active",
          },
          { session },
        );
        if (prior.status !== "draft" && !isPublished)
          throw new HabiApiError("REVISION_CONFLICT");
        series = prior.materialId;
        const latest = await tx
          .collection("coach_materials")
          .find(
            { tenantId: principal.tenantId, playerId, materialId: series },
            { session },
          )
          .sort({ version: -1 })
          .limit(1)
          .next();
        version = (latest?.version ?? prior.version) + 1;
      }
      const material = {
        id,
        tenantId: principal.tenantId,
        schemaVersion: 2,
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        retentionPolicyId: principal.retentionPolicyId,
        playerId,
        materialId: series,
        version,
        status: "draft",
        title: input.title,
        text: input.text,
        createdBy: principal.actorId,
        sourceRefs: input.sourceRefs,
        supersedesRef: input.supersedesRef,
      };
      validateContractDocument("coach_materials", material);
      await tx.collection("coach_materials").insertOne(material, { session });
      return { status: 201, resultRef: { id, revision: 1 } };
    },
  });
  const saved = await db
    .collection("coach_materials")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: dto(saved) };
}

async function publishedRefs(db, principal, playerId) {
  const publications = await db
    .collection("publications")
    .find({ tenantId: principal.tenantId, playerId, status: "active" })
    .toArray();
  return new Set(
    publications.map(
      (item) => `${item.resourceRef.id}:${item.resourceRef.revision}`,
    ),
  );
}

export async function getCoachMaterial({
  db,
  principal,
  id,
  revision = /** @type {number | null} */ (null),
}) {
  const query = { tenantId: principal.tenantId, id };
  if (Number.isInteger(revision)) query.revision = revision;
  const item = await db.collection("coach_materials").findOne(query);
  if (
    !item ||
    (principal.role !== "coach" && principal.playerId !== item.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
  if (principal.role !== "coach") {
    const visible = await publishedRefs(db, principal, item.playerId);
    if (!visible.has(`${item.id}:${item.revision}`))
      throw new HabiApiError("NOT_FOUND");
  }
  return dto(item);
}

export async function listCoachMaterials({
  db,
  principal,
  playerId = principal.playerId,
  cursor = /** @type {string | null} */ (null),
  cursorHmacKey,
  limit = 50,
  now = new Date(),
}) {
  scopeCheck(principal, playerId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new HabiApiError("INVALID_INPUT");
  const position = cursor
    ? decodePageCursor(
        cursor,
        { principal, resource: "coach-materials", scopeId: playerId, now },
        cursorHmacKey,
      )
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const query = {
    tenantId: principal.tenantId,
    playerId,
    ...pageFilter({ snapshotAt, position }),
  };
  if (principal.role !== "coach") {
    const visible = await publishedRefs(db, principal, playerId);
    const refs = [...visible].map((value) => {
      const [id, revision] = value.split(":");
      return { id, revision: Number(revision) };
    });
    if (!refs.length)
      return {
        items: [],
        nextCursor: null,
        snapshotAt,
        accessRevision: principal.accessRevision,
      };
    query.$and = [...(query.$and ?? []), { $or: refs }];
  }
  const rows = await db
    .collection("coach_materials")
    .find(query)
    .sort({ createdAt: -1, id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit && page.length
      ? encodePageCursor(
          {
            principal,
            resource: "coach-materials",
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
