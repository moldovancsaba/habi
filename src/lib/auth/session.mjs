import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { validateContractDocument } from "../database/contract-validation.mjs";

export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;

function mac(key, purpose, value) {
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") < 32) {
    throw new Error("SESSION_HMAC_KEY_INVALID");
  }
  return createHmac("sha256", key)
    .update(`${purpose}:${value}`, "utf8")
    .digest("hex");
}

export function sessionTokenHash(token, key) {
  return mac(key, "habi-session", token);
}

export function deriveCsrfToken(token, key) {
  return createHmac("sha256", key)
    .update(`habi-csrf:${token}`, "utf8")
    .digest("base64url");
}

export function verifyCsrfToken(token, supplied, key) {
  if (typeof supplied !== "string") return false;
  const expected = deriveCsrfToken(token, key);
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return (
    left.length === right.length &&
    left.length > 0 &&
    timingSafeEqual(left, right)
  );
}

export async function issueSession(
  collection,
  {
    actorId,
    tenantId,
    retentionPolicyId,
    activeRole,
    playerId = null,
    accessRevision,
    hmacKey,
    now = new Date(),
  },
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  const document = {
    // Contract IDs must start with an alphanumeric character; hex is both
    // unpredictable and guaranteed to satisfy that constraint.
    id: randomBytes(24).toString("hex"),
    tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    retentionPolicyId,
    tokenHash: sessionTokenHash(token, hmacKey),
    actorId,
    activeRole,
    playerId,
    accessRevision,
    authenticatedAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt,
    revokedAt: null,
  };
  validateContractDocument("sessions", document);
  await collection.insertOne(document);
  return Object.freeze({
    token,
    csrfToken: deriveCsrfToken(token, hmacKey),
    document: Object.freeze(document),
  });
}

export async function readActiveSession(
  collection,
  token,
  hmacKey,
  now = new Date(),
) {
  if (typeof token !== "string" || !token) return null;
  const session = await collection.findOne({
    tokenHash: sessionTokenHash(token, hmacKey),
    revokedAt: null,
    expiresAt: { $gt: now },
    lastSeenAt: {
      $gt: new Date(now.getTime() - SESSION_IDLE_MS).toISOString(),
    },
  });
  if (!session) return null;
  if (session.expiresAt instanceof Date && session.expiresAt <= now)
    return null;
  return session;
}

export async function touchSession(collection, session, now = new Date()) {
  const result = await collection.updateOne(
    {
      id: session.id,
      tokenHash: session.tokenHash,
      accessRevision: session.accessRevision,
      revokedAt: null,
      expiresAt: { $gt: now },
      lastSeenAt: {
        $gt: new Date(now.getTime() - SESSION_IDLE_MS).toISOString(),
      },
    },
    { $set: { lastSeenAt: now.toISOString(), updatedAt: now.toISOString() } },
  );
  return result.matchedCount === 1;
}

export async function revokeSession(collection, session, now = new Date()) {
  const result = await collection.updateOne(
    { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
    {
      $set: { revokedAt: now.toISOString(), updatedAt: now.toISOString() },
      $inc: { revision: 1 },
    },
  );
  return result.modifiedCount === 1;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_ABSOLUTE_MS / 1000,
  };
}
