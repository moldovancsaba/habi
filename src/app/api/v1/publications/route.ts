import { runAuthorizedHabiRoute } from "../../../../lib/api/runtime-route";
import { publishCoachResource } from "../../../../lib/workflows/publications.mjs";

export async function POST(request: Request): Promise<Response> {
  return runAuthorizedHabiRoute(
    request,
    "publication.create",
    async ({ db, client, principal }) => {
      const result = await publishCoachResource({
        request,
        db,
        client,
        principal,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
