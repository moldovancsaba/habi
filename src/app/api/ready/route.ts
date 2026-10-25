import { checkDatabaseConnection } from "@/lib/database/mongo";
import { evaluateDatabaseReadiness } from "@/lib/database/readiness.mjs";

export async function GET() {
  const result = await evaluateDatabaseReadiness(checkDatabaseConnection);
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
