import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { setThreadState } from "../../../../../../lib/workflows/threads.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/threads/[id]/close">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "thread.close",
    async ({ db, client, principal }) => {
      const result = await setThreadState({
        request,
        client,
        db,
        principal,
        id,
        state: "closed",
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
