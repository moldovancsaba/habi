import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { getWorkerJobContext } from "../../../../../../../lib/workflows/worker-jobs.mjs";

// These routes read the player's records one collection at a time, which is many
// database round trips; allow more than the platform default instead of being cut off.
export const maxDuration = 30;

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
