import { createHash, randomUUID } from "node:crypto";
import { GridFSBucket } from "mongodb";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";

const CHUNK_BYTES = 1_048_576;
const EXPIRY_MS = 86_400_000;

function uploadDto(item) {
  return {
    id: item.id,
    revision: item.revision,
    playerId: item.playerId,
    status: item.status,
    size: item.size,
    sha256: item.sha256,
    scanStatus: item.scanStatus,
    scannerVersion: item.scannerVersion ?? null,
    expiresAt: item.expiresAt,
  };
}

async function reportDto(db, item) {
  const extraction = await db
    .collection("extractions")
    .find({
      tenantId: item.tenantId,
      playerId: item.playerId,
      "reportRef.id": item.id,
    })
    .sort({ createdAt: -1, id: -1 })
    .limit(1)
    .next();
  const publication = await db.collection("publications").findOne({
    tenantId: item.tenantId,
    playerId: item.playerId,
    resourceRef: { id: item.id, revision: item.revision },
    status: "active",
  });
  const upload = await db.collection("uploads").findOne({
    tenantId: item.tenantId,
    playerId: item.playerId,
    id: item.uploadId,
  });
  return {
    id: item.id,
    revision: item.revision,
    playerId: item.playerId,
    providerVersion: item.providerVersion,
    status: item.status,
    scanStatus: upload?.scanStatus ?? "failed",
    latestExtractionRef: extraction
      ? { id: extraction.id, revision: extraction.revision }
      : null,
    publicationRef: publication
      ? { id: publication.id, revision: publication.revision }
      : null,
  };
}

function access(principal, playerId) {
  if (principal.role === "player" && principal.playerId !== playerId)
    throw new HabiApiError("NOT_FOUND");
  if (principal.role === "parent" && principal.playerId !== playerId)
    throw new HabiApiError("NOT_FOUND");
  if (!new Set(["player", "parent", "coach"]).has(principal.role))
    throw new HabiApiError("ACCESS_DENIED");
}

function canAccessUpload(principal, upload) {
  return Boolean(
    upload &&
      upload.tenantId === principal.tenantId &&
      (principal.role === "coach" || upload.playerId === principal.playerId),
  );
}

function requireKey(request) {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  return key;
}

export async function createUpload({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  access(principal, playerId);
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput("UploadInput", input))
    throw new HabiApiError("INVALID_INPUT");
  const id = randomUUID();
  const doc = {
    id,
    tenantId: principal.tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    retentionPolicyId: principal.retentionPolicyId,
    playerId,
    status: "staged",
    size: input.size,
    sha256: input.sha256,
    chunkHashes: [],
    gridFsFileId: null,
    scanStatus: "pending",
    scannerVersion: null,
    expiresAt: new Date(now.getTime() + EXPIRY_MS).toISOString(),
  };
  validateContractDocument("uploads", doc);
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
    key: requireKey(request),
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      const player = await tx
        .collection("players")
        .findOne({ tenantId: principal.tenantId, id: playerId }, { session });
      if (!player) throw new HabiApiError("NOT_FOUND");
      await tx.collection("uploads").insertOne(doc, { session });
      return { status: 201, resultRef: { id, revision: 1 } };
    },
  });
  const saved = await db
    .collection("uploads")
    .findOne({ tenantId: principal.tenantId, id: command.resultRef.id });
  if (!saved) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: command.status, body: uploadDto(saved) };
}

export async function putUploadChunk({
  request,
  client,
  db,
  principal,
  id,
  index,
  now = new Date(),
}) {
  if (!Number.isInteger(index) || index < 0 || index > 9)
    throw new HabiApiError("INVALID_INPUT");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!declared || declared > CHUNK_BYTES)
    throw new HabiApiError("INVALID_INPUT");
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > CHUNK_BYTES || bytes.length !== declared)
    throw new HabiApiError("INVALID_INPUT");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== request.headers.get("x-chunk-sha256"))
    throw new HabiApiError("INVALID_INPUT");
  const key = requireKey(request);
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
    body: { id, index, size: bytes.length, sha256 },
    now: () => now,
    async execute({ db: tx, session }) {
      const upload = await tx
        .collection("uploads")
        .findOne({ tenantId: principal.tenantId, id }, { session });
      if (
        !canAccessUpload(principal, upload) ||
        upload.status !== "staged" ||
        Date.parse(upload.expiresAt) <= now.getTime()
      )
        throw new HabiApiError("NOT_FOUND");
      const count = Math.ceil(upload.size / CHUNK_BYTES);
      const expectedSize =
        index === count - 1 ? upload.size - index * CHUNK_BYTES : CHUNK_BYTES;
      if (index >= count || bytes.length !== expectedSize)
        throw new HabiApiError("INVALID_INPUT");
      const prior = await tx
        .collection("upload_chunks")
        .findOne(
          { tenantId: principal.tenantId, uploadId: id, index },
          { session },
        );
      if (prior) {
        if (prior.sha256 !== sha256 || prior.size !== bytes.length)
          throw new HabiApiError("REVISION_CONFLICT");
      } else {
        await tx.collection("upload_chunks").insertOne(
          {
            tenantId: principal.tenantId,
            uploadId: id,
            index,
            size: bytes.length,
            sha256,
            bytes,
            expiresAt: new Date(upload.expiresAt),
          },
          { session },
        );
      }
      if (prior)
        return { status: 200, resultRef: { id, revision: upload.revision } };
      const chunkHashes = [...upload.chunkHashes];
      chunkHashes[index] = sha256;
      const updated = await tx.collection("uploads").updateOne(
        {
          tenantId: principal.tenantId,
          id,
          revision: upload.revision,
          status: "staged",
        },
        {
          $set: { chunkHashes, updatedAt: now.toISOString() },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (updated.modifiedCount !== 1)
        throw new HabiApiError("REVISION_CONFLICT");
      return { status: 200, resultRef: { id, revision: upload.revision + 1 } };
    },
  });
  const saved = await db
    .collection("uploads")
    .findOne({ tenantId: principal.tenantId, id });
  if (!saved) throw new HabiApiError("NOT_FOUND");
  return { status: command.status, body: uploadDto(saved) };
}

export async function finalizeUpload({
  request,
  client,
  db,
  principal,
  id,
  now = new Date(),
}) {
  const upload = await db
    .collection("uploads")
    .findOne({ tenantId: principal.tenantId, id });
  if (!canAccessUpload(principal, upload)) throw new HabiApiError("NOT_FOUND");
  if (upload.status === "quarantined" && upload.gridFsFileId) {
    const report = await db
      .collection("reports")
      .findOne({ tenantId: principal.tenantId, uploadId: id });
    if (report) return { status: 201, body: await reportDto(db, report) };
  }
  if (
    upload.status !== "staged" ||
    Date.parse(upload.expiresAt) <= now.getTime()
  )
    throw new HabiApiError("REVISION_CONFLICT");
  const count = Math.ceil(upload.size / CHUNK_BYTES);
  const chunks = await db
    .collection("upload_chunks")
    .find({ tenantId: principal.tenantId, uploadId: id })
    .sort({ index: 1 })
    .toArray();
  if (
    chunks.length !== count ||
    chunks.some((chunk, index) => chunk.index !== index)
  )
    throw new HabiApiError("REVISION_CONFLICT");
  const bytes = Buffer.concat(
    chunks.map((chunk) =>
      Buffer.isBuffer(chunk.bytes)
        ? chunk.bytes
        : Buffer.from(chunk.bytes.value()),
    ),
  );
  if (
    bytes.length !== upload.size ||
    createHash("sha256").update(bytes).digest("hex") !== upload.sha256 ||
    bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
  )
    throw new HabiApiError("INVALID_INPUT");

  const bucket = new GridFSBucket(db, { bucketName: "habi_reports" });
  let fileId = upload.gridFsFileId;
  if (!fileId) {
    fileId = id;
    const existingFile = await db.collection("habi_reports.files").findOne({
      _id: fileId,
      "metadata.uploadId": id,
      "metadata.tenantId": principal.tenantId,
    });
    if (!existingFile) {
      await new Promise((resolve, reject) => {
        const stream = bucket.openUploadStreamWithId(
          fileId,
          `report-${id}.pdf`,
          {
            metadata: {
              tenantId: principal.tenantId,
              playerId: upload.playerId,
              uploadId: id,
              sha256: upload.sha256,
              scanStatus: "pending",
            },
            contentType: "application/pdf",
          },
        );
        stream.once("error", reject);
        stream.once("finish", resolve);
        stream.end(bytes);
      });
    }
  }
  const reportId = randomUUID();
  const report = {
    id: reportId,
    tenantId: principal.tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    retentionPolicyId: principal.retentionPolicyId,
    playerId: upload.playerId,
    uploadId: upload.id,
    fileHash: upload.sha256,
    providerVersion: null,
    rightsEvidenceRef: null,
    status: "restricted",
  };
  validateContractDocument("reports", report);
  const scanJob = {
    id: randomUUID(),
    tenantId: principal.tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    retentionPolicyId: principal.retentionPolicyId,
    playerId: upload.playerId,
    kind: "reportScan",
    requesterActorId: principal.actorId,
    requesterAccessRevision: principal.accessRevision,
    requesterRole: principal.role,
    turnId: null,
    uploadId: id,
    sourceRefs: [],
    status: "queued",
    reasonCode: null,
    workerClientId: null,
    fence: 0,
    leaseTokenHash: null,
    leaseUntil: null,
    nextAttemptAt: now.toISOString(),
    attempts: 0,
    resultRef: null,
    retryOf: null,
    claimKeyHash: null,
    claimServiceId: null,
    claimRequestHash: null,
    claimContextRevision: null,
  };
  validateContractDocument("jobs", scanJob);
  const key = requireKey(request);
  await runIdempotentCommand({
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
    body: { id },
    now: () => now,
    async execute({ db: tx, session }) {
      const current = await tx.collection("uploads").findOne(
        {
          tenantId: principal.tenantId,
          id,
          revision: upload.revision,
          status: "staged",
        },
        { session },
      );
      if (!current) throw new HabiApiError("REVISION_CONFLICT");
      const existing = await tx
        .collection("reports")
        .findOne({ tenantId: principal.tenantId, uploadId: id }, { session });
      if (existing)
        return {
          status: 201,
          resultRef: { id: existing.id, revision: existing.revision },
        };
      await tx.collection("uploads").updateOne(
        { tenantId: principal.tenantId, id, revision: upload.revision },
        {
          $set: {
            status: "quarantined",
            gridFsFileId: fileId,
            updatedAt: now.toISOString(),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      await tx.collection("reports").insertOne(report, { session });
      await tx.collection("jobs").insertOne(scanJob, { session });
      await tx
        .collection("upload_chunks")
        .deleteMany(
          { tenantId: principal.tenantId, uploadId: id },
          { session },
        );
      return {
        status: 201,
        resultRef: { id: report.id, revision: report.revision },
      };
    },
  });
  const savedReport = await db
    .collection("reports")
    .findOne({ tenantId: principal.tenantId, uploadId: id });
  if (!savedReport) throw new Error("TRANSACTION_RESULT_MISSING");
  return { status: 201, body: await reportDto(db, savedReport) };
}

export async function getUpload({ db, principal, id }) {
  const item = await db
    .collection("uploads")
    .findOne({ tenantId: principal.tenantId, id });
  if (
    !item ||
    (principal.role !== "coach" && item.playerId !== principal.playerId)
  )
    throw new HabiApiError("NOT_FOUND");
  return uploadDto(item);
}

export async function abortUpload({
  request,
  client,
  db,
  principal,
  id,
  now = new Date(),
}) {
  const key = requireKey(request);
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
    body: { id },
    now: () => now,
    async execute({ db: tx, session }) {
      const item = await tx
        .collection("uploads")
        .findOne({ tenantId: principal.tenantId, id }, { session });
      if (!canAccessUpload(principal, item) || item.status !== "staged")
        throw new HabiApiError("NOT_FOUND");
      await tx.collection("uploads").updateOne(
        { tenantId: principal.tenantId, id, revision: item.revision },
        {
          $set: { status: "aborted", updatedAt: now.toISOString() },
          $inc: { revision: 1 },
        },
        { session },
      );
      await tx
        .collection("upload_chunks")
        .deleteMany(
          { tenantId: principal.tenantId, uploadId: id },
          { session },
        );
      return { status: 200, resultRef: { id, revision: item.revision + 1 } };
    },
  });
  const saved = await db
    .collection("uploads")
    .findOne({ tenantId: principal.tenantId, id });
  if (!saved) throw new HabiApiError("NOT_FOUND");
  return { status: command.status, body: uploadDto(saved) };
}
