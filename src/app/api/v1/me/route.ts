import { HabiApiError } from "../../../../lib/api/error-response.mjs";
import { runAuthorizedHabiRoute } from "../../../../lib/api/runtime-route";
import { runtimeSessionSettings } from "../../../../lib/auth/runtime-auth.mjs";
import { deriveCsrfToken } from "../../../../lib/auth/session.mjs";

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const equalsAt = part.indexOf("=");
    if (equalsAt < 0 || part.slice(0, equalsAt).trim() !== name) continue;
    return part.slice(equalsAt + 1).trim();
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return runAuthorizedHabiRoute(
    request,
    "me.read",
    async ({ db, principal }) => {
      if (url.search) throw new HabiApiError("INVALID_INPUT");
      const memberships = await db
        .collection("memberships")
        .find({
          actorId: principal.actorId,
          tenantId: principal.tenantId,
          status: "active",
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date().toISOString() } },
          ],
        })
        .toArray();
      const token = readCookie(request, runtimeSessionSettings().cookieName);
      if (!token) throw new HabiApiError("AUTHENTICATION_REQUIRED");
      return Response.json(
        {
          actorId: principal.actorId,
          activeRole: principal.role,
          allowedRoles: [...new Set(memberships.map((item) => item.role))],
          playerIds: [
            ...new Set(
              memberships
                .map((item) => item.playerId)
                .filter((id): id is string => typeof id === "string"),
            ),
          ],
          accessRevision: principal.accessRevision,
          csrfToken: deriveCsrfToken(token, runtimeSessionSettings().hmacKey),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    },
  );
}
