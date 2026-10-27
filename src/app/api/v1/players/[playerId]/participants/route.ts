import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { listPlanParticipants } from "../../../../../../lib/workflows/participants.mjs";
export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/participants">,
) {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "participant.list",
    async ({ db, principal }) =>
      Response.json(await listPlanParticipants({ db, principal, playerId })),
  );
}
