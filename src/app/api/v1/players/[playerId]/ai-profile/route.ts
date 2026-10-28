import { coachMessageHistory } from "../../../../../../lib/workflows/coach-messages.mjs";
import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { runMigrations } from "../../../../../../lib/database/migrations/runner.mjs";
import { writeCoachEvent } from "../../../../../../lib/workflows/ai-coach.mjs";
import {
  getCoachProfile,
  redactCoachDocument,
} from "../../../../../../lib/workflows/coach-memory.mjs";
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
  context: RouteContext<"/api/v1/players/[playerId]/ai-profile">,
) {
  const { playerId } = await context.params;
  return route(request, "ai-profile.read", async ({ db, principal }) => {
    const { profile } = await getCoachProfile({ db, principal, playerId });
    const history = await coachMessageHistory({
      db,
      principal,
      playerId,
      before: new URL(request.url).searchParams.get("before"),
    });
    return Response.json({ profile: redactCoachDocument(profile), history });
  });
}
export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/ai-profile">,
) {
  const { playerId } = await context.params;
  return route(
    request,
    "ai-profile.update",
    async ({ db, client, principal }) =>
      Response.json(
        await writeCoachEvent({ request, db, client, principal, playerId }),
        { status: 201 },
      ),
  );
}
