import { runAuthorizedHabiRoute } from "../../../../../../../lib/api/runtime-route";
import { runMigrations } from "../../../../../../../lib/database/migrations/runner.mjs";
import { readCoachThread } from "../../../../../../../lib/workflows/ai-coach.mjs";

// These routes read the player's records one collection at a time, which is many
// database round trips; allow more than the platform default instead of being cut off.
export const maxDuration = 30;
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
  context: RouteContext<"/api/v1/players/[playerId]/ai-coach/[id]">,
) {
  const { playerId, id } = await context.params;
  return route(request, "ai-coach.read", async ({ db, principal }) =>
    Response.json(
      await readCoachThread({
        db,
        principal,
        playerId,
        id,
        before: new URL(request.url).searchParams.get("before"),
      }),
    ),
  );
}
