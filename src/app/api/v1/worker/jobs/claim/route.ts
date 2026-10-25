import { runAuthorizedWorkerRoute } from "../../../../../../lib/api/worker-route";
import { claimWorkerJob } from "../../../../../../lib/workflows/worker-jobs.mjs";

export async function POST(request: Request): Promise<Response> {
  return runAuthorizedWorkerRoute(
    request,
    "worker.job.claim",
    async ({ db, worker }) => {
      const lease = await claimWorkerJob({
        request,
        db,
        clientId: worker.serviceId,
      });
      return lease ? Response.json(lease) : new Response(null, { status: 204 });
    },
  );
}
