import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import {
  listInterpretations,
  requestInterpretation,
} from "../../../../../../lib/workflows/interpretations.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/interpretations">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "interpretation.request",
    async ({ db, client, principal }) => {
      const result = await requestInterpretation({
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
  context: RouteContext<"/api/v1/players/[playerId]/interpretations">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "interpretation.list",
    async ({ db, principal, cursorHmacKey }) => {
      const url = new URL(request.url);
      const result = await listInterpretations({
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
