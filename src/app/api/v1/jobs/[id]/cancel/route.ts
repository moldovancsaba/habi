import { runAuthorizedHabiRoute } from "@/lib/api/runtime-route";
import { cancelJob } from "@/lib/workflows/job-cancellation.mjs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(request, "job.cancel", async (runtime) => {
    const result = await cancelJob({ ...runtime, request, id });
    return Response.json(result.body, { status: result.status });
  });
}
