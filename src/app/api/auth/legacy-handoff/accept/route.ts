import { headers } from "next/headers";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { getDatabase } from "@/lib/database/mongo";
import {
  bindLegacyOwnerHandoff,
  ssoOwnerHandoffCookie,
} from "@/lib/auth/browser-sso-session.mjs";

export async function POST(request: Request) {
  await headers();
  return runApiRoute(request, "auth.legacy-handoff.accept", async () => {
    const appOrigin = process.env.HG_APP_ORIGIN;
    const hmacKey = process.env.HG_SESSION_HMAC_KEY;
    if (
      !appOrigin ||
      !hmacKey ||
      request.headers.get("origin") !== appOrigin ||
      request.headers.get("host") !== new URL(appOrigin).host ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json") ||
      Number(request.headers.get("content-length") ?? 0) > 4096
    ) {
      return Response.json({ error: "ORIGIN_REJECTED" }, { status: 403 });
    }
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 4096)
      return Response.json({ error: "HANDOFF_INVALID" }, { status: 400 });
    let body: unknown;
    try {
      body = JSON.parse(text || "null");
    } catch {
      return Response.json({ error: "HANDOFF_INVALID" }, { status: 400 });
    }
    const token =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "token" in body &&
      typeof body.token === "string"
        ? body.token
        : "";
    const binding = await bindLegacyOwnerHandoff(
      (await getDatabase()).collection("habi_sso_owner_handoffs"),
      token,
      hmacKey,
    );
    if (!binding)
      return Response.json({ error: "HANDOFF_INVALID" }, { status: 410 });
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": ssoOwnerHandoffCookie(binding),
      },
    });
  });
}
