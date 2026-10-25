import { createHash, timingSafeEqual } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";

export function authenticateWorkerRequest(request, env = process.env) {
  const serviceId = env.HG_WORKER_SERVICE_ID ?? "";
  const expectedHex = env.HG_WORKER_BEARER_SHA256 ?? "";
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(serviceId) ||
    !/^[a-f0-9]{64}$/.test(expectedHex)
  ) {
    throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]{32,500})$/.exec(authorization);
  if (!match) throw new HabiApiError("AUTHENTICATION_REQUIRED");
  const actual = createHash("sha256").update(match[1]).digest();
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected))
    throw new HabiApiError("AUTHENTICATION_REQUIRED");
  // Keep the verifier secret inside the server runtime. It seeds deterministic
  // lease credentials so a retried claim request can receive the same lease.
  return Object.freeze({ serviceId, leaseSeed: expectedHex });
}

export function workerLeaseHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
