import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import {
  createExtraction,
  listExtractions,
} from "../../../../../../lib/workflows/extractions.mjs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/reports/[id]/extractions">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "extraction.create",
    async ({ db, client, principal }) => {
      const result = await createExtraction({
        request,
        client,
        db,
        principal,
        reportId: id,
      });
      return Response.json(result.body, { status: result.status });
    },
  );
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/reports/[id]/extractions">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "extraction.list",
    async ({ db, principal, cursorHmacKey }) => {
      const url = new URL(request.url);
      const result = await listExtractions({
        db,
        principal,
        reportId: id,
        cursor: url.searchParams.get("cursor"),
        cursorHmacKey,
        limit: Number(url.searchParams.get("limit") ?? 50),
      });
      return Response.json(result);
    },
  );
}
