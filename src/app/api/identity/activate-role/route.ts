import { headers } from "next/headers";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { authenticateSsoOwnerRequest } from "@/lib/auth/browser-sso-session.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { issueSession, SESSION_ABSOLUTE_MS } from "@/lib/auth/session.mjs";

type ActivationBody = { membershipId: string };

function sessionCookie(token: string) {
  return `__Host-hg_session=${token}; Path=/; Max-Age=${SESSION_ABSOLUTE_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
}

export async function POST(request: Request): Promise<Response> {
  await headers();
  return runApiRoute(request, "identity.activate-role", async () => {
    const origin = process.env.HG_APP_ORIGIN;
    if (
      !origin ||
      request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      throw new HabiApiError("ACCESS_DENIED");
    }
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 2048)
      throw new HabiApiError("INVALID_INPUT");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HabiApiError("INVALID_INPUT");
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).join(",") !== "membershipId" ||
      typeof (body as ActivationBody).membershipId !== "string" ||
      !/^[a-f0-9]{48}$/.test((body as ActivationBody).membershipId)
    ) {
      throw new HabiApiError("INVALID_INPUT");
    }

    const hmacKey = process.env.HG_SESSION_HMAC_KEY ?? "";
    const db = await getDatabase();
    const sso = await authenticateSsoOwnerRequest(db, request, { hmacKey });
    if (!sso) throw new HabiApiError("AUTHENTICATION_REQUIRED");
    if (
      typeof sso.issuer !== "string" ||
      typeof sso.subject !== "string" ||
      !["user", "admin"].includes(sso.permissionRole ?? "")
    ) {
      throw new HabiApiError("ACCESS_DENIED");
    }

    const tenantId = process.env.HG_TENANT_ID ?? "habi";
    const identity = await db.collection("identities").findOne({
      issuer: sso.issuer,
      subject: sso.subject,
    });
    if (!identity) throw new HabiApiError("NOT_FOUND");
    const actor = await db.collection("actors").findOne({
      id: identity.actorId,
      identityId: identity.id,
      status: "active",
    });
    if (!actor || !Number.isSafeInteger(actor.accessRevision))
      throw new HabiApiError("ACCESS_DENIED");

    const [tenant, membership] = await Promise.all([
      db.collection("tenants").findOne({
        id: tenantId,
        tenantId,
        status: "active",
      }),
      db.collection("memberships").findOne({
        id: (body as ActivationBody).membershipId,
        tenantId,
        actorId: actor.id,
        status: "active",
      }),
    ]);
    if (!tenant || !membership) throw new HabiApiError("NOT_FOUND");
    if (!["player", "parent", "coach"].includes(membership.role))
      throw new HabiApiError("ACCESS_DENIED");

    if (membership.role === "coach") {
      if (membership.playerId !== null) throw new HabiApiError("ACCESS_DENIED");
    } else {
      if (typeof membership.playerId !== "string")
        throw new HabiApiError("NOT_FOUND");
      const player = await db.collection("players").findOne({
        id: membership.playerId,
        tenantId,
        ...(membership.role === "player" ? { actorId: actor.id } : {}),
      });
      if (!player) throw new HabiApiError("NOT_FOUND");
    }

    const issued = await issueSession(db.collection("sessions"), {
      actorId: actor.id,
      tenantId,
      retentionPolicyId: membership.retentionPolicyId,
      activeRole: membership.role,
      playerId: membership.playerId,
      accessRevision: actor.accessRevision,
      hmacKey,
    });
    return Response.json(
      {
        role: issued.document.activeRole,
        playerId: issued.document.playerId,
        csrfToken: issued.csrfToken,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
          "Set-Cookie": sessionCookie(issued.token),
        },
      },
    );
  });
}
