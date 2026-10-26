import { headers } from "next/headers";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { createSsoBrowserCallbackHandler } from "@/lib/auth/sso-browser-callback.mjs";

export async function GET(request: Request) {
  await headers();
  return runApiRoute(request, "auth.callback", async () => {
    const {
      HG_SSO_ISSUER: issuer,
      HG_SSO_CLIENT_ID: clientId,
      HG_SSO_CLIENT_SECRET: clientSecret,
      HG_SSO_REDIRECT_URI: redirectUri,
      HG_SESSION_HMAC_KEY: hmacKey,
    } = process.env;
    if (!issuer || !clientId || !clientSecret || !redirectUri || !hmacKey) {
      throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
    }
    return createSsoBrowserCallbackHandler({
      db: await getDatabase(),
      config: { issuer, clientId, clientSecret, redirectUri },
      hmacKey,
    })(request);
  });
}
