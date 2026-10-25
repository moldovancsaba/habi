import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { abortUpload } from "../../../../../../lib/workflows/uploads.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/uploads/[id]/abort">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "upload.abort",
    async ({ db, client, principal }) => {
      const result = await abortUpload({ request, client, db, principal, id });
      return Response.json(result.body, { status: result.status });
    },
  );
}
