import { runAuthorizedHabiRoute } from "../../../../../../../lib/api/runtime-route";
import { runMigrations } from "../../../../../../../lib/database/migrations/runner.mjs";
import { HabiApiError } from "../../../../../../../lib/api/error-response.mjs";
import {
  verifyCoachSources,
  readCoachReviewSource,
} from "../../../../../../../lib/workflows/ai-coach.mjs";
const route: typeof runAuthorizedHabiRoute = (request, operation, action) =>
  runAuthorizedHabiRoute(request, operation, async (args) => {
    await runMigrations(args.db, new Date(), ["018-contextual-ai-coach"]);
    return action(args);
  });

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/ai-sources/[id]">,
) {
  const { playerId, id } = await context.params;
  return route(request, "ai-coach.source", async ({ db, principal }) => {
    const revision = Number(new URL(request.url).searchParams.get("revision"));
    if (!Number.isInteger(revision) || revision < 1)
      throw new HabiApiError("INVALID_INPUT");
    const reviewId = new URL(request.url).searchParams.get("reviewId");
    if (reviewId)
      return Response.json({
        source: await readCoachReviewSource({
          db,
          principal,
          playerId,
          id,
          revision,
          reviewId,
        }),
      });
    const items = await verifyCoachSources(db, principal, playerId, [
      { id, revision, span: null },
    ]);
    return Response.json({ source: items[0] });
  });
}
