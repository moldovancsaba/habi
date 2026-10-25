import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { deferWorkerJob } from "../../../../../../../lib/workflows/worker-jobs.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/worker/jobs/[id]/defer">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedWorkerRoute(
    request,
    "worker.job.defer",
    async ({ db, client, worker }) =>
      Response.json(await deferWorkerJob({ request, db, client, worker, id })),
  );
}
