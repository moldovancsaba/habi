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
      const membershipPlayerIds = [
        ...new Set(
          memberships
            .map((item) => item.playerId)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      const players = membershipPlayerIds.length
        ? await db
            .collection("players")
            .find(
              {
                tenantId: principal.tenantId,
                id: { $in: membershipPlayerIds },
              },
              { projection: { _id: 0, id: 1, actorId: 1, displayName: 1 } },
            )
            .toArray()
        : [];
      const playersById = new Map(players.map((player) => [player.id, player]));
      const availableMemberships = memberships.filter((item) => {
        if (item.playerId === null) return item.role === "coach";
        const player = playersById.get(item.playerId);
        return Boolean(
          player &&
            (item.role !== "player" || player.actorId === principal.actorId),
        );
      });
      const playerIds = [
        ...new Set(
          availableMemberships
            .map((item) => item.playerId)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      const token = readCookie(request, runtimeSessionSettings().cookieName);
      if (!token) throw new HabiApiError("AUTHENTICATION_REQUIRED");
      return Response.json(
        {
          actorId: principal.actorId,
          activeRole: principal.role,
          allowedRoles: [
            ...new Set(availableMemberships.map((item) => item.role)),
          ],
          activeMembershipId:
            availableMemberships.find(
              (item) =>
                item.role === principal.role &&
                item.playerId === principal.playerId,
            )?.id ?? null,
          memberships: availableMemberships.map((item) => ({
            id: item.id,
            role: item.role,
            playerId: item.playerId,
            playerDisplayName:
              typeof item.playerId === "string"
                ? (playersById.get(item.playerId)?.displayName ?? null)
                : null,
          })),
          playerIds,
          accessRevision: principal.accessRevision,
          csrfToken: deriveCsrfToken(token, runtimeSessionSettings().hmacKey),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    },
  );
}
