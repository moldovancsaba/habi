import { randomUUID } from "node:crypto";
import { validateContractDocument } from "./contract-validation.mjs";

const domains = {
  "ai-coach": ["habi_coach_turns", "habi_coach_threads"],
  "ai-profile": ["habi_coach_profile_events"],
  "ai-reviews": ["habi_coach_turns"],
  "checkin-sessions": ["checkin_results", "checkin_sessions"],
  records: ["records"],
  threads: ["threads", "messages"],
  messages: ["messages"],
  plans: ["plans"],
  "follow-ups": ["follow_ups"],
  reports: ["reports", "extractions"],
  uploads: ["uploads", "reports"],
  extractions: ["extractions"],
  publications: ["publications"],
  materials: ["coach_materials"],
  "monthly-reflections": ["monthly_reflections"],
  drafts: ["habi_experience_drafts"],
  interpretations: ["interpretations", "turns"],
};
const verbs = new Set([
  "active",
  "paused",
  "completed",
  "withdrawn",
  "declined",
  "accept",
  "decline",
  "approved",
  "rejected",
  "request",
  "request_changes",
  "complete",
  "answers",
  "state",
  "review",
  "withdraw",
  "reopen",
  "finalize",
  "clear",
]);

/** Append successful player-scoped writes in the same transaction, never raw request bodies. */
export async function recordCoachActivity({
  db,
  session,
  tenantId,
  retentionPolicyId,
  actorId,
  actorRole,
  playerId,
  method,
  path,
  body,
  resultRef,
  at,
}) {
  if (!["player", "parent", "coach"].includes(actorRole)) return;
  const parts = path.split("/").filter(Boolean);
  const domain = Object.keys(domains).find((key) => parts.includes(key));
  if (!domain) return;
  let resource = null;
  if (resultRef?.id)
    for (const name of domains[domain]) {
      resource = await db
        .collection(name)
        .findOne({ tenantId, id: resultRef.id }, { session });
      if (resource?.playerId) {
        if (playerId && playerId !== resource.playerId)
          throw new Error("ACTIVITY_PLAYER_CONFLICT");
        playerId = resource.playerId;
        break;
      }
    }
  if (!playerId) return;
  const id = randomUUID();
  const requested = body?.status ?? body?.decision ?? parts.at(-1);
  const verb = verbs.has(requested) ? requested : method.toLowerCase();
  const event = {
    id,
    tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    retentionPolicyId,
    playerId,
    kind: `activity.${domain}.${verb}`,
    submittedAt: at,
    occurredAt: at,
    actorRole,
    sourceKind: actorRole === "player" ? "self" : "observation",
    resourceRef: resultRef
      ? { id: resultRef.id, revision: resultRef.revision }
      : { id, revision: 1 },
    processId:
      resource?.threadId ??
      resource?.sessionId ??
      resource?.resourceRef?.id ??
      resultRef?.id ??
      id,
    replyTo: null,
    relatedId: null,
  };
  validateContractDocument("events", event);
  await db.collection("events").insertOne(event, { session });
  const audit = {
    id: randomUUID(),
    tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    retentionPolicyId,
    actorOrClientId: actorId,
    action: event.kind,
    resourceRef: event.resourceRef,
    requestId: id,
    outcome: "allowed",
    occurredAt: at,
  };
  validateContractDocument("audit", audit);
  await db.collection("audit").insertOne(audit, { session });
}
