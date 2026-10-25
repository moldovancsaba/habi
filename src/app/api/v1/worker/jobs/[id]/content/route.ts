import { Readable } from "node:stream";
import { runAuthorizedWorkerRoute } from "../../../../../../../lib/api/worker-route";
import { openWorkerJobContent } from "../../../../../../../lib/workflows/worker-jobs.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/worker/jobs/[id]/content">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedWorkerRoute(
    request,
    "worker.job.content",
    async ({ db, worker }) => {
      const stream = await openWorkerJobContent({ db, worker, id, request });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  );
}
