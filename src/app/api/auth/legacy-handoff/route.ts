import { headers } from "next/headers";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { legacyOwnerSession } from "@/lib/legacy-mvp/store.mjs";
import { createLegacyOwnerHandoff } from "@/lib/auth/browser-sso-session.mjs";

export async function GET(request: Request) {
  await headers();
  return runApiRoute(request, "auth.legacy-handoff", async () => {
    const legacyOrigin = process.env.HG_LEGACY_APP_ORIGIN;
    const appOrigin = process.env.HG_APP_ORIGIN;
    const hmacKey = process.env.HG_SESSION_HMAC_KEY;
    const host = request.headers.get("host");
    const expectedHost = legacyOrigin ? new URL(legacyOrigin).host : "";
    const session = legacyOwnerSession(request.headers.get("cookie") ?? "");
    if (
      !legacyOrigin ||
      !appOrigin ||
      !hmacKey ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      host !== expectedHost ||
      !session.existing
    ) {
      return new Response("Existing Habi session required", {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    const { token } = await createLegacyOwnerHandoff(
      (await getDatabase()).collection("habi_sso_owner_handoffs"),
      { ownerHash: session.owner, hmacKey },
    );
    const destination = new URL("/", appOrigin);
    destination.hash = new URLSearchParams({ legacyHandoff: token }).toString();
    return new Response(null, {
      status: 303,
      headers: {
        Location: destination.toString(),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  });
}
