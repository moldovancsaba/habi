import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import {
  createPlan,
  listPlans,
} from "../../../../../../lib/workflows/plans.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/plans">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "plan.create",
    async ({ db, client, principal }) => {
      const result = await createPlan({
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
  context: RouteContext<"/api/v1/players/[playerId]/plans">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "plan.list",
    async ({ db, principal, cursorHmacKey }) => {
      const url = new URL(request.url);
      const result = await listPlans({
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
