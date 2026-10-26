import {
  createRequestId,
  HabiApiError,
  toHabiErrorResponse,
} from "./error-response.mjs";

const OPERATION_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const NEXT_CONTROL_FLOW_DIGESTS = new Set([
  "DYNAMIC_SERVER_USAGE",
  "NEXT_PRERENDER_INTERRUPTED",
  "NEXT_REDIRECT",
  "NEXT_HTTP_ERROR_FALLBACK;404",
  "NEXT_HTTP_ERROR_FALLBACK;401",
  "NEXT_HTTP_ERROR_FALLBACK;403",
]);
const SSO_BROWSER_OPERATIONS = new Set([
  "auth.login",
  "auth.callback",
  "auth.logout",
  "auth.legacy-handoff",
  "auth.legacy-handoff.accept",
  "api.legacy.storage",
]);

function isNextControlFlow(error) {
  return (
    error instanceof Error &&
    typeof error.digest === "string" &&
    NEXT_CONTROL_FLOW_DIGESTS.has(error.digest)
  );
}

/**
 * Add request correlation and a redacted exception boundary to an API route.
 * Logs contain only a fixed operation label, request ID, status, and public
 * error code; exception messages and request data are never logged.
 */
export async function runApiRoute(
  request,
  operation,
  handler,
  logger = console.error,
  env = process.env,
) {
  const requestId = createRequestId();
  const safeOperation = OPERATION_PATTERN.test(operation)
    ? operation
    : "unknown";

  if (
    env.VERCEL_ENV === "preview" &&
    !env.HG_ENVIRONMENT &&
    !["api.health", "api.ready"].includes(safeOperation) &&
    !(
      env.HG_MVP_MODE === "legacy-browser" &&
      safeOperation === "api.legacy.storage"
    )
  ) {
    const response = toHabiErrorResponse(
      new HabiApiError("DEPENDENCY_UNAVAILABLE"),
      { requestId },
    );
    response.headers.set("X-Request-ID", requestId);
    try {
      logger(
        JSON.stringify({
          event: "habi.api.error",
          operation: safeOperation,
          requestId,
          status: response.status,
          code: "DEPENDENCY_UNAVAILABLE",
        }),
      );
    } catch {
      // Logging failure must not replace the fail-closed response.
    }
    return response;
  }

  if (
    env.HG_MVP_MODE === "legacy-browser" &&
    !["api.health", "api.ready", "api.legacy.storage"].includes(safeOperation)
  ) {
    const response = toHabiErrorResponse(
      new HabiApiError("DEPENDENCY_UNAVAILABLE"),
      { requestId },
    );
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (
    env.HG_MVP_MODE === "sso-browser" &&
    !["api.health", "api.ready", ...SSO_BROWSER_OPERATIONS].includes(
      safeOperation,
    )
  ) {
    const response = toHabiErrorResponse(
      new HabiApiError("DEPENDENCY_UNAVAILABLE"),
      { requestId },
    );
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  try {
    const response = await handler(request);
    response.headers.set("X-Request-ID", requestId);
    if (response.status >= 500) {
      try {
        logger(
          JSON.stringify({
            event: "habi.api.response_failure",
            operation: safeOperation,
            requestId,
            status: response.status,
          }),
        );
      } catch {
        // Logging failure must not replace the already-created API response.
      }
    }
    return response;
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    const response = toHabiErrorResponse(error, { requestId });
    response.headers.set("X-Request-ID", requestId);
    const payload = await response.clone().json();
    try {
      logger(
        JSON.stringify({
          event: "habi.api.error",
          operation: safeOperation,
          requestId,
          status: response.status,
          code: payload.code,
        }),
      );
    } catch {
      // Logging failure must not replace the already-redacted API response.
    }
    return response;
  }
}
