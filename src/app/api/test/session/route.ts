import { getDatabase } from "../../../../lib/database/mongo";
import {
  createLocalTestLogoutHandler,
  createLocalTestSessionHandler,
  localTestModeEnabled,
} from "../../../../lib/auth/local-test-session-handler.mjs";
import { localSyntheticTestRequestStatus } from "../../../../lib/auth/local-test-auth.mjs";

function hidden() {
  return Response.json(
    { code: "NOT_FOUND" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!localTestModeEnabled()) return hidden();
  const guardStatus = localSyntheticTestRequestStatus(request);
  if (guardStatus !== "allowed") {
    console.warn(
      JSON.stringify({
        event: "habi.local_test.request_denied",
        reason: guardStatus,
      }),
    );
  }
  return createLocalTestSessionHandler({ db: await getDatabase() })(request);
}

export async function DELETE(request: Request): Promise<Response> {
  if (!localTestModeEnabled()) return hidden();
  return createLocalTestLogoutHandler({ db: await getDatabase() })(request);
}
