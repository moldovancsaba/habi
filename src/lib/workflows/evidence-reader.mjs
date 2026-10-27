import { HabiApiError } from "../api/error-response.mjs";
import { verifySourceSet } from "./interpretations.mjs";
const FIELDS = {
  records: ["text", "source", "recordedBy", "occurredAt"],
  checkin_results: [
    "completedAt",
    "answerCodes",
    "interpretation",
    "suggestion",
  ],
  assessment_results: [
    "interpretation",
    "suggestion",
    "instrumentVersion",
    "methodStatus",
  ],
  monthly_reflections: ["period", "answers", "nextFocus", "note"],
  plans: ["status", "actions"],
  follow_ups: ["outcome", "text", "occurredAt"],
  reports: ["status", "title", "createdAt"],
  extractions: ["status", "fields"],
  interpretations: ["answer", "createdAt"],
};
export async function readEvidenceSource({
  db,
  principal,
  playerId,
  id,
  revision,
}) {
  if (!["coach", "parent"].includes(principal.role))
    throw new HabiApiError("ACCESS_DENIED");
  if (principal.role !== "coach" && principal.playerId !== playerId)
    throw new HabiApiError("NOT_FOUND");
  if (!Number.isInteger(revision) || revision < 1)
    throw new HabiApiError("INVALID_INPUT");
  await verifySourceSet(db, principal, playerId, [
    { id, revision, span: null },
  ]);
  for (const [collection, fields] of Object.entries(FIELDS)) {
    const source = await db
      .collection(collection)
      .findOne({ tenantId: principal.tenantId, playerId, id, revision });
    if (source)
      return {
        kind: collection,
        resourceRef: { id, revision },
        content: Object.fromEntries(
          fields
            .filter((k) => source[k] !== undefined)
            .map((k) => [k, source[k]]),
        ),
      };
  }
  throw new HabiApiError("NOT_FOUND");
}
