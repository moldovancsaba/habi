import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { cancelWorkerJob } from "../../../../../../../lib/workflows/worker-jobs.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/worker/jobs/[id]/cancel">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedWorkerRoute(
    request,
    "worker.job.cancel",
    async ({ db, client, worker }) =>
      Response.json(await cancelWorkerJob({ request, client, db, worker, id })),
  );
}
