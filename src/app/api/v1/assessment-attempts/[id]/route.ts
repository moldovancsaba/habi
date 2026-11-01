import { runAuthorizedHabiRoute } from "@/lib/api/runtime-route";
import { readAssessmentAttempt } from "@/lib/workflows/assessment-attempts.mjs";
import { runMigrations } from "@/lib/database/migrations/runner.mjs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "assessment.[id].get",
    async (runtime) => {
      await runMigrations(runtime.db, new Date(), [
        "020-durable-assessment-attempts",
      ]);
      const result = await readAssessmentAttempt({ ...runtime, id });
      return Response.json(result);
    },
  );
}
