import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { getWorkerJobContext } from "../../../../../../../lib/workflows/worker-jobs.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/worker/jobs/[id]/context">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedWorkerRoute(
    request,
    "worker.job.context",
    async ({ db, worker }) =>
      Response.json(await getWorkerJobContext({ db, worker, id, request })),
  );
}
