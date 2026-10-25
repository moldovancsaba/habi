import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { heartbeatWorkerJob } from "../../../../../../../lib/workflows/worker-jobs.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/worker/jobs/[id]/heartbeat">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedWorkerRoute(
    request,
    "worker.job.heartbeat",
    async ({ db, worker }) =>
      Response.json(await heartbeatWorkerJob({ request, db, worker, id })),
  );
}
