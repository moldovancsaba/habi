import { randomUUID } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
const dto = ({
  id,
  revision,
  status,
  text,
  applicability,
  exclusions,
  reviews,
  createdAt,
}) => ({
  id,
  revision,
  status,
  text,
  applicability,
  exclusions,
  reviews,
  createdAt,
});
function coach(principal) {
  if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
}
export async function listKnowledge({ db, principal }) {
  coach(principal);
  return {
    items: (
      await db
        .collection("knowledge_candidates")
        .find({ tenantId: principal.tenantId })
        .sort({ createdAt: -1, id: -1 })
        .limit(100)
        .toArray()
    ).map(dto),
  };
}
export async function writeKnowledge({
  request,
  client,
  db,
  principal,
  id = /** @type {string | null} */ (null),
  now = new Date(),
}) {
  coach(principal);
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HabiApiError("INVALID_INPUT");
  if (
    !isValidApiInput(
      id ? "KnowledgeReviewInput" : "KnowledgeCreateInput",
      input,
    )
  )
    throw new HabiApiError("INVALID_INPUT");
  const read = (key, max) => {
    const value = input[key];
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw new HabiApiError("INVALID_INPUT");
    return value.trim();
  };
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
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
    async execute({ db: tx, session }) {
      if (!id) {
        if (
          Object.keys(input).some(
            (k) =>
              !["situation", "response", "exclusions", "evidence"].includes(k),
          )
        )
          throw new HabiApiError("INVALID_INPUT");
        const candidate = {
          id: randomUUID(),
          tenantId: principal.tenantId,
          schemaVersion: 2,
          revision: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          retentionPolicyId: principal.retentionPolicyId,
          status: "candidate",
          text: `Helyzet: ${read("situation", 500)}\n\nVálasz iránya: ${read("response", 2000)}\n\nSzakmai forrás és indoklás: ${read("evidence", 1000)}`,
          sourceRefs: [],
          applicability: [read("situation", 500)],
          exclusions: [read("exclusions", 500)],
          ageBands: [],
          rightsEvidenceRef: null,
          reviews: [],
        };
        validateContractDocument("knowledge_candidates", candidate);
        await tx
          .collection("knowledge_candidates")
          .insertOne(candidate, { session });
        return { status: 201, resultRef: { id: candidate.id, revision: 1 } };
      }
      const item = await tx
        .collection("knowledge_candidates")
        .findOne({ tenantId: principal.tenantId, id }, { session });
      if (!item) throw new HabiApiError("NOT_FOUND");
      if (item.revision !== input.expectedRevision)
        throw new HabiApiError("REVISION_CONFLICT");
      if (
        !["approved", "withdrawn"].includes(input.decision) ||
        Object.keys(input).some(
          (k) =>
            ![
              "expectedRevision",
              "decision",
              "evidenceChecked",
              "privacyChecked",
              "rightsChecked",
              "rationale",
            ].includes(k),
        )
      )
        throw new HabiApiError("INVALID_INPUT");
      if (
        input.decision === "approved" &&
        (!["candidate", "withdrawn"].includes(item.status) ||
          ![
            input.evidenceChecked,
            input.privacyChecked,
            input.rightsChecked,
          ].every((v) => v === true))
      )
        throw new HabiApiError("INVALID_INPUT");
      if (input.decision === "withdrawn" && item.status !== "approved")
        throw new HabiApiError("REVISION_CONFLICT");
      const review = {
        status: input.decision === "approved" ? "approved" : "rejected",
        actorId: principal.actorId,
        rationale: `${input.decision === "approved" ? "Forrás, személytelenség és felhasználási jog ellenőrizve. " : "Visszavonás. "}${read("rationale", 1500)}`,
        at: now.toISOString(),
      };
      const updated = {
        ...item,
        status: input.decision,
        revision: item.revision + 1,
        updatedAt: now.toISOString(),
        reviews: [...item.reviews, review].slice(-10),
      };
      delete updated._id;
      validateContractDocument("knowledge_candidates", updated);
      const result = await tx
        .collection("knowledge_candidates")
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
  return {
    status: command.status,
    body: dto(
      await db
        .collection("knowledge_candidates")
        .findOne({ tenantId: principal.tenantId, id: command.resultRef.id }),
    ),
  };
}
