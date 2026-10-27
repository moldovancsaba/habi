import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { writeKnowledge } from "../../../../../../lib/workflows/knowledge.mjs";
export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/knowledge/[id]/review">,
) {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "knowledge.review",
    async ({ db, client, principal }) => {
      const r = await writeKnowledge({ request, db, client, principal, id });
      return Response.json(r.body, { status: r.status });
    },
  );
}
