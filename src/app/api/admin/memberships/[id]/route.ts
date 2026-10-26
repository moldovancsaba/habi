import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { authenticateSsoOwnerRequest } from "@/lib/auth/browser-sso-session.mjs";
import { hasAdminPermission } from "@/lib/auth/admin-permission.mjs";

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/admin/memberships/[id]">,
): Promise<Response> {
  return runApiRoute(request, "admin.memberships", async () => {
    const expectedOrigin = process.env.HG_APP_ORIGIN;
    if (
      !expectedOrigin ||
      request.headers.get("origin") !== expectedOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      throw new HabiApiError("ACCESS_DENIED");
    }
    const { id } = await context.params;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))
      throw new HabiApiError("INVALID_INPUT");
    const hmacKey = process.env.HG_SESSION_HMAC_KEY ?? "";
    const db = await getDatabase();
    const ssoSession = await authenticateSsoOwnerRequest(db, request, {
      hmacKey,
    });
    if (!ssoSession) throw new HabiApiError("AUTHENTICATION_REQUIRED");
    if (!hasAdminPermission(request, ssoSession, hmacKey))
      throw new HabiApiError("ACCESS_DENIED");

    const membership = await db.collection("memberships").findOne({
      id,
      status: "active",
    });
    if (!membership) throw new HabiApiError("NOT_FOUND");
    const now = new Date().toISOString();
    const result = await db.collection("memberships").updateOne(
      { id, tenantId: membership.tenantId, status: "active" },
      {
        $set: { status: "revoked", updatedAt: now },
        $inc: { revision: 1 },
      },
    );
    if (result.modifiedCount !== 1) throw new HabiApiError("CONFLICT");
    await db.collection("actors").updateOne(
      { id: membership.actorId, status: "active" },
      {
        $set: { updatedAt: now },
        $inc: { accessRevision: 1, revision: 1 },
      },
    );
    return Response.json(
      { revoked: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
