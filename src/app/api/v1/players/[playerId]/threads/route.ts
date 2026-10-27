import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import {
  listThreads,
  createThread,
} from "../../../../../../lib/workflows/threads.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/threads">,
) {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "thread.create",
    async ({ db, client, principal }) => {
      const result = await createThread({
        request,
        db,
        client,
        principal,
        playerId,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/threads">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "thread.list",
    async ({ db, principal, cursorHmacKey }) => {
      const url = new URL(request.url);
      const result = await listThreads({
        db,
        principal,
        playerId,
        cursor: url.searchParams.get("cursor"),
        cursorHmacKey,
        limit: Number(url.searchParams.get("limit") ?? 50),
      });
      return Response.json(result);
    },
  );
}
