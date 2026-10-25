import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import {
  createCoachMaterial,
  listCoachMaterials,
} from "../../../../../../lib/workflows/materials.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/materials">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "material.create",
    async ({ db, client, principal }) => {
      const result = await createCoachMaterial({
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
  context: RouteContext<"/api/v1/players/[playerId]/materials">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "material.list",
    async ({ db, principal, cursorHmacKey }) => {
      const url = new URL(request.url);
      const result = await listCoachMaterials({
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
