import { headers } from "next/headers";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";

export async function GET(request: Request) {
  // Let Next.js observe its request-time dynamic signal before our API
  // boundary catches application errors.
  await headers();
  return runApiRoute(request, "api.health", async () => {
    return Response.json(
      { ok: true, service: "habi" },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
