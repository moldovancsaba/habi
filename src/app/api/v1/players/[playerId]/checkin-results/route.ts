import { HabiApiError } from "../../../../../../lib/api/error-response.mjs";
import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { listCheckinResults } from "../../../../../../lib/workflows/checkin.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/checkin-results">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "checkin.results.list",
    async ({ db, principal }) => {
      const url = new URL(request.url);
      for (const key of url.searchParams.keys()) {
        if (!["limit", "from", "to"].includes(key))
          throw new HabiApiError("INVALID_INPUT");
      }
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 20 : Number(rawLimit);
      if (!Number.isInteger(limit)) throw new HabiApiError("INVALID_INPUT");
      return Response.json(
        await listCheckinResults({
          db,
          principal,
          playerId,
          limit,
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        }),
      );
    },
  );
}
