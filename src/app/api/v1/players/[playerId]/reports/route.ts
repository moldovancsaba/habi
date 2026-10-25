import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { listReports } from "../../../../../../lib/workflows/reports.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/reports">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "report.list",
    async ({ db, principal }) => {
      const result = await listReports({
        db,
        principal,
        playerId,
        limit: Number(new URL(request.url).searchParams.get("limit") ?? 50),
      });
      return Response.json(result);
    },
  );
}
