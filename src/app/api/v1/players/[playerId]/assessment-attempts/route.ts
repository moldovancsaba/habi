import { runAuthorizedHabiRoute } from "@/lib/api/runtime-route";
import {
  writeAssessmentAttempt,
  listAssessmentAttempts,
} from "@/lib/workflows/assessment-attempts.mjs";
import { runMigrations } from "@/lib/database/migrations/runner.mjs";
export async function POST(
  request: Request,
  context: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "assessment.start.post",
    async (runtime) => {
      await runMigrations(runtime.db, new Date(), [
        "020-durable-assessment-attempts",
      ]);
      const result = await writeAssessmentAttempt({
        ...runtime,
        request,
        playerId,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "assessment.start.get",
    async (runtime) => {
      await runMigrations(runtime.db, new Date(), [
        "020-durable-assessment-attempts",
      ]);
      const result = await listAssessmentAttempts({ ...runtime, playerId });
      return Response.json(result);
    },
  );
}
