import { headers } from "next/headers";
import { HabiApiError } from "../../../../lib/api/error-response.mjs";
import { runAuthorizedHabiRoute } from "../../../../lib/api/runtime-route";

export async function GET(request: Request): Promise<Response> {
  await headers();
  return runAuthorizedHabiRoute(
    request,
    "player.list",
    async ({ db, principal }) => {
      const url = new URL(request.url);
      for (const key of url.searchParams.keys()) {
        if (key !== "limit") throw new HabiApiError("INVALID_INPUT");
      }
      const limit = Number(url.searchParams.get("limit") ?? 100);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new HabiApiError("INVALID_INPUT");
      }
      const filter =
        principal.role === "coach"
          ? { tenantId: principal.tenantId }
          : principal.playerId
            ? { tenantId: principal.tenantId, id: principal.playerId }
            : null;
      if (!filter) throw new HabiApiError("NOT_FOUND");
      const players = await db
        .collection("players")
        .find(filter, {
          projection: {
            _id: 0,
            id: 1,
            revision: 1,
            displayName: 1,
            registeredAt: 1,
            timeZone: 1,
          },
        })
        .sort({ id: 1 })
        .limit(limit + 1)
        .toArray();
      if (players.length > limit) throw new HabiApiError("INVALID_INPUT");
      const snapshotAt = new Date().toISOString();
      return Response.json({
        items: players.map((player) => ({
          id: player.id,
          revision: player.revision,
          displayName:
            typeof player.displayName === "string" ? player.displayName : null,
          profileState:
            typeof player.displayName === "string" ? "named" : "name_missing",
          registeredAt: player.registeredAt,
          timeZone: player.timeZone,
        })),
        nextCursor: null,
        snapshotAt,
        accessRevision: principal.accessRevision,
      });
    },
  );
}
