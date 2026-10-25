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

function sourceVisible(principal, ref, record, publications) {
  if (!record || record.revision !== ref.revision) return false;
  if (principal.role !== "parent") return true;
  if (record.collection === "records") {
    if (["player_direct", "parent_shared"].includes(record.sharingClass))
      return true;
    return publications.some(
      (item) =>
        item.resourceRef.id === ref.id &&
        item.resourceRef.revision === ref.revision,
    );
  }
  if (record.collection === "extractions") return record.status === "verified";
  if (record.collection === "reports") return record.status === "ready";
  if (record.collection === "interpretations")
    return (
      record.answer?.status === "ready" && record.answer?.validity === "current"
    );
  return true;
}

export async function verifySourceSet(
  db,
  principal,
  playerId,
  refs,
  session = undefined,
) {
  const publications = await db
    .collection("publications")
    .find(
      { tenantId: principal.tenantId, playerId, status: "active" },
      { session },
    )
    .toArray();
  for (const ref of refs) {
    let found = null;
    for (const collection of [
      "records",
      "checkin_results",
      "assessment_results",
      "reports",
      "extractions",
      "interpretations",
    ]) {
      const doc = await db.collection(collection).findOne(
        {
          tenantId: principal.tenantId,
          playerId,
          id: ref.id,
          revision: ref.revision,
        },
        { session },
      );
      if (doc) {
        found = { ...doc, collection };
        break;
      }
    }
    if (!sourceVisible(principal, ref, found, publications))
      throw new HabiApiError("NOT_FOUND");
  }
}

export async function requestInterpretation({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  if (!["parent", "coach"].includes(principal.role))
    throw new HabiApiError("ACCESS_DENIED");
  if (principal.playerId !== playerId && principal.role !== "coach")
    throw new HabiApiError("NOT_FOUND");
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput("QuestionInput", input))
    throw new HabiApiError("INVALID_INPUT");
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  await verifySourceSet(db, principal, playerId, input.sourceRefs);
  const turnId = randomUUID();
  const jobId = randomUUID();
  const threadId = input.threadId;
  const common = {
    tenantId: principal.tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    retentionPolicyId: principal.retentionPolicyId,
    playerId,
  };
  const turn = {
    ...common,
    threadId,
    id: turnId,
    parentTurnId: input.parentTurnId,
    intent: input.intent,
    question: input.question,
    sourceRefs: input.sourceRefs,
    answerRef: null,
    status: "queued",
  };
  const message = {
    ...common,
    id: randomUUID(),
    threadId,
    replyTo: null,
    recordedBy: { actorId: principal.actorId, role: principal.role },
    text: input.question,
    submittedAt: now.toISOString(),
  };
  const job = {
    ...common,
    id: jobId,
    kind: "personalInterpretation",
    requesterActorId: principal.actorId,
    requesterAccessRevision: principal.accessRevision,
    requesterRole: principal.role,
    turnId,
    uploadId: null,
    sourceRefs: input.sourceRefs,
    status: "queued",
    reasonCode: null,
    workerClientId: null,
    fence: 0,
    leaseTokenHash: null,
    leaseUntil: null,
    nextAttemptAt: now.toISOString(),
    claimKeyHash: null,
    claimServiceId: null,
    claimRequestHash: null,
    claimContextRevision: null,
    attempts: 0,
    resultRef: null,
    retryOf: null,
  };
  validateContractDocument("turns", turn);
  validateContractDocument("messages", message);
  validateContractDocument("jobs", job);
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
      await verifySourceSet(
        transactionDb,
        principal,
        playerId,
        input.sourceRefs,
        session,
      );
      let thread = await transactionDb
        .collection("threads")
        .findOne(
          { tenantId: principal.tenantId, playerId, id: threadId },
          { session },
        );
      if (!thread) {
        if (input.intent !== "new_question" || input.parentTurnId !== null)
          throw new HabiApiError("NOT_FOUND");
        thread = {
          ...common,
          id: threadId,
          status: "open",
          openedAt: now.toISOString(),
          closedAt: null,
        };
        validateContractDocument("threads", thread);
        await transactionDb
          .collection("threads")
          .insertOne(thread, { session });
      }
      if (thread.status !== "open") throw new HabiApiError("REVISION_CONFLICT");
      await transactionDb
        .collection("messages")
        .insertOne(message, { session });
      await transactionDb.collection("turns").insertOne(turn, { session });
      await transactionDb.collection("jobs").insertOne(job, { session });
      return { status: 202, resultRef: { id: jobId, revision: 1 } };
    },
  });
  return { status: command.status, body: { jobId: command.resultRef.id } };
}

export async function getJobStatus({ db, principal, id }) {
  const job = await db
    .collection("jobs")
    .findOne({ tenantId: principal.tenantId, id });
  if (
    !job ||
    (principal.role !== "coach" && principal.playerId !== job.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
  const status = {
    queued: "queued",
    leased: "processing",
    running: "processing",
    awaiting_review: "review",
    succeeded: job.resultRef ? "ready" : "review",
    failed: "failed",
    cancelled: "cancelled",
  }[job.status];
  return {
    jobId: job.id,
    status,
    reasonCode: job.reasonCode,
    resultRef: job.resultRef,
  };
}

function interpretationDto(item, review, principal) {
  const requiresReview = Boolean(
    item.answer &&
      (["ready", "awaiting_review"].includes(item.answer.status) ||
        item.answer.claims?.length),
  );
  const reviewState =
    review?.decision === "approved"
      ? "approved"
      : review?.decision === "rejected"
        ? "rejected"
        : review?.decision === "needs_revision"
          ? "needs_revision"
          : requiresReview
            ? "pending"
            : "not_required";
  const answerState =
    reviewState === "approved"
      ? "ready"
      : item.answer?.status === "needs_clarification"
        ? "needs_clarification"
        : item.answer?.status === "no_evidence"
          ? "no_evidence"
          : reviewState === "pending"
            ? "awaiting_review"
            : (item.answer?.status ?? "blocked");
  const canSeeAnswer =
    principal.role === "coach" ||
    reviewState === "approved" ||
    reviewState === "not_required";
  return {
    id: item.id,
    revision: item.revision,
    playerId: item.playerId,
    threadId: item.threadId,
    turnId: item.turnId,
    viewerRole: principal.role,
    answer: canSeeAnswer ? item.answer : null,
    answerState,
    reviewState,
    reviewRef: review ? { id: review.id, revision: review.revision } : null,
  };
}

export async function getInterpretation({ db, principal, id }) {
  const item = await db
    .collection("interpretations")
    .findOne({ tenantId: principal.tenantId, id });
  if (
    !item ||
    (principal.role !== "coach" && principal.playerId !== item.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
  const review = await db
    .collection("interpretation_reviews")
    .find({ tenantId: principal.tenantId, "interpretationRef.id": id })
    .sort({ reviewedAt: -1, id: -1 })
    .limit(1)
    .next();
  return interpretationDto(item, review, principal);
}

export async function listInterpretations({
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
        { principal, resource: "interpretations", scopeId: playerId, now },
        cursorHmacKey,
      )
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const rows = await db
    .collection("interpretations")
    .find({
      tenantId: principal.tenantId,
      playerId,
      ...pageFilter({ snapshotAt, position }),
    })
    .sort({ createdAt: -1, id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = rows.slice(0, limit);
  const items = await Promise.all(
    page.map(async (item) => {
      const review = await db
        .collection("interpretation_reviews")
        .find({ tenantId: principal.tenantId, "interpretationRef.id": item.id })
        .sort({ reviewedAt: -1, id: -1 })
        .limit(1)
        .next();
      return interpretationDto(item, review, principal);
    }),
  );
  const nextCursor =
    rows.length > limit && page.length
      ? encodePageCursor(
          {
            principal,
            resource: "interpretations",
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
    items,
    nextCursor,
    snapshotAt,
    accessRevision: principal.accessRevision,
  };
}

function sameRefs(left, right) {
  const key = (items) =>
    items.map((r) => `${r.id}\u0000${r.revision}\u0000${r.span ?? ""}`).sort();
  const a = key(left),
    b = key(right);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function reviewInterpretation({
  request,
  client,
  db,
  principal,
  id,
  now = new Date(),
}) {
  if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput("InterpretationReviewInput", input))
    throw new HabiApiError("INVALID_INPUT");
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
      const item = await tx
        .collection("interpretations")
        .findOne({ tenantId: principal.tenantId, id }, { session });
      if (!item) throw new HabiApiError("NOT_FOUND");
      if (item.revision !== input.interpretationRevision || !item.answer)
        throw new HabiApiError("REVISION_CONFLICT");
      const expectedSources = item.answer.manifest.sourceRefs;
      if (!sameRefs(expectedSources, input.sourceRevisionSet))
        throw new HabiApiError("REVISION_CONFLICT");
      await verifySourceSet(
        tx,
        principal,
        item.playerId,
        input.sourceRevisionSet,
        session,
      );
      const claimIds = item.answer.claims.map((claim) => claim.id).sort();
      const reviewedIds = input.claimReviews
        .map((review) => review.claimId)
        .sort();
      if (
        claimIds.length !== reviewedIds.length ||
        claimIds.some((claimId, index) => claimId !== reviewedIds[index])
      )
        throw new HabiApiError("INVALID_INPUT");
      for (const review of input.claimReviews) {
        const claim = item.answer.claims.find(
          (candidate) => candidate.id === review.claimId,
        );
        if (!claim || !sameRefs(review.checkedSourceRefs, claim.evidenceRefs))
          throw new HabiApiError("INVALID_INPUT");
        if (
          claim.evidenceRefs.some(
            (ref) =>
              !input.sourceRevisionSet.some(
                (source) =>
                  source.id === ref.id && source.revision === ref.revision,
              ),
          )
        )
          throw new HabiApiError("INVALID_INPUT");
        if (review.verdict === "supported" && !review.checkedSourceRefs.length)
          throw new HabiApiError("INVALID_INPUT");
      }
      if (
        input.decision === "approved" &&
        input.claimReviews.some((review) => review.verdict !== "supported")
      )
        throw new HabiApiError("INVALID_INPUT");
      const reviewDoc = {
        id: randomUUID(),
        tenantId: principal.tenantId,
        schemaVersion: 2,
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        retentionPolicyId: principal.retentionPolicyId,
        playerId: item.playerId,
        interpretationRef: { id: item.id, revision: item.revision },
        reviewerActorId: principal.actorId,
        reviewerRole: "coach",
        decision: input.decision,
        rationale: input.rationale,
        claimReviews: input.claimReviews,
        sourceRevisionSet: input.sourceRevisionSet,
        reviewedAt: now.toISOString(),
      };
      validateContractDocument("interpretation_reviews", reviewDoc);
      const claimReviews = new Map(
        input.claimReviews.map((r) => [r.claimId, r]),
      );
      const answer = {
        ...item.answer,
        status: input.decision === "approved" ? "ready" : "awaiting_review",
        validity:
          input.decision === "approved"
            ? "current"
            : input.decision === "rejected"
              ? "withdrawn"
              : "review_required",
        claims: item.answer.claims.map((claim) => {
          const review = claimReviews.get(claim.id);
          return {
            ...claim,
            review: {
              status:
                review.verdict === "supported"
                  ? "approved"
                  : review.verdict === "unsupported"
                    ? "rejected"
                    : "pending",
              actorId: principal.actorId,
              rationale: input.rationale,
              at: now.toISOString(),
            },
          };
        }),
      };
      const updated = await tx.collection("interpretations").updateOne(
        { tenantId: principal.tenantId, id, revision: item.revision },
        {
          $set: { answer, updatedAt: now.toISOString() },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (updated.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      await tx
        .collection("interpretation_reviews")
        .insertOne(reviewDoc, { session });
      if (input.decision === "approved") {
        await tx.collection("jobs").updateOne(
          {
            tenantId: principal.tenantId,
            resultRef: { id, revision: item.revision },
            status: "awaiting_review",
          },
          {
            $set: {
              status: "succeeded",
              reasonCode: null,
              updatedAt: now.toISOString(),
            },
            $inc: { revision: 1 },
          },
          { session },
        );
      }
      return {
        status: 200,
        resultRef: { id: reviewDoc.id, revision: reviewDoc.revision },
      };
    },
  });
  const item = await db
    .collection("interpretations")
    .findOne({ tenantId: principal.tenantId, id });
  const review = await db
    .collection("interpretation_reviews")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!item || !review) throw new Error("TRANSACTION_RESULT_MISSING");
  return {
    status: command.status,
    body: interpretationDto(item, review, principal),
  };
}
