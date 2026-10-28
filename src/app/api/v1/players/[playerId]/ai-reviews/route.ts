import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { runMigrations } from "../../../../../../lib/database/migrations/runner.mjs";
import { listCoachReviews } from "../../../../../../lib/workflows/ai-coach.mjs";
const route: typeof runAuthorizedHabiRoute = (request, operation, action) =>
  runAuthorizedHabiRoute(request, operation, async (args) => {
    await runMigrations(args.db, new Date(), [
      "018-contextual-ai-coach",
      "019-coach-message-understanding",
    ]);
    return action(args);
  });

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/ai-reviews">,
) {
  const { playerId } = await context.params;
  return route(request, "ai-coach.reviews", async ({ db, principal }) =>
    Response.json(await listCoachReviews({ db, principal, playerId })),
  );
}
