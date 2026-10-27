import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { GridFSBucket } from "mongodb";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import {
  hashRequestBody,
  runIdempotentCommand,
} from "../database/idempotent-command.mjs";
import { workerLeaseHash } from "../auth/worker-guard.mjs";
import { verifySourceSet } from "./interpretations.mjs";

import { coachWorkerContext, completeCoachTurn } from "./ai-coach.mjs";

const LEASE_MS = 90_000;
const RETRY_DELAYS = [5, 15, 60, 300];
const SOURCE_COLLECTIONS = [
  ["records", "record"],
  ["checkin_results", "checkin_result"],
  ["assessment_results", "assessment_result"],
  ["monthly_reflections", "monthly_reflection"],
  ["plans", "plan"],
  ["follow_ups", "follow_up"],
  ["reports", "report"],
  ["extractions", "extraction"],
  ["interpretations", "interpretation"],
];

function idempotencyKey(request) {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  return key;
}

async function readInput(request, name) {
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput(name, input)) throw new HabiApiError("INVALID_INPUT");
  return input;
}

function activeLease(job, serviceId, token, fence, now) {
  return (
    job &&
    ["leased", "running"].includes(job.status) &&
    job.workerClientId === serviceId &&
    job.fence === fence &&
    job.leaseUntil &&
    Date.parse(job.leaseUntil) > now.getTime() &&
    job.leaseTokenHash === workerLeaseHash(token)
  );
}

async function requesterScope(db, job, session = undefined) {
  const options = session ? { session } : undefined;
  const actor = await db.collection("actors").findOne(
    {
      id: job.requesterActorId,
      status: "active",
      accessRevision: job.requesterAccessRevision,
    },
    options,
  );
  const role = job.requesterRole;
  if (!actor || !role || !job.playerId) return null;
  const membership = await db.collection("memberships").findOne(
    {
      tenantId: job.tenantId,
      actorId: job.requesterActorId,
      // Coach memberships are tenant-wide. The job still names the player
      // whose report or source is being processed, so validate that target
      // separately below instead of requiring a player-scoped membership.
      playerId: role === "coach" ? null : job.playerId,
      role,
      status: "active",
    },
    options,
  );
  const player = await db
    .collection("players")
    .findOne({ tenantId: job.tenantId, id: job.playerId }, options);
  const tenant = await db
    .collection("tenants")
    .findOne({ tenantId: job.tenantId, status: "active" }, options);
  if (!membership || !player || !tenant) return null;
  return {
    actorId: job.requesterActorId,
    tenantId: job.tenantId,
    playerId: job.playerId,
    role,
    accessRevision: job.requesterAccessRevision,
    retentionPolicyId: job.retentionPolicyId,
  };
}

async function sourceSnapshots(db, principal, refs) {
  const snapshots = [];
  for (const ref of refs) {
    let found = null;
    for (const [collection, kind] of SOURCE_COLLECTIONS) {
      const payload = await db.collection(collection).findOne({
        tenantId: principal.tenantId,
        playerId: principal.playerId,
        id: ref.id,
        revision: ref.revision,
      });
      if (payload) {
        const safePayload = Object.fromEntries(
          Object.entries(payload).filter(([key]) => key !== "_id"),
        );
        found = {
          kind,
          resourceRef: { id: ref.id, revision: ref.revision },
          payload: safePayload,
        };
        break;
      }
    }
    if (!found) throw new HabiApiError("NOT_FOUND");
    snapshots.push(found);
  }
  return snapshots;
}

async function promptManifest() {
  const manifest = JSON.parse(
    await readFile(
      new URL("../../../contracts/runtime-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  return {
    modelArtifact: `${manifest.model}@${manifest.artifactDigest}`,
    promptHash: manifest.promptSha256,
    schemaVersion: 2,
    retrievalVersion: manifest.retrievalVersion,
    policyVersion: manifest.policyVersion,
    sourceRefs: [],
  };
}

export async function claimWorkerJob({
  request,
  db,
  clientId,
  now = new Date(),
}) {
  const input = await readInput(request, "ClaimInput");
  const key = idempotencyKey(request);
  if (input.maxJobs !== 1 || !input.kinds.length)
    throw new HabiApiError("INVALID_INPUT");
  const leaseSeed = process.env.HG_WORKER_BEARER_SHA256 ?? "";
  if (!/^[a-f0-9]{64}$/.test(leaseSeed))
    throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
  const claimKeyHash = createHash("sha256")
    .update(`${clientId}\u0000${key}`)
    .digest("hex");
  const claimRequestHash = hashRequestBody(input);
  const token = createHmac("sha256", Buffer.from(leaseSeed, "hex"))
    .update(`${clientId}\u0000${claimKeyHash}`)
    .digest("base64url");
  const prior = await db
    .collection("jobs")
    .findOne({ claimKeyHash, claimServiceId: clientId });
  if (prior) {
    if (prior.claimRequestHash !== claimRequestHash)
      throw new HabiApiError("REVISION_CONFLICT");
    return {
      jobId: prior.id,
      kind: prior.kind,
      fence: prior.fence,
      leaseToken: token,
      leaseUntil: prior.leaseUntil,
      contextRevision: prior.claimContextRevision,
    };
  }
  const leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
  // Reserve a candidate lease key on the job itself. The unique partial index
  // prevents two concurrent retries with the same request key claiming two jobs.
  let job;
  try {
    job = await db.collection("jobs").findOneAndUpdate(
      {
        kind: { $in: input.kinds },
        nextAttemptAt: { $lte: now.toISOString() },
        $or: [
          { status: "queued" },
          {
            status: { $in: ["leased", "running"] },
            leaseUntil: { $lte: now.toISOString() },
          },
        ],
      },
      [
        {
          $set: {
            status: "leased",
            workerClientId: clientId,
            leaseUntil,
            leaseTokenHash: workerLeaseHash(token),
            updatedAt: now.toISOString(),
            reasonCode: null,
            claimKeyHash,
            claimServiceId: clientId,
            claimRequestHash,
            claimContextRevision: { $add: ["$revision", 1] },
            revision: { $add: ["$revision", 1] },
            fence: { $add: ["$fence", 1] },
            attempts: { $add: ["$attempts", 1] },
          },
        },
      ],
      {
        sort: { nextAttemptAt: 1, createdAt: 1, id: 1 },
        returnDocument: "after",
      },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const raced = await db
      .collection("jobs")
      .findOne({ claimKeyHash, claimServiceId: clientId });
    if (!raced) throw error;
    if (raced.claimRequestHash !== claimRequestHash)
      throw new HabiApiError("REVISION_CONFLICT");
    return {
      jobId: raced.id,
      kind: raced.kind,
      fence: raced.fence,
      leaseToken: token,
      leaseUntil: raced.leaseUntil,
      contextRevision: raced.claimContextRevision,
    };
  }
  if (!job) return null;
  return {
    jobId: job.id,
    kind: job.kind,
    fence: job.fence,
    leaseToken: token,
    leaseUntil,
    contextRevision: job.revision,
  };
}

export async function getWorkerJobContext({
  db,
  worker,
  id,
  request,
  now = new Date(),
}) {
  const token = request.headers.get("x-lease-token") ?? "";
  const fence = Number(request.headers.get("x-job-fence"));
  const job = await db.collection("jobs").findOne({ id });
  if (!activeLease(job, worker.serviceId, token, fence, now))
    throw new HabiApiError("REVISION_CONFLICT");
  if (job.kind === "reportScan") {
    const principal = await requesterScope(db, job);
    if (!principal || !job.uploadId) throw new HabiApiError("NOT_FOUND");
    const upload = await db.collection("uploads").findOne({
      tenantId: job.tenantId,
      playerId: job.playerId,
      id: job.uploadId,
      status: "quarantined",
      scanStatus: "pending",
    });
    if (!upload) throw new HabiApiError("NOT_FOUND");
    const context = {
      jobId: job.id,
      uploadId: upload.id,
      fileHash: upload.sha256,
      size: upload.size,
      fence: job.fence,
      deadline: new Date(now.getTime() + 240_000).toISOString(),
    };
    if (!isValidApiInput("WorkerContext", context))
      throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
    return context;
  }
  if (job.kind === "coachConversation") {
    const principal = await requesterScope(db, job);
    if (!principal) throw new HabiApiError("NOT_FOUND");
    const manifest = await promptManifest();
    manifest.promptHash = createHash("sha256")
      .update(
        await readFile(
          new URL("../../../contracts/coach-prompt.md", import.meta.url),
        ),
      )
      .digest("hex");
    manifest.retrievalVersion = "coach-memory-v1";
    const context = await coachWorkerContext({
      db,
      principal,
      job,
      manifest,
      now,
    });
    if (!isValidApiInput("WorkerContext", context))
      throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
    return context;
  }
  if (job.kind !== "personalInterpretation" || !job.turnId)
    throw new HabiApiError("INVALID_INPUT");
  const principal = await requesterScope(db, job);
  if (!principal) throw new HabiApiError("NOT_FOUND");
  await verifySourceSet(db, principal, job.playerId, job.sourceRefs);
  const turn = await db.collection("turns").findOne({
    tenantId: job.tenantId,
    playerId: job.playerId,
    id: job.turnId,
    status: "queued",
  });
  if (!turn) throw new HabiApiError("REVISION_CONFLICT");
  const snapshots = await sourceSnapshots(db, principal, turn.sourceRefs);
  const manifest = await promptManifest();
  manifest.sourceRefs = turn.sourceRefs;
  const context = {
    jobId: job.id,
    turnId: turn.id,
    turnRevision: turn.revision,
    question: turn.question,
    fence: job.fence,
    sourceSnapshots: snapshots,
    knowledgeSnapshots: [],
    sourceManifest: turn.sourceRefs,
    promptManifest: manifest,
    deadline: new Date(now.getTime() + 240_000).toISOString(),
  };
  if (!isValidApiInput("WorkerContext", context))
    throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
  return context;
}

export async function openWorkerJobContent({
  db,
  worker,
  id,
  request,
  now = new Date(),
}) {
  const token = request.headers.get("x-lease-token") ?? "";
  const fence = Number(request.headers.get("x-job-fence"));
  const job = await db.collection("jobs").findOne({ id });
  if (
    !activeLease(job, worker.serviceId, token, fence, now) ||
    job.kind !== "reportScan" ||
    !job.uploadId
  )
    throw new HabiApiError("REVISION_CONFLICT");
  const upload = await db.collection("uploads").findOne({
    tenantId: job.tenantId,
    playerId: job.playerId,
    id: job.uploadId,
    status: "quarantined",
    scanStatus: "pending",
  });
  if (!upload?.gridFsFileId) throw new HabiApiError("NOT_FOUND");
  const file = await db.collection("habi_reports.files").findOne({
    _id: upload.gridFsFileId,
    "metadata.tenantId": job.tenantId,
    "metadata.uploadId": upload.id,
    "metadata.sha256": upload.sha256,
    length: upload.size,
  });
  if (!file) throw new HabiApiError("NOT_FOUND");
  return new GridFSBucket(db, {
    bucketName: "habi_reports",
  }).openDownloadStream(upload.gridFsFileId);
}

export async function heartbeatWorkerJob({
  request,
  db,
  worker,
  id,
  now = new Date(),
}) {
  const input = await readInput(request, "HeartbeatInput");
  idempotencyKey(request);
  const leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
  const updated = await db.collection("jobs").findOneAndUpdate(
    {
      id,
      workerClientId: worker.serviceId,
      fence: input.fence,
      leaseTokenHash: workerLeaseHash(input.leaseToken),
      status: { $in: ["leased", "running"] },
      leaseUntil: { $gt: now.toISOString() },
    },
    {
      $set: { status: "running", leaseUntil, updatedAt: now.toISOString() },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new HabiApiError("REVISION_CONFLICT");
  return { jobId: id, fence: updated.fence, leaseUntil };
}

async function withLease({
  request,
  client,
  db,
  worker,
  id,
  inputName,
  input: suppliedInput,
  now,
  action,
}) {
  const input = suppliedInput ?? (await readInput(request, inputName));
  const key = idempotencyKey(request);
  let resultRef = null;
  const command = await runIdempotentCommand({
    client,
    db,
    tenantId: "habi-system",
    retentionPolicyId: "habi-system",
    actorOrClientId: worker.serviceId,
    method: request.method,
    path: new URL(request.url).pathname,
    key,
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      const job = await tx.collection("jobs").findOne({ id }, { session });
      if (
        !activeLease(job, worker.serviceId, input.leaseToken, input.fence, now)
      )
        throw new HabiApiError("REVISION_CONFLICT");
      resultRef = await action({ tx, session, job, input });
      return {
        status: 200,
        resultRef: resultRef ?? { id, revision: job.revision + 1 },
      };
    },
  });
  return { status: command.status, resultRef: resultRef ?? command.resultRef };
}

export async function deferWorkerJob({
  request,
  client,
  db,
  worker,
  id,
  terminal = false,
  now = new Date(),
}) {
  const outcome = await withLease({
    request,
    client,
    db,
    worker,
    id,
    inputName: "DeferInput",
    now,
    action: async ({ tx, session, job, input }) => {
      const terminalReasons = new Set([
        "INVALID_INPUT",
        "UNSUPPORTED_REPORT",
        "AUTH_REVOKED",
        "SOURCE_INVALIDATED",
      ]);
      const isTerminal = terminal || terminalReasons.has(input.reasonCode);
      const retryIndex = Math.min(
        Math.max(0, job.attempts - 1),
        RETRY_DELAYS.length - 1,
      );
      const nextAttemptAt = isTerminal
        ? now.toISOString()
        : new Date(
            now.getTime() + RETRY_DELAYS[retryIndex] * 1000,
          ).toISOString();
      const status = isTerminal ? "failed" : "queued";
      const result = await tx.collection("jobs").updateOne(
        {
          tenantId: job.tenantId,
          id: job.id,
          revision: job.revision,
          fence: input.fence,
        },
        {
          $set: {
            status,
            reasonCode: input.reasonCode,
            nextAttemptAt,
            workerClientId: null,
            leaseTokenHash: null,
            leaseUntil: null,
            updatedAt: now.toISOString(),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (result.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return { id: job.id, revision: job.revision + 1 };
    },
  });
  return outcome;
}

export async function cancelWorkerJob({
  request,
  client,
  db,
  worker,
  id,
  now = new Date(),
}) {
  return withLease({
    request,
    client,
    db,
    worker,
    id,
    inputName: "LeaseInput",
    now,
    action: async ({ tx, session, job }) => {
      const result = await tx.collection("jobs").updateOne(
        { tenantId: job.tenantId, id, revision: job.revision },
        {
          $set: {
            status: "cancelled",
            reasonCode: null,
            workerClientId: null,
            leaseTokenHash: null,
            leaseUntil: null,
            updatedAt: now.toISOString(),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (result.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return { id, revision: job.revision + 1 };
    },
  });
}

export async function completeWorkerJob({
  request,
  client,
  db,
  worker,
  id,
  now = new Date(),
}) {
  const input = await readInput(request, "CompleteInput");
  if (
    hashRequestBody({
      result: input.result,
      sourceManifest: input.sourceManifest,
    }) !== input.resultHash
  )
    throw new HabiApiError("INVALID_INPUT");
  const commandResult = await withLease({
    request,
    client,
    db,
    worker,
    id,
    inputName: "CompleteInput",
    input,
    now,
    action: async ({ tx, session, job, input: body }) => {
      if (job.kind === "coachConversation") {
        const principal = await requesterScope(tx, job, session);
        if (!principal) throw new HabiApiError("NOT_FOUND");
        return completeCoachTurn({ tx, session, job, principal, body, now });
      }
      if (job.kind !== "personalInterpretation" || !job.turnId)
        throw new HabiApiError("INVALID_INPUT");
      const principal = await requesterScope(tx, job, session);
      if (!principal) throw new HabiApiError("NOT_FOUND");
      await verifySourceSet(
        tx,
        principal,
        job.playerId,
        job.sourceRefs,
        session,
      );
      const turn = await tx.collection("turns").findOne(
        {
          tenantId: job.tenantId,
          playerId: job.playerId,
          id: job.turnId,
          status: "queued",
        },
        { session },
      );
      if (!turn || turn.revision !== body.result.questionRevision)
        throw new HabiApiError("REVISION_CONFLICT");
      const same = (a, b) => {
        const key = (items) =>
          items
            .map(
              (item) =>
                `${item.id}\u0000${item.revision}\u0000${item.span ?? ""}`,
            )
            .sort();
        const left = key(a);
        const right = key(b);
        return (
          left.length === right.length &&
          left.every((value, index) => value === right[index])
        );
      };
      if (
        !same(job.sourceRefs, turn.sourceRefs) ||
        !same(body.sourceManifest, turn.sourceRefs) ||
        !same(body.result.manifest.sourceRefs, turn.sourceRefs)
      )
        throw new HabiApiError("REVISION_CONFLICT");
      const hasClaims = body.result.claims.length > 0;
      const answer = {
        ...body.result,
        status: hasClaims ? "awaiting_review" : body.result.status,
        validity: hasClaims ? "review_required" : "current",
        manifest: { ...body.result.manifest, sourceRefs: turn.sourceRefs },
        claims: body.result.claims.map((claim) => ({
          ...claim,
          review: {
            status: "pending",
            actorId: null,
            rationale: "Emberi ellenőrzésre vár.",
            at: null,
          },
        })),
      };
      const interpretation = {
        id: randomUUID(),
        tenantId: job.tenantId,
        schemaVersion: 2,
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        retentionPolicyId: job.retentionPolicyId,
        playerId: job.playerId,
        threadId: turn.threadId,
        turnId: turn.id,
        turnRevision: turn.revision,
        answer,
      };
      validateContractDocument("interpretations", interpretation);
      await tx
        .collection("interpretations")
        .insertOne(interpretation, { session });
      const turnStatus =
        body.result.status === "blocked" ? "blocked" : "answered";
      await tx.collection("turns").updateOne(
        { tenantId: job.tenantId, id: turn.id, revision: turn.revision },
        {
          $set: {
            status: turnStatus,
            answerRef: {
              id: interpretation.id,
              revision: interpretation.revision,
            },
            updatedAt: now.toISOString(),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      await tx.collection("jobs").updateOne(
        { tenantId: job.tenantId, id: job.id, revision: job.revision },
        {
          $set: {
            status: hasClaims ? "awaiting_review" : "succeeded",
            reasonCode: null,
            resultRef: {
              id: interpretation.id,
              revision: interpretation.revision,
            },
            workerClientId: null,
            leaseTokenHash: null,
            leaseUntil: null,
            updatedAt: now.toISOString(),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      return { id: interpretation.id, revision: interpretation.revision };
    },
  });
  return commandResult;
}

export async function completeWorkerUploadScan({
  request,
  client,
  db,
  worker,
  id,
  now = new Date(),
}) {
  const input = await readInput(request, "UploadScanInput");
  const result = await withLease({
    request,
    client,
    db,
    worker,
    id,
    inputName: "UploadScanInput",
    input,
    now,
    action: async ({ tx, session, job, input: body }) => {
      if (job.kind !== "reportScan" || !job.uploadId)
        throw new HabiApiError("INVALID_INPUT");
      const principal = await requesterScope(tx, job, session);
      if (!principal) throw new HabiApiError("NOT_FOUND");
      const upload = await tx.collection("uploads").findOne(
        {
          tenantId: job.tenantId,
          playerId: job.playerId,
          id: job.uploadId,
          status: "quarantined",
          scanStatus: "pending",
        },
        { session },
      );
      if (!upload || upload.sha256 !== body.fileHash)
        throw new HabiApiError("REVISION_CONFLICT");
      const report = await tx.collection("reports").findOne(
        {
          tenantId: job.tenantId,
          playerId: job.playerId,
          uploadId: upload.id,
          status: "restricted",
        },
        { session },
      );
      if (!report) throw new HabiApiError("NOT_FOUND");
      const clean = body.verdict === "clean";
      const uploadUpdate = await tx.collection("uploads").updateOne(
        {
          tenantId: job.tenantId,
          id: upload.id,
          revision: upload.revision,
          status: "quarantined",
        },
        {
          $set: {
            status: clean ? "ready" : "aborted",
            scanStatus: clean ? "passed" : "failed",
            scannerVersion: body.scannerVersion,
            updatedAt: now.toISOString(),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (uploadUpdate.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      if (clean) {
        const reportUpdate = await tx.collection("reports").updateOne(
          {
            tenantId: job.tenantId,
            id: report.id,
            revision: report.revision,
            status: "restricted",
          },
          {
            $set: { status: "ready", updatedAt: now.toISOString() },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (reportUpdate.modifiedCount !== 1)
          throw new HabiApiError("REVISION_CONFLICT");
      }
      const jobUpdate = await tx.collection("jobs").updateOne(
        { tenantId: job.tenantId, id: job.id, revision: job.revision },
        {
          $set: {
            status: clean ? "succeeded" : "failed",
            reasonCode: clean ? null : "MALWARE_DETECTED",
            resultRef: {
              id: report.id,
              revision: report.revision + (clean ? 1 : 0),
            },
            workerClientId: null,
            leaseTokenHash: null,
            leaseUntil: null,
            updatedAt: now.toISOString(),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (jobUpdate.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return { id: upload.id, revision: upload.revision + 1 };
    },
  });
  const completedJob = await db
    .collection("jobs")
    .findOne({ id, kind: "reportScan" });
  if (input.verdict === "infected") {
    const upload =
      result.resultRef?.id && completedJob
        ? await db.collection("uploads").findOne({
            tenantId: completedJob.tenantId,
            id: result.resultRef.id,
          })
        : null;
    if (upload?.gridFsFileId) {
      const storedFile = await db.collection("habi_reports.files").findOne({
        _id: upload.gridFsFileId,
        "metadata.tenantId": completedJob.tenantId,
        "metadata.uploadId": upload.id,
      });
      if (storedFile)
        await new GridFSBucket(db, { bucketName: "habi_reports" }).delete(
          upload.gridFsFileId,
        );
    }
  }
  const saved =
    result.resultRef?.id && completedJob
      ? await db
          .collection("uploads")
          .findOne({ tenantId: completedJob.tenantId, id: result.resultRef.id })
      : null;
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return {
    id: saved.id,
    revision: saved.revision,
    playerId: saved.playerId,
    status: saved.status,
    size: saved.size,
    sha256: saved.sha256,
    scanStatus: saved.scanStatus,
    scannerVersion: saved.scannerVersion ?? null,
    expiresAt: saved.expiresAt,
  };
}
