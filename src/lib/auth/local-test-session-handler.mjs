import { HabiApiError } from "../api/error-response.mjs";
import { runApiRoute } from "../api/route-boundary.mjs";
import { validateRuntimeConfig } from "../runtime-config.mjs";
import {
  deriveCsrfToken,
  issueSession,
  readActiveSession,
  revokeSession,
} from "./session.mjs";
import {
  clearedTestSessionCookie,
  findSyntheticTestIdentity,
  localTestHmacKey,
  LOCAL_TEST_SESSION_COOKIE,
  requireLocalSyntheticTestRequest,
  sessionCookie,
} from "./local-test-auth.mjs";

const noStore = { "Cache-Control": "no-store" };

function cookieValue(request, name) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function unavailable() {
  return Response.json(
    { code: "NOT_FOUND" },
    { status: 404, headers: noStore },
  );
}

export function createLocalTestSessionHandler({
  db,
  now = () => new Date(),
  env = process.env,
}) {
  return (request) =>
    runApiRoute(request, "local-test-session.create", async () => {
      if (
        request.method !== "POST" ||
        !requireLocalSyntheticTestRequest(request, env)
      ) {
        return unavailable();
      }
      let input;
      try {
        input = await request.json();
      } catch {
        throw new HabiApiError("INVALID_INPUT");
      }
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).sort().join("|") !== "actorId" ||
        typeof input.actorId !== "string"
      ) {
        throw new HabiApiError("INVALID_INPUT");
      }
      const identity = findSyntheticTestIdentity(input.actorId);
      if (!identity) throw new HabiApiError("ACCESS_DENIED");
      const actor = await db
        .collection("actors")
        .findOne({ id: identity.id, status: "active" });
      const membership = await db.collection("memberships").findOne({
        actorId: identity.id,
        tenantId: identity.tenantId,
        playerId: identity.playerId,
        role: identity.role,
        status: "active",
      });
      if (!actor || !membership) throw new HabiApiError("ACCESS_DENIED");
      const issued = await issueSession(db.collection("sessions"), {
        actorId: actor.id,
        tenantId: membership.tenantId,
        retentionPolicyId: membership.retentionPolicyId,
        activeRole: membership.role,
        playerId: membership.playerId,
        accessRevision: actor.accessRevision,
        hmacKey: localTestHmacKey(),
        now: now(),
      });
      return Response.json(
        {
          actorId: actor.id,
          role: membership.role,
          playerId: membership.playerId,
          csrfToken: issued.csrfToken,
        },
        {
          status: 201,
          headers: { ...noStore, "Set-Cookie": sessionCookie(issued.token) },
        },
      );
    });
}

export function createLocalTestLogoutHandler({
  db,
  now = () => new Date(),
  env = process.env,
}) {
  return (request) =>
    runApiRoute(request, "local-test-session.delete", async () => {
      if (
        request.method !== "DELETE" ||
        !requireLocalSyntheticTestRequest(request, env)
      ) {
        return unavailable();
      }
      const rawToken = cookieValue(request, LOCAL_TEST_SESSION_COOKIE);
      if (rawToken) {
        const session = await readActiveSession(
          db.collection("sessions"),
          rawToken,
          localTestHmacKey(),
          now(),
        );
        if (session)
          await revokeSession(db.collection("sessions"), session, now());
      }
      return new Response(null, {
        status: 204,
        headers: { ...noStore, "Set-Cookie": clearedTestSessionCookie() },
      });
    });
}

export function localTestModeEnabled(env = process.env) {
  try {
    return validateRuntimeConfig(env).localTestMode === true;
  } catch {
    return false;
  }
}

export { deriveCsrfToken };
