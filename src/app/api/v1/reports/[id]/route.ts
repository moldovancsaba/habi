import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { getReport } from "../../../../../lib/workflows/reports.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/reports/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "report.read",
    async ({ db, principal }) =>
      Response.json(await getReport({ db, principal, id })),
  );
}
