const envelopeSchema = {
  bsonType: "object",
  required: ["version", "algorithm", "purpose", "iv", "ciphertext", "tag"],
  additionalProperties: false,
  properties: {
    version: { bsonType: "int", enum: [1] },
    algorithm: { bsonType: "string", enum: ["A256GCM"] },
    purpose: { bsonType: "string", enum: ["access", "refresh"] },
    iv: { bsonType: "string", pattern: "^[A-Za-z0-9_-]{16}$" },
    ciphertext: {
      bsonType: "string",
      minLength: 2,
      maxLength: 21846,
      pattern: "^[A-Za-z0-9_-]+$",
    },
    tag: { bsonType: "string", pattern: "^[A-Za-z0-9_-]{22}$" },
  },
};

export const sessionSsoCredentialMongoSchema = Object.freeze({
  bsonType: "object",
  required: [
    "id",
    "schemaVersion",
    "revision",
    "sessionId",
    "actorId",
    "issuer",
    "clientId",
    "accessCredential",
    "refreshCredential",
    "accessTokenExpiresAt",
    "expiresAt",
    "refreshLeaseId",
    "refreshLeaseExpiresAt",
    "createdAt",
    "updatedAt",
    "revokedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: ["objectId", "string"] },
    id: { bsonType: "string", pattern: "^[a-f0-9]{48}$" },
    schemaVersion: { bsonType: "int", enum: [1] },
    revision: { bsonType: ["int", "long"], minimum: 1 },
    sessionId: { bsonType: "string", pattern: "^[a-f0-9]{48}$" },
    actorId: {
      bsonType: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    },
    issuer: {
      bsonType: "string",
      minLength: 10,
      maxLength: 500,
      pattern: "^https://",
    },
    clientId: {
      bsonType: "string",
      minLength: 1,
      maxLength: 300,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._~-]{0,299}$",
    },
    accessCredential: envelopeSchema,
    refreshCredential: envelopeSchema,
    accessTokenExpiresAt: { bsonType: "date" },
    expiresAt: { bsonType: "date" },
    refreshLeaseId: {
      bsonType: ["string", "null"],
      pattern: "^[A-Za-z0-9_-]{32,128}$",
    },
    refreshLeaseExpiresAt: { bsonType: ["date", "null"] },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
    revokedAt: { bsonType: ["date", "null"] },
  },
});

function date(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function tokenEnvelope(value, purpose) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.version === 1 &&
    value.algorithm === "A256GCM" &&
    value.purpose === purpose &&
    /^[A-Za-z0-9_-]{16}$/.test(value.iv) &&
    /^[A-Za-z0-9_-]{2,21846}$/.test(value.ciphertext) &&
    /^[A-Za-z0-9_-]{22}$/.test(value.tag) &&
    Object.keys(value).every((key) =>
      ["version", "algorithm", "purpose", "iv", "ciphertext", "tag"].includes(
        key,
      ),
    )
  );
}

export function validateSessionSsoCredential(document) {
  if (!document || typeof document !== "object" || Array.isArray(document))
    return false;
  const allowed = new Set([
    "_id",
    "id",
    "schemaVersion",
    "revision",
    "sessionId",
    "actorId",
    "issuer",
    "clientId",
    "accessCredential",
    "refreshCredential",
    "accessTokenExpiresAt",
    "expiresAt",
    "refreshLeaseId",
    "refreshLeaseExpiresAt",
    "createdAt",
    "updatedAt",
    "revokedAt",
  ]);
  if (Object.keys(document).some((key) => !allowed.has(key))) return false;
  return (
    /^[a-f0-9]{48}$/.test(document.id) &&
    document.schemaVersion === 1 &&
    Number.isSafeInteger(document.revision) &&
    document.revision >= 1 &&
    /^[a-f0-9]{48}$/.test(document.sessionId) &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(document.actorId) &&
    typeof document.issuer === "string" &&
    document.issuer.length <= 500 &&
    document.issuer.startsWith("https://") &&
    typeof document.clientId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._~-]{0,299}$/.test(document.clientId) &&
    tokenEnvelope(document.accessCredential, "access") &&
    tokenEnvelope(document.refreshCredential, "refresh") &&
    date(document.accessTokenExpiresAt) &&
    date(document.expiresAt) &&
    (document.refreshLeaseId === null ||
      /^[A-Za-z0-9_-]{32,128}$/.test(document.refreshLeaseId)) &&
    (document.refreshLeaseExpiresAt === null ||
      date(document.refreshLeaseExpiresAt)) &&
    date(document.createdAt) &&
    date(document.updatedAt) &&
    (document.revokedAt === null || date(document.revokedAt))
  );
}
