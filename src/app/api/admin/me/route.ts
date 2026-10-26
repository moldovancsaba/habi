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
    return Response.json(
      { permission: "admin" },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        },
      },
    );
  });
}
import { headers } from "next/headers";
