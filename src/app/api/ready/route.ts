import { headers } from "next/headers";
import { checkDatabaseConnection } from "@/lib/database/mongo";
import { evaluateDatabaseReadiness } from "@/lib/database/readiness.mjs";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";

export async function GET(request: Request) {
  // Keep database probes request-time only; never run them during prerender.
  await headers();
  return runApiRoute(request, "api.ready", async () => {
    const result = await evaluateDatabaseReadiness(checkDatabaseConnection);
    return Response.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  });
}
