import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createRequire } from "node:module";
import { COLLECTION_SCHEMA } from "./migration-schema.mjs";
import {
  sessionSsoCredentialMongoSchema,
  validateSessionSsoCredential,
} from "./session-sso-credential-schema.mjs";

const require = createRequire(import.meta.url);
const contract = require("../../../contracts/domain-schemas.source.json");
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(contract);

const compiled = new Map(
  Object.entries(COLLECTION_SCHEMA)
    .filter(([, definition]) => definition)
    .map(([collection, definition]) => [
      collection,
      ajv.compile({ $ref: `${contract.$id}#/$defs/${definition}` }),
    ]),
);

const authTransactionSchema = {
  bsonType: "object",
  required: [
    "id",
    "stateHash",
    "browserBindingHash",
    "nonce",
    "pkceVerifier",
    "returnTo",
    "createdAt",
    "expiresAt",
    "consumedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: ["objectId", "string"] },
    id: { bsonType: "string", pattern: "^[A-Za-z0-9_-]{16,128}$" },
    stateHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    browserBindingHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    nonce: { bsonType: "string", pattern: "^[A-Za-z0-9_-]{32,128}$" },
    pkceVerifier: { bsonType: "string", pattern: "^[A-Za-z0-9_-]{43,128}$" },
    returnTo: { bsonType: "string", maxLength: 500 },
    createdAt: { bsonType: "date" },
    expiresAt: { bsonType: "date" },
    consumedAt: { bsonType: ["date", "null"] },
  },
};

const ssoOwnerLinkSchema = {
  bsonType: "object",
  required: ["_id", "ownerHash", "linkMethod", "linkedAt"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    ownerHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    linkMethod: { enum: ["verified_legacy_cookie", "sso_identity"] },
    linkedAt: {
      bsonType: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
  },
};

const ssoOwnerSessionSchema = {
  bsonType: "object",
  required: [
    "_id",
    "tokenHash",
    "identityHash",
    "ownerHash",
    "createdAt",
    "lastSeenAt",
    "expiresAt",
    "revokedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "string", pattern: "^[a-f0-9]{48}$" },
    tokenHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    identityHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    ownerHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    createdAt: {
      bsonType: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
    lastSeenAt: {
      bsonType: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
    expiresAt: { bsonType: "date" },
    revokedAt: {
      bsonType: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
    issuer: { bsonType: "string", pattern: "^https://", maxLength: 500 },
    subject: { bsonType: "string", minLength: 1, maxLength: 300 },
    permissionRole: { enum: ["user", "admin"] },
    displayName: { bsonType: "string", minLength: 1, maxLength: 100 },
  },
};

const roleInvitationSchema = {
  bsonType: "object",
  required: [
    "id",
    "tokenHash",
    "tenantId",
    "role",
    "playerId",
    "createdByIdentityHash",
    "createdAt",
    "expiresAt",
    "claimedAt",
    "claimedIdentityHash",
    "revokedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: ["objectId", "string"] },
    id: { bsonType: "string", pattern: "^[a-f0-9]{48}$" },
    tokenHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    tenantId: {
      bsonType: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    },
    role: { enum: ["player", "parent", "coach"] },
    playerDisplayName: { bsonType: "string", minLength: 1, maxLength: 100 },
    playerId: {
      bsonType: ["string", "null"],
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    },
    createdByIdentityHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    targetIdentityHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    createdAt: {
      bsonType: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
    expiresAt: { bsonType: "date" },
    claimedAt: {
      bsonType: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
    claimedIdentityHash: {
      bsonType: ["string", "null"],
      pattern: "^[a-f0-9]{64}$",
    },
    revokedAt: {
      bsonType: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
  },
};

const roleRequestSchema = {
  bsonType: "object",
  required: [
    "id",
    "tenantId",
    "actorId",
    "identityHash",
    "role",
    "displayName",
    "status",
    "invitationId",
    "createdAt",
    "updatedAt",
    "retentionPolicyId",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: ["objectId", "string"] },
    id: { bsonType: "string", pattern: "^[a-f0-9]{48}$" },
    tenantId: {
      bsonType: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    },
    actorId: {
      bsonType: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    },
    identityHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    role: { enum: ["player", "parent", "coach"] },
    displayName: { bsonType: "string", minLength: 2, maxLength: 100 },
    status: { enum: ["pending", "invitation-issued", "declined"] },
    invitationId: { bsonType: ["string", "null"], pattern: "^[a-f0-9]{48}$" },
    createdAt: {
      bsonType: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
    updatedAt: {
      bsonType: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
    retentionPolicyId: {
      bsonType: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    },
  },
};

const ssoOwnerHandoffSchema = {
  bsonType: "object",
  required: [
    "_id",
    "tokenHash",
    "ownerHash",
    "bindingHash",
    "createdAt",
    "boundAt",
    "expiresAt",
    "consumedAt",
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "string", pattern: "^[a-f0-9]{48}$" },
    tokenHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    ownerHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    bindingHash: { bsonType: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
    createdAt: {
      bsonType: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
    boundAt: {
      bsonType: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
    expiresAt: { bsonType: "date" },
    consumedAt: {
      bsonType: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
  },
};

function normalizeStoredDates(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeStoredDates);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "_id")
        .map(([key, nested]) => [key, normalizeStoredDates(nested)]),
    );
  }
  return value;
}

export function validateContractDocument(collection, document) {
  if (collection === "habi_sso_owner_links") {
    if (!validateSsoOwnerLink(document))
      throw new Error("DOCUMENT_CONTRACT_INVALID:sso_owner_link");
    return true;
  }
  if (collection === "habi_sso_owner_sessions") {
    if (!validateSsoOwnerSession(document))
      throw new Error("DOCUMENT_CONTRACT_INVALID:sso_owner_session");
    return true;
  }
  if (collection === "habi_sso_owner_handoffs") {
    if (!validateSsoOwnerHandoff(document))
      throw new Error("DOCUMENT_CONTRACT_INVALID:sso_owner_handoff");
    return true;
  }
  if (collection === "habi_role_invitations") {
    if (!validateRoleInvitation(document))
      throw new Error("DOCUMENT_CONTRACT_INVALID:role_invitation");
    return true;
  }
  if (collection === "habi_role_requests") {
    if (!validateRoleRequest(document))
      throw new Error("DOCUMENT_CONTRACT_INVALID:role_request");
    return true;
  }
  if (collection === "session_sso_credentials") {
    if (!validateSessionSsoCredential(document)) {
      throw new Error("DOCUMENT_CONTRACT_INVALID:session_sso_credential");
    }
    return true;
  }
  if (collection === "auth_transactions") {
    const candidate = { ...document };
    if (typeof candidate.createdAt === "string")
      candidate.createdAt = new Date(candidate.createdAt);
    if (typeof candidate.expiresAt === "string")
      candidate.expiresAt = new Date(candidate.expiresAt);
    if (typeof candidate.consumedAt === "string")
      candidate.consumedAt = new Date(candidate.consumedAt);
    const valid = validateInternalAuthTransaction(candidate);
    if (!valid) throw new Error("DOCUMENT_CONTRACT_INVALID:auth_transaction");
    return true;
  }
  const validator = compiled.get(collection);
  if (!validator) throw new Error("COLLECTION_SCHEMA_UNKNOWN");
  const valid = validator(normalizeStoredDates(document));
  if (!valid) {
    const details = (validator.errors ?? [])
      .map(({ instancePath, keyword }) => `${instancePath || "/"}:${keyword}`)
      .join(",");
    throw new Error(`DOCUMENT_CONTRACT_INVALID:${details}`);
  }
  return true;
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function validateSsoOwnerLink(document) {
  return (
    document &&
    typeof document === "object" &&
    !Array.isArray(document) &&
    Object.keys(document).every((key) =>
      ["_id", "ownerHash", "linkMethod", "linkedAt"].includes(key),
    ) &&
    /^[a-f0-9]{64}$/.test(document._id) &&
    /^[a-f0-9]{64}$/.test(document.ownerHash) &&
    ["verified_legacy_cookie", "sso_identity"].includes(document.linkMethod) &&
    isIsoTimestamp(document.linkedAt)
  );
}

function validateSsoOwnerSession(document) {
  const required = [
    "_id",
    "tokenHash",
    "identityHash",
    "ownerHash",
    "createdAt",
    "lastSeenAt",
    "expiresAt",
    "revokedAt",
  ];
  const optional = ["issuer", "subject", "permissionRole", "displayName"];
  return (
    document &&
    typeof document === "object" &&
    !Array.isArray(document) &&
    required.every((key) => Object.hasOwn(document, key)) &&
    Object.keys(document).every(
      (key) => required.includes(key) || optional.includes(key),
    ) &&
    /^[a-f0-9]{48}$/.test(document._id) &&
    /^[a-f0-9]{64}$/.test(document.tokenHash) &&
    /^[a-f0-9]{64}$/.test(document.identityHash) &&
    /^[a-f0-9]{64}$/.test(document.ownerHash) &&
    isIsoTimestamp(document.createdAt) &&
    isIsoTimestamp(document.lastSeenAt) &&
    document.expiresAt instanceof Date &&
    Number.isFinite(document.expiresAt.getTime()) &&
    (document.issuer === undefined ||
      (typeof document.issuer === "string" &&
        document.issuer.startsWith("https://") &&
        document.issuer.length <= 500)) &&
    (document.subject === undefined ||
      (typeof document.subject === "string" &&
        document.subject.length > 0 &&
        document.subject.length <= 300)) &&
    (document.permissionRole === undefined ||
      ["user", "admin"].includes(document.permissionRole)) &&
    (document.displayName === undefined ||
      (typeof document.displayName === "string" &&
        document.displayName.trim().length > 0 &&
        document.displayName.length <= 100)) &&
    (document.revokedAt === null || isIsoTimestamp(document.revokedAt))
  );
}

function validateRoleInvitation(document) {
  return Boolean(
    document &&
      typeof document === "object" &&
      !Array.isArray(document) &&
      Object.keys(document).every((key) =>
        [
          "_id",
          "id",
          "tokenHash",
          "tenantId",
          "role",
          "playerId",
          "playerDisplayName",
          "createdByIdentityHash",
          "targetIdentityHash",
          "createdAt",
          "expiresAt",
          "claimedAt",
          "claimedIdentityHash",
          "revokedAt",
        ].includes(key),
      ) &&
      [
        "id",
        "tokenHash",
        "tenantId",
        "role",
        "playerId",
        "createdByIdentityHash",
        "createdAt",
        "expiresAt",
        "claimedAt",
        "claimedIdentityHash",
        "revokedAt",
      ].every((key) => Object.hasOwn(document, key)) &&
      /^[a-f0-9]{48}$/.test(document.id) &&
      /^[a-f0-9]{64}$/.test(document.tokenHash) &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(document.tenantId) &&
      ["player", "parent", "coach"].includes(document.role) &&
      (document.playerId === null ||
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(document.playerId)) &&
      /^[a-f0-9]{64}$/.test(document.createdByIdentityHash) &&
      (document.targetIdentityHash === undefined ||
        /^[a-f0-9]{64}$/.test(document.targetIdentityHash)) &&
      isIsoTimestamp(document.createdAt) &&
      document.expiresAt instanceof Date &&
      Number.isFinite(document.expiresAt.getTime()) &&
      (document.claimedAt === null || isIsoTimestamp(document.claimedAt)) &&
      (document.claimedIdentityHash === null ||
        /^[a-f0-9]{64}$/.test(document.claimedIdentityHash)) &&
      (document.revokedAt === null || isIsoTimestamp(document.revokedAt)) &&
      ((document.role === "coach" && document.playerId === null) ||
        (document.role !== "coach" && typeof document.playerId === "string")) &&
      (document.playerDisplayName === undefined ||
        (document.role === "player" &&
          typeof document.playerDisplayName === "string" &&
          document.playerDisplayName.trim().length > 0 &&
          document.playerDisplayName.length <= 100)),
  );
}

function validateRoleRequest(document) {
  return Boolean(
    document &&
      typeof document === "object" &&
      !Array.isArray(document) &&
      Object.keys(document).every((key) =>
        [
          "_id",
          "id",
          "tenantId",
          "actorId",
          "identityHash",
          "role",
          "displayName",
          "status",
          "invitationId",
          "createdAt",
          "updatedAt",
          "retentionPolicyId",
        ].includes(key),
      ) &&
      [
        "id",
        "tenantId",
        "actorId",
        "identityHash",
        "role",
        "displayName",
        "status",
        "invitationId",
        "createdAt",
        "updatedAt",
        "retentionPolicyId",
      ].every((key) => Object.hasOwn(document, key)) &&
      /^[a-f0-9]{48}$/.test(document.id) &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(document.tenantId) &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(document.actorId) &&
      /^[a-f0-9]{64}$/.test(document.identityHash) &&
      ["player", "parent", "coach"].includes(document.role) &&
      typeof document.displayName === "string" &&
      document.displayName.trim().length >= 2 &&
      document.displayName.length <= 100 &&
      ["pending", "invitation-issued", "declined"].includes(document.status) &&
      (document.invitationId === null ||
        /^[a-f0-9]{48}$/.test(document.invitationId)) &&
      isIsoTimestamp(document.createdAt) &&
      isIsoTimestamp(document.updatedAt) &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(document.retentionPolicyId),
  );
}

function validateSsoOwnerHandoff(document) {
  const required = [
    "_id",
    "tokenHash",
    "ownerHash",
    "bindingHash",
    "createdAt",
    "boundAt",
    "expiresAt",
    "consumedAt",
  ];
  return Boolean(
    document &&
      typeof document === "object" &&
      !Array.isArray(document) &&
      required.every((key) => Object.hasOwn(document, key)) &&
      Object.keys(document).every((key) => required.includes(key)) &&
      /^[a-f0-9]{48}$/.test(document._id) &&
      /^[a-f0-9]{64}$/.test(document.tokenHash) &&
      /^[a-f0-9]{64}$/.test(document.ownerHash) &&
      (document.bindingHash === null ||
        /^[a-f0-9]{64}$/.test(document.bindingHash)) &&
      isIsoTimestamp(document.createdAt) &&
      (document.boundAt === null || isIsoTimestamp(document.boundAt)) &&
      document.expiresAt instanceof Date &&
      Number.isFinite(document.expiresAt.getTime()) &&
      (document.consumedAt === null || isIsoTimestamp(document.consumedAt)),
  );
}

export function mongoValidatorForCollection(collection) {
  if (collection === "session_sso_credentials")
    return { $jsonSchema: sessionSsoCredentialMongoSchema };
  if (collection === "auth_transactions")
    return { $jsonSchema: authTransactionSchema };
  if (collection === "habi_sso_owner_links")
    return { $jsonSchema: ssoOwnerLinkSchema };
  if (collection === "habi_sso_owner_sessions")
    return { $jsonSchema: ssoOwnerSessionSchema };
  if (collection === "habi_sso_owner_handoffs")
    return { $jsonSchema: ssoOwnerHandoffSchema };
  if (collection === "habi_role_invitations")
    return { $jsonSchema: roleInvitationSchema };
  if (collection === "habi_role_requests")
    return { $jsonSchema: roleRequestSchema };
  const definition = COLLECTION_SCHEMA[collection];
  if (!definition) throw new Error("COLLECTION_SCHEMA_UNKNOWN");
  return {
    $jsonSchema: mongoSchema(contract.$defs[definition], new Set(), collection),
  };
}

function validateInternalAuthTransaction(document) {
  const schema = authTransactionSchema;
  const properties = schema.properties;
  if (!document || typeof document !== "object" || Array.isArray(document))
    return false;
  if (Object.keys(document).some((key) => !Object.hasOwn(properties, key)))
    return false;
  if (schema.required.some((key) => !Object.hasOwn(document, key)))
    return false;
  for (const [key, value] of Object.entries(document)) {
    const rule = properties[key];
    if (
      rule.bsonType === "date" &&
      !(value instanceof Date && Number.isFinite(value.getTime()))
    )
      return false;
    if (rule.bsonType === "null" && value !== null) return false;
    if (rule.bsonType === "string") {
      if (
        typeof value !== "string" ||
        (rule.maxLength && value.length > rule.maxLength)
      )
        return false;
      if (rule.pattern && !new RegExp(rule.pattern).test(value)) return false;
    }
    if (
      Array.isArray(rule.bsonType) &&
      !rule.bsonType.some((type) =>
        type === "null"
          ? value === null
          : type === "date" &&
            value instanceof Date &&
            Number.isFinite(value.getTime()),
      )
    )
      return false;
  }
  return true;
}

function mongoSchema(schema, seenRefs, collection, propertyName = null) {
  if (schema.$ref) {
    const refName = schema.$ref.split("/").at(-1);
    if (seenRefs.has(refName)) return { bsonType: "object" };
    const nextRefs = new Set(seenRefs).add(refName);
    return mongoSchema(
      contract.$defs[refName],
      nextRefs,
      collection,
      propertyName,
    );
  }

  const variants = schema.anyOf ?? schema.oneOf ?? null;
  const active = variants
    ? variants.filter((item) => item.type !== "null")
    : [schema];
  const resolved = active.map((item) => {
    if (!item.$ref) return item;
    const refName = item.$ref.split("/").at(-1);
    return contract.$defs[refName] ?? {};
  });
  const effective =
    resolved.find((item) => item.properties || item.type) ?? schema;
  const typeSet = new Set();
  for (const variant of resolved) {
    const types = Array.isArray(variant.type) ? variant.type : [variant.type];
    for (const type of types) {
      const bsonType = mongoType(type);
      if (bsonType)
        for (const item of Array.isArray(bsonType) ? bsonType : [bsonType])
          typeSet.add(item);
    }
  }
  if (variants?.some((item) => item.type === "null")) typeSet.add("null");
  if (
    (collection === "sessions" || collection === "idempotency") &&
    propertyName === "expiresAt"
  ) {
    typeSet.add("date");
  }

  const output = {};
  if (typeSet.size) output.bsonType = [...typeSet];
  const properties = effective.properties ?? schema.properties;
  if (properties) {
    output.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        mongoSchema(value, seenRefs, collection, key),
      ]),
    );
    if (Object.hasOwn(output.properties, "_id")) {
      output.properties._id = { bsonType: ["objectId", "string"] };
    } else if (
      schema.additionalProperties === false ||
      effective.additionalProperties === false
    ) {
      output.properties._id = { bsonType: ["objectId", "string"] };
    }
  }
  if (effective.required) output.required = effective.required;
  if (effective.additionalProperties === false)
    output.additionalProperties = false;
  if (schema.enum) output.enum = schema.enum;
  if (schema.const !== undefined) output.enum = [schema.const];
  for (const key of [
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "pattern",
  ]) {
    if (schema[key] !== undefined) output[key] = schema[key];
  }
  if (schema.items)
    output.items = mongoSchema(schema.items, seenRefs, collection);
  return output;
}

function mongoType(type) {
  if (type === "string") return "string";
  if (type === "integer") return ["int", "long"];
  if (type === "number") return ["int", "long", "double", "decimal"];
  if (type === "boolean") return "bool";
  if (type === "object") return "object";
  if (type === "array") return "array";
  if (type === "null") return "null";
  return undefined;
}
