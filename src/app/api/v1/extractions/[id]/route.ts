import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { getExtraction } from "../../../../../lib/workflows/extractions.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/extractions/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "extraction.read",
    async ({ db, principal }) =>
      Response.json(await getExtraction({ db, principal, id })),
  );
}
