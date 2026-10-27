import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import {
  createMonthlyReflection,
  listMonthlyReflections,
} from "../../../../../../lib/workflows/monthly-reflections.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/monthly-reflections">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "monthly-reflection.list",
    async ({ db, principal }) => {
      const result = await listMonthlyReflections({ db, principal, playerId });
      return Response.json(result);
    },
  );
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/monthly-reflections">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "monthly-reflection.create",
    async ({ db, client, principal }) => {
      const result = await createMonthlyReflection({
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
