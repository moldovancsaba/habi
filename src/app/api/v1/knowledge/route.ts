import { runAuthorizedHabiRoute } from "../../../../lib/api/runtime-route";
import {
  listKnowledge,
  writeKnowledge,
} from "../../../../lib/workflows/knowledge.mjs";
export async function GET(request: Request) {
  return runAuthorizedHabiRoute(
    request,
    "knowledge.list",
    async ({ db, principal }) =>
      Response.json(await listKnowledge({ db, principal })),
  );
}
export async function POST(request: Request) {
  return runAuthorizedHabiRoute(
    request,
    "knowledge.create",
    async ({ db, client, principal }) => {
      const r = await writeKnowledge({ request, db, client, principal });
      return Response.json(r.body, { status: r.status });
    },
  );
}
