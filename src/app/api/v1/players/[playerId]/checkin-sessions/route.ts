import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { createCheckinSession } from "../../../../../../lib/workflows/checkin.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/checkin-sessions">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "checkin.session.create",
    async ({ db, client, principal }) => {
      const result = await createCheckinSession({
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
