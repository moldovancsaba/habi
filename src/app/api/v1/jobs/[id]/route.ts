import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { getJobStatus } from "../../../../../lib/workflows/interpretations.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/jobs/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "job.status",
    async ({ db, principal }) =>
      Response.json(await getJobStatus({ db, principal, id })),
  );
}
