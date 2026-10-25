import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { readCheckinSession } from "../../../../../lib/workflows/checkin.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/checkin-sessions/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "checkin.session.read",
    async ({ db, principal }) => {
      return Response.json(await readCheckinSession({ db, principal, id }));
    },
  );
}
