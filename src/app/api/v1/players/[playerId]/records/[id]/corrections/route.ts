import { runAuthorizedHabiRoute } from "@/lib/api/runtime-route";
import { correctRecord } from "@/lib/workflows/record-corrections.mjs";
import { runMigrations } from "@/lib/database/migrations/runner.mjs";
export async function POST(
  request: Request,
  context: { params: Promise<{ playerId: string; id: string }> },
) {
  const { playerId, id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "record.correction",
    async (runtime) => {
      await runMigrations(runtime.db, new Date(), [
        "021-record-correction-lineage",
      ]);
      const result = await correctRecord({ ...runtime, request, playerId, id });
      return Response.json(result.body, { status: result.status });
    },
  );
}
