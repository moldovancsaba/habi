import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { transitionPlan } from "../../../../../../lib/workflows/plans.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/plans/[id]/state">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "plan.transition",
    async ({ db, client, principal }) => {
      const result = await transitionPlan({
        request,
        client,
        db,
        principal,
        id,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
