import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { getFollowUp } from "../../../../../lib/workflows/plans.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/follow-ups/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "followup.read",
    async ({ db, principal }) =>
      Response.json(await getFollowUp({ db, principal, id })),
  );
}
