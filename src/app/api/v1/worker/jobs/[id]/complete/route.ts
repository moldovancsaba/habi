import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { completeWorkerJob } from "../../../../../../../lib/workflows/worker-jobs.mjs";

// These routes read the player's records one collection at a time, which is many
// database round trips; allow more than the platform default instead of being cut off.
export const maxDuration = 30;

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
