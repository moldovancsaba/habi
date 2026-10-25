import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { reviewInterpretation } from "../../../../../../lib/workflows/interpretations.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/interpretations/[id]/review">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "interpretation.review",
    async ({ db, client, principal }) => {
      const result = await reviewInterpretation({
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
