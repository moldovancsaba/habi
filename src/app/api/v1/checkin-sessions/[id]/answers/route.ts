import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { saveCheckinAnswer } from "../../../../../../lib/workflows/checkin.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/checkin-sessions/[id]/answers">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "checkin.answer.create",
    async ({ db, client, principal }) => {
      const result = await saveCheckinAnswer({
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
