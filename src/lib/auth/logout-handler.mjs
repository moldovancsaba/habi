import { HabiApiError } from "../api/error-response.mjs";
import {
  readActiveSession,
  revokeSession,
  verifyCsrfToken,
} from "./session.mjs";
import { revokeSessionSsoCredential } from "./session-sso-credentials.mjs";

export const SESSION_COOKIE = "__Host-hg_session";
export const CSRF_HEADER = "x-habi-csrf";

function cookieValue(request, name) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const equalsAt = part.indexOf("=");
    if (equalsAt < 0 || part.slice(0, equalsAt).trim() !== name) continue;
    return part.slice(equalsAt + 1).trim();
  }
  return null;
}

function expiredCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function createLogoutHandler({ db, hmacKey, now = () => new Date() }) {
  if (!db || typeof hmacKey !== "string") {
    throw new Error("AUTH_LOGOUT_HANDLER_CONFIG_INVALID");
  }

  return async function handleLogout(request) {
    if (request.method !== "POST") throw new HabiApiError("INVALID_INPUT");
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      throw new HabiApiError("ACCESS_DENIED");
    }

    const token = cookieValue(request, SESSION_COOKIE);
    if (token) {
      const sessions = db.collection("sessions");
      const session = await readActiveSession(sessions, token, hmacKey, now());
      if (session) {
        if (
          !verifyCsrfToken(token, request.headers.get(CSRF_HEADER), hmacKey)
        ) {
          throw new HabiApiError("ACCESS_DENIED");
        }
        await revokeSessionSsoCredential(
          db.collection("session_sso_credentials"),
          { sessionId: session.id, now: now() },
        );
        if (!(await revokeSession(sessions, session, now()))) {
          throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
        }
      }
    }

    const response = new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
    response.headers.append("Set-Cookie", expiredCookie(SESSION_COOKIE));
    response.headers.append("Set-Cookie", expiredCookie("__Host-hg_auth_txn"));
    return response;
  };
}
