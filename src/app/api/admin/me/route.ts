import { headers } from "next/headers";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { authenticateSsoOwnerRequest } from "@/lib/auth/browser-sso-session.mjs";
import { hasAdminPermission } from "@/lib/auth/admin-permission.mjs";

export async function GET(request: Request): Promise<Response> {
  await headers();
  return runApiRoute(request, "admin.me", async () => {
    const hmacKey = process.env.HG_SESSION_HMAC_KEY ?? "";
    const db = await getDatabase();
    const session = await authenticateSsoOwnerRequest(db, request, { hmacKey });
    if (!session) throw new HabiApiError("AUTHENTICATION_REQUIRED");
    if (!hasAdminPermission(request, session, hmacKey)) {
      throw new HabiApiError("ACCESS_DENIED");
    }
    const tenantId = process.env.HG_TENANT_ID ?? "habi";
    const identity = await db
      .collection("identities")
      .findOne(
        { issuer: session.issuer, subject: session.subject },
        { projection: { _id: 0, actorId: 1 } },
      );
    const ownMemberships = identity?.actorId
      ? await db
          .collection("memberships")
          .find({ tenantId, actorId: identity.actorId, status: "active" })
          .sort({ role: 1, playerId: 1 })
          .limit(100)
          .toArray()
      : [];
    const playerIds = ownMemberships
      .map((membership) => membership.playerId)
      .filter((playerId): playerId is string => typeof playerId === "string");
    const players = playerIds.length
      ? await db
          .collection("players")
          .find(
            { tenantId, id: { $in: playerIds } },
            { projection: { _id: 0, id: 1, displayName: 1 } },
          )
          .toArray()
      : [];
    const playerNames = new Map(
      players.map((player) => [player.id, player.displayName ?? null]),
    );
    return Response.json(
      {
        permission: "admin",
        memberships: ownMemberships.map((membership) => ({
          id: membership.id,
          role: membership.role,
          playerId: membership.playerId,
          playerDisplayName: membership.playerId
            ? (playerNames.get(membership.playerId) ?? null)
            : null,
        })),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        },
      },
    );
  });
}
