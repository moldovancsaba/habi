import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { reviewExtraction } from "../../../../../../lib/workflows/extractions.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/extractions/[id]/review">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "extraction.review",
    async ({ db, client, principal }) => {
      const result = await reviewExtraction({
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
