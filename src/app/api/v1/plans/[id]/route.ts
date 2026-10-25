import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { getPlan } from "../../../../../lib/workflows/plans.mjs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/plans/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    _request,
    "plan.read",
    async ({ db, principal }) =>
      Response.json(await getPlan({ db, principal, id })),
  );
}
