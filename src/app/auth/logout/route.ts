import { headers } from "next/headers";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { createLogoutHandler } from "@/lib/auth/logout-handler.mjs";

export async function POST(request: Request) {
  await headers();
  return runApiRoute(request, "auth.logout", async () => {
    const hmacKey = process.env.HG_SESSION_HMAC_KEY;
    if (!hmacKey) throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
    const db = await getDatabase();
    return createLogoutHandler({ db, hmacKey })(request);
  });
}
