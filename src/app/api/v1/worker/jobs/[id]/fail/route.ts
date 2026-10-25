import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { deferWorkerJob } from "../../../../../../../lib/workflows/worker-jobs.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/worker/jobs/[id]/fail">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedWorkerRoute(
    request,
    "worker.job.fail",
    async ({ db, client, worker }) =>
      Response.json(
        await deferWorkerJob({
          request,
          client,
          db,
          worker,
          id,
          terminal: true,
        }),
      ),
  );
}
