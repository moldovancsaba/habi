import { runAuthorizedHabiRoute } from "../../../../../../../lib/api/runtime-route";
import { runMigrations } from "../../../../../../../lib/database/migrations/runner.mjs";
import { reviewCoachTurn } from "../../../../../../../lib/workflows/ai-coach.mjs";
const route: typeof runAuthorizedHabiRoute = (request, operation, action) =>
  runAuthorizedHabiRoute(request, operation, async (args) => {
    await runMigrations(args.db, new Date(), ["018-contextual-ai-coach"]);
    return action(args);
  });

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/ai-reviews/[id]">,
) {
  const { playerId, id } = await context.params;
  return route(request, "ai-coach.review", async ({ db, client, principal }) =>
    Response.json(
      await reviewCoachTurn({ request, db, client, principal, playerId, id }),
    ),
  );
}
