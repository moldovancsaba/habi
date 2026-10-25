import { GridFSBucket } from "mongodb";
import { HabiApiError } from "../api/error-response.mjs";

async function dto(db, item) {
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

function canRead(principal, item) {
  if (principal.tenantId !== item.tenantId) return false;
  return principal.role === "coach" || principal.playerId === item.playerId;
}

export async function listReports({
  db,
  principal,
  playerId = principal.playerId,
  limit = 50,
}) {
  if (principal.role !== "coach" && playerId !== principal.playerId)
    throw new HabiApiError("NOT_FOUND");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new HabiApiError("INVALID_INPUT");
  const items = await db
    .collection("reports")
    .find({ tenantId: principal.tenantId, playerId })
    .sort({ createdAt: -1, id: -1 })
    .limit(limit)
    .toArray();
  return {
    items: await Promise.all(items.map((item) => dto(db, item))),
    nextCursor: null,
    snapshotAt: new Date().toISOString(),
    accessRevision: principal.accessRevision,
  };
}

export async function getReport({ db, principal, id }) {
  const item = await db
    .collection("reports")
    .findOne({ tenantId: principal.tenantId, id });
  if (!item || !canRead(principal, item)) throw new HabiApiError("NOT_FOUND");
  return dto(db, item);
}

export async function openReportDownload({ db, principal, id }) {
  const report = await db
    .collection("reports")
    .findOne({ tenantId: principal.tenantId, id });
  if (!report || !canRead(principal, report) || report.status !== "ready")
    throw new HabiApiError("NOT_FOUND");
  const upload = await db.collection("uploads").findOne({
    tenantId: principal.tenantId,
    id: report.uploadId,
    status: "ready",
    scanStatus: "passed",
  });
  if (!upload?.gridFsFileId) throw new HabiApiError("NOT_FOUND");
  const bucket = new GridFSBucket(db, { bucketName: "habi_reports" });
  return bucket.openDownloadStream(upload.gridFsFileId);
}
