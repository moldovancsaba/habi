import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { finalizeUpload } from "../../../../../../lib/workflows/uploads.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/uploads/[id]/finalize">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "upload.finalize",
    async ({ db, client, principal }) => {
      const result = await finalizeUpload({
        request,
        client,
        db,
        principal,
        id,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
