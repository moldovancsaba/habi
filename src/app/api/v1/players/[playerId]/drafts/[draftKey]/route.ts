import { runAuthorizedHabiRoute } from "../../../../../../../lib/api/runtime-route";
import {
  deleteExperienceDraft,
  readExperienceDraft,
  saveExperienceDraft,
} from "../../../../../../../lib/workflows/experience-drafts.mjs";

type DraftRouteContext =
  RouteContext<"/api/v1/players/[playerId]/drafts/[draftKey]">;

export async function GET(
  request: Request,
  context: DraftRouteContext,
): Promise<Response> {
  const { playerId, draftKey } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "experienceDraft.read",
    async ({ db, principal }) => {
      const result = await readExperienceDraft({
        db,
        principal,
        playerId,
        draftKey,
      });
      return Response.json(result);
    },
  );
}

export async function PUT(
  request: Request,
  context: DraftRouteContext,
): Promise<Response> {
  const { playerId, draftKey } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "experienceDraft.save",
    async ({ db, client, principal }) => {
      const result = await saveExperienceDraft({
        request,
        client,
        db,
        principal,
        playerId,
        draftKey,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}

export async function DELETE(
  request: Request,
  context: DraftRouteContext,
): Promise<Response> {
  const { playerId, draftKey } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "experienceDraft.delete",
    async ({ db, client, principal }) => {
      const result = await deleteExperienceDraft({
        request,
        client,
        db,
        principal,
        playerId,
        draftKey,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}
