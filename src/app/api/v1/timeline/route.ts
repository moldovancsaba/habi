import { runAuthorizedHabiRoute } from "../../../../lib/api/runtime-route";
import { readTimeline } from "../../../../lib/workflows/timeline.mjs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return runAuthorizedHabiRoute(
    request,
    "timeline.read",
    async ({ db, principal, cursorHmacKey }) => {
      const rawLimit = url.searchParams.get("limit");
      const result = await readTimeline({
        db,
        principal,
        playerId: url.searchParams.get("playerId") ?? principal.playerId,
        kind: url.searchParams.get("kind"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        cursor: url.searchParams.get("cursor"),
        limit: rawLimit === null ? 20 : Number(rawLimit),
        cursorHmacKey,
      });
      return Response.json(result);
    },
  );
}
