import { runApiRoute } from "./route-boundary.mjs";
import { authenticateWorkerRequest } from "../auth/worker-guard.mjs";
import { getDatabase, getMongoClient } from "../database/mongo";

export async function runAuthorizedWorkerRoute(
  request: Request,
  operation: string,
  action: (context: {
    db: Awaited<ReturnType<typeof getDatabase>>;
    client: Awaited<ReturnType<typeof getMongoClient>>;
    worker: ReturnType<typeof authenticateWorkerRequest>;
  }) => Promise<Response>,
): Promise<Response> {
  return runApiRoute(request, operation, async () => {
    const worker = authenticateWorkerRequest(request);
    const [db, client] = await Promise.all([getDatabase(), getMongoClient()]);
    const response = await action({ db, client, worker });
    if (!response.headers.has("Cache-Control"))
      response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
