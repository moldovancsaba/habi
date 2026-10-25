import { runAuthorizedHabiRoute } from "../../../../../../../lib/api/runtime-route";
import { putUploadChunk } from "../../../../../../../lib/workflows/uploads.mjs";

export async function PUT(
  request: Request,
  context: RouteContext<"/api/v1/uploads/[id]/chunks/[index]">,
): Promise<Response> {
  const { id, index: rawIndex } = await context.params;
  const index = Number(rawIndex);
  return runAuthorizedHabiRoute(
    request,
    "upload.chunk",
    async ({ db, client, principal }) => {
      const result = await putUploadChunk({
        request,
        client,
        db,
        principal,
        id,
        index,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
