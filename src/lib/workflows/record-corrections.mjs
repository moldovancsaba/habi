import { randomUUID } from "node:crypto";
import { isValidApiInput } from "../api/input-validation.mjs";
import { HabiApiError } from "../api/error-response.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { getRecord } from "./records.mjs";
export async function correctRecord({
  request,
  client,
  db,
  principal,
  playerId,
  id,
  now = new Date(),
}) {
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput("RecordCorrectionInput", input))
    throw new HabiApiError("INVALID_INPUT");
  const key = request.headers.get("idempotency-key");
  const replacement = input?.replacement;
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) => !["expectedRevision", "reason", "replacement"].includes(k),
    ) ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 1 ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.length > 1500 ||
    !replacement ||
    typeof replacement !== "object" ||
    Array.isArray(replacement) ||
    Object.keys(replacement).some(
      (k) => !["text", "occurredAt", "timeZone"].includes(k),
    ) ||
    typeof replacement.text !== "string" ||
    !replacement.text.trim() ||
    replacement.text.length > 4000 ||
    !key ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key)
  )
    throw new HabiApiError("INVALID_INPUT");
  // Authorisation is checked even on a replay; original text is never changed.
  const original = await getRecord({ db, principal, playerId, id });
  if (
    original.recordedBy.actorId !== principal.actorId ||
    original.recordedBy.role !== principal.role ||
    !["diary", "observation"].includes(original.kind)
  )
    throw new HabiApiError("NOT_FOUND");
  try {
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
        const source = await tx.collection("records").findOne(
          {
            tenantId: principal.tenantId,
            playerId,
            id,
            "recordedBy.actorId": principal.actorId,
            "recordedBy.role": principal.role,
          },
          { session },
        );
        if (!source) throw new HabiApiError("NOT_FOUND");
        if (
          source.revision !== input.expectedRevision ||
          (await tx
            .collection("records")
            .findOne(
              { tenantId: principal.tenantId, playerId, supersedesId: id },
              { session },
            ))
        )
          throw new HabiApiError("REVISION_CONFLICT");
        const at = now.toISOString();
        const next = {
          ...source,
          id: randomUUID(),
          revision: 1,
          createdAt: at,
          updatedAt: at,
          submittedAt: at,
          text: replacement.text.trim(),
          occurredAt: replacement.occurredAt ?? source.occurredAt,
          timeZone: replacement.timeZone ?? source.timeZone,
          supersedesId: source.id,
          correctionReason: input.reason.trim(),
        };
        delete next._id;
        if (!Number.isFinite(Date.parse(next.occurredAt)))
          throw new HabiApiError("INVALID_INPUT");
        try {
          new Intl.DateTimeFormat("hu", { timeZone: next.timeZone });
        } catch {
          throw new HabiApiError("INVALID_INPUT");
        }
        validateContractDocument("records", next);
        await tx.collection("records").insertOne(next, { session });
        return { status: 201, resultRef: { id: next.id, revision: 1 } };
      },
    });
    return {
      status: receipt.status,
      body: await getRecord({
        db,
        principal,
        playerId,
        id: receipt.resultRef.id,
      }),
    };
  } catch (e) {
    if (e.code === 11000) throw new HabiApiError("REVISION_CONFLICT");
    throw e;
  }
}
