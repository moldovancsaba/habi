import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { createUpload } from "../../../../../../lib/workflows/uploads.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/uploads">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "upload.create",
    async ({ db, client, principal }) => {
      const result = await createUpload({
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
