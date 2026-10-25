import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import {
  createRecord,
  listRecords,
} from "../../../../../../lib/workflows/records.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/records">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "record.create",
    async ({ db, client, principal }) => {
      const result = await createRecord({
        request,
        db,
        client,
        principal,
        playerId,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/players/[playerId]/records">,
): Promise<Response> {
  const { playerId } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "record.list",
    async ({ db, principal, cursorHmacKey }) => {
      const url = new URL(request.url);
      const limitText = url.searchParams.get("limit");
      const limit = limitText === null ? 50 : Number(limitText);
      const result = await listRecords({
        db,
        principal,
        playerId,
        cursor: url.searchParams.get("cursor"),
        limit,
        cursorHmacKey,
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      });
      return Response.json({
        ...result,
        accessRevision: principal.accessRevision,
      });
    },
  );
}
