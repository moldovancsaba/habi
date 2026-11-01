import { HabiApiError } from "../api/error-response.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
const terminal = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "awaiting_review",
]);
function dto(job) {
  return {
    id: job.id,
    revision: job.revision,
    status: job.status,
    reasonCode: job.reasonCode,
    turnId: job.turnId,
  };
}
export async function cancelJob({
  request,
  client,
  db,
  principal,
  id,
  now = new Date(),
}) {
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  const key = request.headers.get("idempotency-key");
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => k !== "expectedRevision") ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 1 ||
    !key ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key)
  )
    throw new HabiApiError("INVALID_INPUT");
  const scope = {
    tenantId: principal.tenantId,
    requesterActorId: principal.actorId,
    requesterRole: principal.role,
    id,
  };
  const original = await db.collection("jobs").findOne(scope);
  if (
    !original ||
    (principal.role !== "coach" && principal.playerId !== original.playerId) ||
    !["coachConversation", "personalInterpretation"].includes(original.kind)
  )
    throw new HabiApiError("NOT_FOUND");
  const receipt = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    actorRole: principal.role,
    activityPlayerId: original.playerId,
    method: request.method,
    path: new URL(request.url).pathname,
    key,
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      const job = await tx.collection("jobs").findOne(scope, { session });
      if (!job) throw new HabiApiError("NOT_FOUND");
      if (terminal.has(job.status))
        return { status: 200, resultRef: { id, revision: job.revision } };
      if (job.revision !== input.expectedRevision)
        throw new HabiApiError("REVISION_CONFLICT");
      const result = await tx.collection("jobs").updateOne(
        { ...scope, revision: input.expectedRevision, status: job.status },
        {
          $set: {
            status: "cancelled",
            reasonCode: "USER_CANCELLED",
            updatedAt: now.toISOString(),
            leaseUntil: null,
            leaseTokenHash: null,
          },
          $inc: { revision: 1, fence: 1 },
        },
        { session },
      );
      if (result.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      if (job.kind === "coachConversation" && job.turnId)
        await tx.collection("habi_coach_turns").updateOne(
          {
            tenantId: principal.tenantId,
            id: job.turnId,
            actorId: principal.actorId,
            role: principal.role,
            status: "queued",
          },
          {
            $set: { status: "failed", updatedAt: now.toISOString() },
            $inc: { revision: 1 },
          },
          { session },
        );
      return { status: 200, resultRef: { id, revision: job.revision + 1 } };
    },
  });
  const result = await db.collection("jobs").findOne(scope);
  return { status: receipt.status, body: dto(result) };
}
