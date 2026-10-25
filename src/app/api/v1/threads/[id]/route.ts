import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { getThread } from "../../../../../lib/workflows/threads.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/threads/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "thread.read",
    async ({ db, principal }) =>
      Response.json(await getThread({ db, principal, id })),
  );
}
