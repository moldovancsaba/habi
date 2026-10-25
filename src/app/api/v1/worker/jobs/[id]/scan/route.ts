import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { completeWorkerUploadScan } from "../../../../../../../lib/workflows/worker-jobs.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/worker/jobs/[id]/scan">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedWorkerRoute(
    request,
    "worker.job.scan",
    async ({ db, client, worker }) =>
      Response.json(
        await completeWorkerUploadScan({ request, db, client, worker, id }),
      ),
  );
}
