import { randomUUID } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";

function publicationDto(item) {
  return {
    id: item.id,
    revision: item.revision,
    playerId: item.playerId,
    resourceRef: item.resourceRef,
    status: item.status,
    publishedBy: item.publishedBy,
    publishedAt: item.publishedAt,
  };
}

export async function publishCoachResource({
  request,
  client,
  db,
  principal,
  now = new Date(),
}) {
  if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput("RefInput", input))
    throw new HabiApiError("INVALID_INPUT");
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  let command;
  try {
    command = await runIdempotentCommand({
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
        const record = await transactionDb.collection("records").findOne(
          {
            tenantId: principal.tenantId,
            id: input.resourceRef.id,
          },
          { session },
        );
        let resource = record?.sharingClass === "coach" ? record : null;
        if (!resource)
          resource = await transactionDb
            .collection("coach_materials")
            .findOne(
              { tenantId: principal.tenantId, id: input.resourceRef.id },
              { session },
            );
        if (
          !resource ||
          (record?.sharingClass !== "coach" && resource.status !== "draft")
        )
          throw new HabiApiError("NOT_FOUND");
        // Coaches have a tenant-level membership, so principal.playerId is
        // intentionally null. The resource's player must still belong to the
        // same tenant before publication is allowed.
        const player = resource?.playerId
          ? await transactionDb
              .collection("players")
              .findOne(
                { tenantId: principal.tenantId, id: resource.playerId },
                { session },
              )
          : null;
        if (!player) throw new HabiApiError("NOT_FOUND");
        if (resource.revision !== input.resourceRef.revision)
          throw new HabiApiError("REVISION_CONFLICT");
        const existing = await transactionDb.collection("publications").findOne(
          {
            tenantId: principal.tenantId,
            playerId: resource.playerId,
            resourceRef: input.resourceRef,
            status: "active",
          },
          { session },
        );
        if (existing) throw new HabiApiError("REVISION_CONFLICT");
        const publication = {
          id: randomUUID(),
          tenantId: principal.tenantId,
          schemaVersion: 2,
          revision: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          retentionPolicyId: principal.retentionPolicyId,
          playerId: resource.playerId,
          resourceRef: { id: resource.id, revision: resource.revision },
          status: "active",
          publishedBy: principal.actorId,
          publishedAt: now.toISOString(),
        };
        validateContractDocument("publications", publication);
        await transactionDb
          .collection("publications")
          .insertOne(publication, { session });
        return {
          status: 201,
          resultRef: { id: publication.id, revision: publication.revision },
        };
      },
    });
  } catch (error) {
    if (error?.code === 11000) throw new HabiApiError("REVISION_CONFLICT");
    throw error;
  }
  const saved = await db
    .collection("publications")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: publicationDto(saved) };
}
