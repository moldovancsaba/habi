import { headers } from "next/headers";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { createLogoutHandler } from "@/lib/auth/logout-handler.mjs";
import {
  expiredSsoOwnerSessionCookie,
  readCookie,
  revokeSsoOwnerSession,
  SSO_OWNER_SESSION_COOKIE,
} from "@/lib/auth/browser-sso-session.mjs";

function expiredCookie(name: string) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function POST(request: Request) {
  await headers();
  return runApiRoute(request, "auth.logout", async () => {
    if (process.env.HG_MVP_MODE !== "sso-browser") {
      const hmacKey = process.env.HG_SESSION_HMAC_KEY;
      if (!hmacKey) throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
      return createLogoutHandler({
        db: await getDatabase(),
        hmacKey,
      })(request);
    }

    const expectedOrigin = process.env.HG_APP_ORIGIN;
    if (
      !expectedOrigin ||
      request.headers.get("origin") !== expectedOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      throw new HabiApiError("ACCESS_DENIED");
    }
    const token = readCookie(
      request.headers.get("cookie"),
      SSO_OWNER_SESSION_COOKIE,
    );
    if (token) {
      await revokeSsoOwnerSession(
        (await getDatabase()).collection("habi_sso_owner_sessions"),
        token,
        process.env.HG_SESSION_HMAC_KEY ?? "",
      );
    }
    const response = new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
    response.headers.append("Set-Cookie", expiredSsoOwnerSessionCookie());
    response.headers.append("Set-Cookie", expiredCookie("__Host-habi-session"));
    response.headers.append("Set-Cookie", expiredCookie("__Host-hg_auth_txn"));
    return response;
  });
}
