import { createHmac, randomBytes } from "node:crypto";

export const SSO_OWNER_SESSION_COOKIE = "__Host-habi_sso";
export const SSO_OWNER_HANDOFF_COOKIE = "__Host-habi_handoff";
export const SSO_OWNER_SESSION_MS = 8 * 60 * 60 * 1000;
export const SSO_OWNER_SESSION_IDLE_MS = 30 * 60 * 1000;
export const SSO_OWNER_HANDOFF_MS = 30 * 60 * 1000;

function digest(key, purpose, value) {
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") < 32) {
    throw new Error("SESSION_HMAC_KEY_INVALID");
  }
  return createHmac("sha256", key)
    .update(`${purpose}:${value}`, "utf8")
    .digest("hex");
}

export function readCookie(cookieHeader, name) {
  for (const part of (cookieHeader ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    return part.slice(at + 1).trim();
  }
  return null;
}

export async function createLegacyOwnerHandoff(
  handoffs,
  { ownerHash, hmacKey, now = new Date() },
) {
  if (!/^[a-f0-9]{64}$/.test(ownerHash ?? "")) {
    throw new Error("LEGACY_OWNER_HASH_INVALID");
  }
  const token = randomBytes(32).toString("base64url");
  const handoff = {
    _id: randomBytes(24).toString("hex"),
    tokenHash: digest(hmacKey, "habi-owner-handoff", token),
    ownerHash,
    bindingHash: null,
    createdAt: now.toISOString(),
    boundAt: null,
    expiresAt: new Date(now.getTime() + SSO_OWNER_HANDOFF_MS),
    consumedAt: null,
  };
  await handoffs.insertOne(handoff);
  return Object.freeze({ token, handoffId: handoff._id });
}

export async function bindLegacyOwnerHandoff(
  handoffs,
  token,
  hmacKey,
  now = new Date(),
) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }
  const binding = randomBytes(32).toString("base64url");
  const bindingHash = digest(hmacKey, "habi-owner-handoff-binding", binding);
  const result = await handoffs.updateOne(
    {
      tokenHash: digest(hmacKey, "habi-owner-handoff", token),
      bindingHash: null,
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { bindingHash, boundAt: now.toISOString() } },
  );
  return result.modifiedCount === 1 ? binding : null;
}

export async function consumeLegacyOwnerHandoff(
  handoffs,
  binding,
  hmacKey,
  now = new Date(),
) {
  if (typeof binding !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(binding)) {
    return null;
  }
  const handoff = await handoffs.findOneAndUpdate(
    {
      bindingHash: digest(hmacKey, "habi-owner-handoff-binding", binding),
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now.toISOString() } },
    { returnDocument: "after" },
  );
  return handoff
    ? Object.freeze({
        handoffId: handoff._id,
        ownerHash: handoff.ownerHash,
      })
    : null;
}

export async function resolveSsoOwnerLink(
  links,
  { issuer, subject, legacyOwnerHash = null, hmacKey, now = new Date() },
) {
  if (
    typeof issuer !== "string" ||
    !issuer ||
    typeof subject !== "string" ||
    !subject
  ) {
    throw new Error("SSO_IDENTITY_REQUIRED");
  }
  const identityHash = digest(
    hmacKey,
    "habi-owner-identity",
    `${issuer}\0${subject}`,
  );
  const existing = await links.findOne({ _id: identityHash });
  if (existing) {
    if (legacyOwnerHash && existing.ownerHash !== legacyOwnerHash) {
      throw new Error("SSO_OWNER_LINK_CONFLICT");
    }
    return Object.freeze({
      ownerHash: existing.ownerHash,
      identityHash,
      linked: false,
    });
  }

  const ownerHash =
    legacyOwnerHash ?? digest(hmacKey, "habi-sso-owner", identityHash);
  const document = {
    _id: identityHash,
    ownerHash,
    linkMethod: legacyOwnerHash ? "verified_legacy_cookie" : "sso_identity",
    linkedAt: now.toISOString(),
  };
  try {
    await links.insertOne(document);
    return Object.freeze({
      ownerHash,
      identityHash,
      linked: Boolean(legacyOwnerHash),
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const raced = await links.findOne({ _id: identityHash });
    if (!raced || (legacyOwnerHash && raced.ownerHash !== legacyOwnerHash)) {
      throw new Error("SSO_OWNER_LINK_CONFLICT");
    }
    return Object.freeze({
      ownerHash: raced.ownerHash,
      identityHash,
      linked: false,
    });
  }
}

export async function createSsoOwnerSession(
  sessions,
  { identityHash, ownerHash, hmacKey, now = new Date() },
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SSO_OWNER_SESSION_MS);
  const session = {
    _id: randomBytes(24).toString("hex"),
    tokenHash: digest(hmacKey, "habi-owner-session", token),
    identityHash,
    ownerHash,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt,
    revokedAt: null,
  };
  await sessions.insertOne(session);
  return Object.freeze({ token, session });
}

export async function readActiveSsoOwnerSession(
  sessions,
  token,
  hmacKey,
  now = new Date(),
) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    return null;
  const tokenHash = digest(hmacKey, "habi-owner-session", token);
  const session = await sessions.findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: now },
    lastSeenAt: {
      $gt: new Date(now.getTime() - SSO_OWNER_SESSION_IDLE_MS).toISOString(),
    },
  });
  if (!session) return null;
  const result = await sessions.updateOne(
    {
      _id: session._id,
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: now },
      lastSeenAt: {
        $gt: new Date(now.getTime() - SSO_OWNER_SESSION_IDLE_MS).toISOString(),
      },
    },
    { $set: { lastSeenAt: now.toISOString() } },
  );
  return result.matchedCount === 1 ? session : null;
}

export async function authenticateSsoOwnerRequest(
  db,
  request,
  { hmacKey, now = new Date() },
) {
  const token = readCookie(
    request.headers.get("cookie"),
    SSO_OWNER_SESSION_COOKIE,
  );
  if (!token) return null;
  return readActiveSsoOwnerSession(
    db.collection("habi_sso_owner_sessions"),
    token,
    hmacKey,
    now,
  );
}

export async function revokeSsoOwnerSession(
  sessions,
  token,
  hmacKey,
  now = new Date(),
) {
  if (typeof token !== "string" || !token) return false;
  const tokenHash = digest(hmacKey, "habi-owner-session", token);
  const result = await sessions.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: now.toISOString() } },
  );
  return result.modifiedCount === 1;
}

export function ssoOwnerSessionCookie(token) {
  return `${SSO_OWNER_SESSION_COOKIE}=${token}; Path=/; Max-Age=${SSO_OWNER_SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
}

export function expiredSsoOwnerSessionCookie() {
  return `${SSO_OWNER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function ssoOwnerHandoffCookie(binding) {
  return `${SSO_OWNER_HANDOFF_COOKIE}=${binding}; Path=/; Max-Age=${SSO_OWNER_HANDOFF_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
}

export function expiredSsoOwnerHandoffCookie() {
  return `${SSO_OWNER_HANDOFF_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
