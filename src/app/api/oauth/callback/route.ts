import { headers } from "next/headers";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { runMigrations } from "@/lib/database/migrations/runner.mjs";
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
    const db = await getDatabase();
    return createSsoBrowserCallbackHandler({
      db,
      config: { issuer, clientId, clientSecret, redirectUri },
      hmacKey,
      prepareSession: async () => {
        await runMigrations(db, new Date(), [
          "010-sso-browser-owner-sessions",
          "011-role-invitations",
          "012-player-display-names",
        ]);
      },
      onFailure: (reasonCode: string) =>
        console.warn(
          JSON.stringify({
            event: "habi.sso.callback_failure",
            requestId: request.headers.get("x-vercel-id"),
            reasonCode,
          }),
        ),
      onInternalError: (stage: string, error: unknown) => {
        const kind =
          error instanceof Error && error.name === "MongoServerError"
            ? "database_rejected_operation"
            : error instanceof Error && error.name === "MongoNetworkError"
              ? "database_unavailable"
              : error instanceof Error &&
                  error.message === "DEPENDENCY_UNAVAILABLE"
                ? "database_unavailable"
                : "unexpected_internal_error";
        console.error(
          JSON.stringify({
            event: "habi.sso.callback_internal_error",
            requestId: request.headers.get("x-vercel-id"),
            stage,
            kind,
          }),
        );
      },
    })(request);
  });
}
