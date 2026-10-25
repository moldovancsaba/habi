import { HabiApiError } from "../api/error-response.mjs";
import {
  readActiveSession,
  touchSession,
  verifyCsrfToken,
} from "./session.mjs";
import { revokeSessionSsoCredential } from "./session-sso-credentials.mjs";

const SESSION_COOKIE = "__Host-hg_session";
const CSRF_HEADER = "x-habi-csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function readCookie(request, name) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const equalsAt = part.indexOf("=");
    if (equalsAt < 0 || part.slice(0, equalsAt).trim() !== name) continue;
    return part.slice(equalsAt + 1).trim();
  }
  return null;
}

async function revokeStaleSession(db, session, now) {
  await revokeSessionSsoCredential(db.collection("session_sso_credentials"), {
    sessionId: session.id,
    now,
  });
  await db.collection("sessions").updateOne(
    { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
    {
      $set: { revokedAt: now.toISOString(), updatedAt: now.toISOString() },
      $inc: { revision: 1 },
    },
  );
}

export async function authenticateHabiRequest(
  db,
  request,
  {
    hmacKey,
    now = new Date(),
    cookieName = SESSION_COOKIE,
    expectedOrigin = new URL(request.url).origin,
  } = {},
) {
  if (!db || typeof request?.url !== "string" || typeof hmacKey !== "string") {
    throw new Error("AUTH_SESSION_GUARD_CONFIG_INVALID");
  }

  const token = readCookie(request, cookieName);
  if (!token) throw new HabiApiError("AUTHENTICATION_REQUIRED");
  const sessions = db.collection("sessions");
  const session = await readActiveSession(sessions, token, hmacKey, now);
  if (!session) throw new HabiApiError("AUTHENTICATION_REQUIRED");

  const method = request.method.toUpperCase();
  if (!SAFE_METHODS.has(method)) {
    const origin = request.headers.get("origin");
    if (
      origin !== expectedOrigin ||
      !verifyCsrfToken(token, request.headers.get(CSRF_HEADER), hmacKey)
    ) {
      throw new HabiApiError("ACCESS_DENIED");
    }
  }

  const actor = await db.collection("actors").findOne({ id: session.actorId });
  if (
    actor?.status !== "active" ||
    actor.accessRevision !== session.accessRevision
  ) {
    await revokeStaleSession(db, session, now);
    throw new HabiApiError("AUTHENTICATION_REQUIRED");
  }

  const nowIso = now.toISOString();
  const membership = await db.collection("memberships").findOne({
    actorId: session.actorId,
    tenantId: session.tenantId,
    retentionPolicyId: session.retentionPolicyId,
    role: session.activeRole,
    playerId: session.playerId,
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: nowIso } }],
  });
  const tenant = await db.collection("tenants").findOne({
    id: session.tenantId,
    tenantId: session.tenantId,
    status: "active",
  });
  let playerIsValid = session.playerId === null;
  if (session.playerId !== null) {
    const player = await db.collection("players").findOne({
      id: session.playerId,
      tenantId: session.tenantId,
    });
    playerIsValid = Boolean(
      player &&
        (session.activeRole !== "player" || player.actorId === session.actorId),
    );
  }
  if (!membership || !tenant || !playerIsValid) {
    await revokeStaleSession(db, session, now);
    throw new HabiApiError("AUTHENTICATION_REQUIRED");
  }

  if (!(await touchSession(sessions, session, now))) {
    throw new HabiApiError("AUTHENTICATION_REQUIRED");
  }
  return Object.freeze({
    sessionId: session.id,
    actorId: session.actorId,
    tenantId: session.tenantId,
    retentionPolicyId: session.retentionPolicyId,
    role: session.activeRole,
    playerId: session.playerId,
    accessRevision: session.accessRevision,
  });
}
