import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { runMigrations } from "../../../../../../lib/database/migrations/runner.mjs";
import {
  startCoachTurn,
  listCoachThreads,
} from "../../../../../../lib/workflows/ai-coach.mjs";
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
  context: RouteContext<"/api/v1/players/[playerId]/ai-coach">,
) {
  const { playerId } = await context.params;
  return route(request, "ai-coach.list", async ({ db, principal }) =>
    Response.json(
      await listCoachThreads({
        db,
        principal,
        playerId,
        before: new URL(request.url).searchParams.get("before"),
      }),
    ),
  );
}
export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/ai-coach">,
) {
  const { playerId } = await context.params;
  return route(request, "ai-coach.ask", async ({ db, client, principal }) =>
    Response.json(
      await startCoachTurn({ request, db, client, principal, playerId }),
      { status: 202 },
    ),
  );
}
