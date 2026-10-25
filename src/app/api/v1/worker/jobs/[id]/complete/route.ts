import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { completeWorkerJob } from "../../../../../../../lib/workflows/worker-jobs.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/worker/jobs/[id]/complete">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedWorkerRoute(
    request,
    "worker.job.complete",
    async ({ db, client, worker }) =>
      Response.json(
        await completeWorkerJob({ request, db, client, worker, id }),
      ),
  );
}
