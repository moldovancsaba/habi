import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { runMigrations } from "../../../../../../lib/database/migrations/runner.mjs";
import { writeCoachEvent } from "../../../../../../lib/workflows/ai-coach.mjs";
import {
  getCoachProfile,
  redactCoachDocument,
} from "../../../../../../lib/workflows/coach-memory.mjs";
const route: typeof runAuthorizedHabiRoute = (request, operation, action) =>
  runAuthorizedHabiRoute(request, operation, async (args) => {
    await runMigrations(args.db, new Date(), ["018-contextual-ai-coach"]);
    return action(args);
  });

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/ai-profile">,
) {
  const { playerId } = await context.params;
  return route(request, "ai-profile.read", async ({ db, principal }) => {
    const { profile } = await getCoachProfile({ db, principal, playerId });
    return Response.json({ profile: redactCoachDocument(profile) });
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
