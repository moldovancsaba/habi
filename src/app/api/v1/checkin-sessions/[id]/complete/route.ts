import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { completeCheckin } from "../../../../../../lib/workflows/checkin.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/checkin-sessions/[id]/complete">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "checkin.session.complete",
    async ({ db, client, principal }) => {
      const result = await completeCheckin({
        request,
        db,
        client,
        principal,
        id,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
