import { headers } from "next/headers";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { createLoginHandler } from "@/lib/auth/login-handler.mjs";

export async function GET(request: Request) {
  await headers();
  return runApiRoute(request, "auth.login", async () => {
    const issuer = process.env.HG_SSO_ISSUER;
    const clientId = process.env.HG_SSO_CLIENT_ID;
    const redirectUri = process.env.HG_SSO_REDIRECT_URI;
    if (!issuer || !clientId || !redirectUri) {
      throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
    }
    const db = await getDatabase();
    return createLoginHandler({
      db,
      config: { issuer, clientId, redirectUri },
    })(request);
  });
}
