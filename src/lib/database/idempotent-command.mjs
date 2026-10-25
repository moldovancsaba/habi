import { createHash, randomUUID } from "node:crypto";
import { validateContractDocument } from "./contract-validation.mjs";

export function hashRequestBody(body) {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function canonicalJson(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("IDEMPOTENCY_BODY_NOT_JSON");
}

export async function runIdempotentCommand({
  client,
  db,
  tenantId,
  retentionPolicyId,
  actorOrClientId,
  method,
  path,
  key,
  body,
  execute,
  now = () => new Date(),
}) {
  const bodyHash = hashRequestBody(body);
  const scope = { tenantId, actorOrClientId, method, path, key };
  const receivedAt = now();
  const session = client.startSession();

  try {
    let response;
    try {
      await session.withTransaction(
        async () => {
          const idempotency = db.collection("idempotency");
          const existing = await idempotency.findOne(scope, { session });
          if (existing) {
            const expiry = new Date(existing.expiresAt);
            if (!Number.isFinite(expiry.getTime())) {
              throw new Error("IDEMPOTENCY_RECORD_INVALID");
            }
            if (expiry > receivedAt) {
              if (existing.bodyHash !== bodyHash)
                throw new Error("IDEMPOTENCY_CONFLICT");
              response = {
                status: existing.responseStatus,
                resultRef: existing.resultRef,
                replayed: true,
              };
              return;
            }
            await idempotency.deleteOne({ _id: existing._id }, { session });
          }

          const result = await execute({ db, session });
          const completedAt = now();
          const record = {
            id: randomUUID(),
            tenantId,
            schemaVersion: 2,
            revision: 1,
            createdAt: completedAt.toISOString(),
            updatedAt: completedAt.toISOString(),
            retentionPolicyId,
            ...scope,
            bodyHash,
            responseStatus: result.status,
            resultRef: result.resultRef ?? null,
            // MongoDB TTL indexes require BSON Date values; the API adapter serializes dates to ISO.
            expiresAt: new Date(completedAt.getTime() + 24 * 60 * 60 * 1000),
          };
          validateContractDocument("idempotency", record);
          await idempotency.insertOne(record, { session });
          response = { ...result, replayed: false };
        },
        {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
          readPreference: "primary",
        },
      );
    } catch (error) {
      // A duplicate-key race can happen when two identical requests start together.
      // Read the committed receipt after the losing transaction has aborted.
      if (error?.code !== 11000) throw error;
      const committed = await db.collection("idempotency").findOne(scope);
      if (!committed) throw error;
      if (committed.bodyHash !== bodyHash)
        throw new Error("IDEMPOTENCY_CONFLICT");
      response = {
        status: committed.responseStatus,
        resultRef: committed.resultRef,
        replayed: true,
      };
    }

    if (!response) throw new Error("TRANSACTION_RESULT_MISSING");
    return response;
  } finally {
    await session.endSession();
  }
}
