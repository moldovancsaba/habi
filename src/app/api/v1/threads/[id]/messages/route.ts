import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import {
  createMessage,
  listMessages,
} from "../../../../../../lib/workflows/threads.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/threads/[id]/messages">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "message.create",
    async ({ db, client, principal }) => {
      const result = await createMessage({
        request,
        client,
        db,
        principal,
        threadId: id,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/threads/[id]/messages">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "message.list",
    async ({ db, principal, cursorHmacKey }) => {
      const url = new URL(request.url);
      const result = await listMessages({
        db,
        principal,
        threadId: id,
        cursor: url.searchParams.get("cursor"),
        cursorHmacKey,
        limit: Number(url.searchParams.get("limit") ?? 50),
      });
      return Response.json(result);
    },
  );
}
