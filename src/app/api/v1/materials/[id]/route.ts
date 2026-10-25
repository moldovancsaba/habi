import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { getCoachMaterial } from "../../../../../lib/workflows/materials.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/materials/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "material.read",
    async ({ db, principal }) => {
      const revisionValue = new URL(request.url).searchParams.get("revision");
      const revision = revisionValue === null ? null : Number(revisionValue);
      if (
        revisionValue !== null &&
        (revision === null || !Number.isInteger(revision) || revision < 1)
      ) {
        return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
      }
      return Response.json(
        await getCoachMaterial({ db, principal, id, revision }),
      );
    },
  );
}
