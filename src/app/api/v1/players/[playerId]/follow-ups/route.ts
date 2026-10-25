import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import {
  createFollowUp,
  listFollowUps,
} from "../../../../../../lib/workflows/plans.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/follow-ups">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "followup.create",
    async ({ db, client, principal }) => {
      const result = await createFollowUp({
        request,
        client,
        db,
        principal,
        playerId,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/follow-ups">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "followup.list",
    async ({ db, principal, cursorHmacKey }) => {
      const url = new URL(request.url);
      const result = await listFollowUps({
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
