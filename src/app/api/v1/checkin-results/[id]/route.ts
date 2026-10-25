import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { readCheckinResult } from "../../../../../lib/workflows/checkin.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/checkin-results/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "checkin.result.read",
    async ({ db, principal }) => {
      return Response.json(await readCheckinResult({ db, principal, id }));
    },
  );
}
