import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { decidePlan } from "../../../../../../lib/workflows/plans.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/plans/[id]/acceptance">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "plan.decide",
    async ({ db, client, principal }) => {
      const result = await decidePlan({ request, client, db, principal, id });
      return Response.json(result.body, { status: result.status });
    },
  );
}
