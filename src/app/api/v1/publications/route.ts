import { runAuthorizedHabiRoute } from "../../../../lib/api/runtime-route";
import {
  publishCoachResource,
  listPublications,
} from "../../../../lib/workflows/publications.mjs";

export async function GET(request: Request) {
  return runAuthorizedHabiRoute(
    request,
    "publication.list",
    async ({ db, principal }) => {
      const playerId = new URL(request.url).searchParams.get("playerId");
      if (!playerId)
        return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
      return Response.json(await listPublications({ db, principal, playerId }));
    },
  );
}

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
