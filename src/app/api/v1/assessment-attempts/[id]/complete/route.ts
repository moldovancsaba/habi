import { runAuthorizedHabiRoute } from "@/lib/api/runtime-route";
import { writeAssessmentAttempt } from "@/lib/workflows/assessment-attempts.mjs";
import { runMigrations } from "@/lib/database/migrations/runner.mjs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "assessment.complete.post",
    async (runtime) => {
      await runMigrations(runtime.db, new Date(), [
        "020-durable-assessment-attempts",
      ]);
      const result = await writeAssessmentAttempt({
        ...runtime,
        request,
        id,
        action: "complete",
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
