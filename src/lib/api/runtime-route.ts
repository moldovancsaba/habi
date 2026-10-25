import { runApiRoute } from "./route-boundary.mjs";
import {
  authenticateRuntimeRequest,
  runtimeCursorHmacKey,
} from "../auth/runtime-auth.mjs";
import { getDatabase, getMongoClient } from "../database/mongo";

export async function runAuthorizedHabiRoute(
  request: Request,
  operation: string,
  action: (context: {
    db: Awaited<ReturnType<typeof getDatabase>>;
    client: Awaited<ReturnType<typeof getMongoClient>>;
    principal: Awaited<ReturnType<typeof authenticateRuntimeRequest>>;
    cursorHmacKey: string;
  }) => Promise<Response>,
): Promise<Response> {
  return runApiRoute(request, operation, async () => {
    const [db, client] = await Promise.all([getDatabase(), getMongoClient()]);
    const principal = await authenticateRuntimeRequest(db, request);
    const response = await action({
      db,
      client,
      principal,
      cursorHmacKey: runtimeCursorHmacKey(),
    });
    if (!response.headers.has("Cache-Control")) {
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  });
}
