import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readCookie } from "./browser-sso-session.mjs";

export const HABI_ADMIN_COOKIE = "__Host-habi_admin";

function signature(payload, key) {
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") < 32) {
    throw new Error("SESSION_HMAC_KEY_INVALID");
  }
  return createHmac("sha256", key)
    .update(`habi-admin:${payload}`, "utf8")
    .digest("base64url");
}

export function createAdminPermissionToken(session, permissionRole, hmacKey) {
  if (
    permissionRole !== "admin" ||
    typeof session?._id !== "string" ||
    typeof session?.identityHash !== "string" ||
    !(session.expiresAt instanceof Date)
  ) {
    return null;
  }
  const payload = Buffer.from(
    JSON.stringify({
      sessionId: session._id,
      identityHash: session.identityHash,
      permission: "admin",
      expiresAt: Math.floor(session.expiresAt.getTime() / 1000),
      nonce: randomBytes(12).toString("base64url"),
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload, hmacKey)}`;
}

export function verifyAdminPermissionToken(
  token,
  session,
  hmacKey,
  now = new Date(),
) {
  if (typeof token !== "string" || token.length > 2048) return false;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return false;
  let expected;
  try {
    expected = signature(payload, hmacKey);
  } catch {
    return false;
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(suppliedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return false;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  return (
    claims &&
    Object.keys(claims).sort().join(",") ===
      "expiresAt,identityHash,nonce,permission,sessionId" &&
    claims.permission === "admin" &&
    claims.sessionId === session?._id &&
    claims.identityHash === session?.identityHash &&
    Number.isSafeInteger(claims.expiresAt) &&
    claims.expiresAt > Math.floor(now.getTime() / 1000) &&
    /^[a-f0-9]{48}$/.test(claims.sessionId) &&
    /^[a-f0-9]{64}$/.test(claims.identityHash) &&
    /^[A-Za-z0-9_-]{16}$/.test(claims.nonce)
  );
}

export function hasAdminPermission(request, session, hmacKey, now) {
  return verifyAdminPermissionToken(
    readCookie(request.headers.get("cookie"), HABI_ADMIN_COOKIE),
    session,
    hmacKey,
    now,
  );
}

export function adminPermissionCookie(token, maxAgeSeconds = 8 * 60 * 60) {
  return `${HABI_ADMIN_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function expiredAdminPermissionCookie() {
  return `${HABI_ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
