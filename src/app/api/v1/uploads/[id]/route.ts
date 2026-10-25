import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { getUpload } from "../../../../../lib/workflows/uploads.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/uploads/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "upload.read",
    async ({ db, principal }) =>
      Response.json(await getUpload({ db, principal, id })),
  );
}
