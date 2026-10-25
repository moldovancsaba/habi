import { Readable } from "node:stream";
import { runAuthorizedHabiRoute } from "../../../../../../lib/api/runtime-route";
import { openReportDownload } from "../../../../../../lib/workflows/reports.mjs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/reports/[id]/download">,
): Promise<Response> {
  const { id } = await context.params;
  return runAuthorizedHabiRoute(
    request,
    "report.download",
    async ({ db, principal }) => {
      const stream = await openReportDownload({ db, principal, id });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="habi-report-${encodeURIComponent(id)}.pdf"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    },
  );
}
