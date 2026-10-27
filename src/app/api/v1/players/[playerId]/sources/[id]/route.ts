import { runAuthorizedHabiRoute } from "../../../../../../../lib/api/runtime-route";
import { readEvidenceSource } from "../../../../../../../lib/workflows/evidence-reader.mjs";
export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/sources/[id]">,
) {
  const { playerId, id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "source.read",
    async ({ db, principal }) =>
      Response.json(
        await readEvidenceSource({
          db,
          principal,
          playerId,
          id,
          revision: Number(new URL(request.url).searchParams.get("revision")),
        }),
      ),
  );
}
