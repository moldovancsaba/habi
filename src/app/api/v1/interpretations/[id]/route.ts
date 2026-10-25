import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { getInterpretation } from "../../../../../lib/workflows/interpretations.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/interpretations/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "interpretation.read",
    async ({ db, principal }) =>
      Response.json(await getInterpretation({ db, principal, id })),
  );
}
