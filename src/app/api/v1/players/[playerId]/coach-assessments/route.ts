import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { createCoachAssessment } from "../../../../../../lib/workflows/coach-assessments.mjs";
export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/coach-assessments">,
) {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "coach-assessment.create",
    async ({ db, client, principal }) => {
      const result = await createCoachAssessment({
        request,
        db,
        client,
        principal,
        playerId,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
