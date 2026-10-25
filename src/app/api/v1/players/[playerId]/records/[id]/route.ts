import { runAuthorizedHabiRoute } from "../../../../../../../lib/api/runtime-route";
import { getRecord } from "../../../../../../../lib/workflows/records.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/records/[id]">,
): Promise<Response> {
  const { playerId, id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "record.read",
    async ({ db, principal }) => {
      const body = await getRecord({ db, principal, playerId, id });
      return Response.json(body);
    },
  );
}
