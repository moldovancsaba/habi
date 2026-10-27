import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { withdrawPublication } from "../../../../../../lib/workflows/publications.mjs";
export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/publications/[id]/withdraw">,
) {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "publication.withdraw",
    async ({ db, client, principal }) => {
      const r = await withdrawPublication({
        request,
        db,
        client,
        principal,
        id,
      });
      return Response.json(r.body, { status: r.status });
    },
  );
}
