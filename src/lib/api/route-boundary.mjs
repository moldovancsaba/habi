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
  "api.legacy.storage",
  "admin.me",
  "admin.invitations",
  "admin.role-requests",
  "admin.memberships",
  "identity.claim",
  "identity.activate-role",
  "identity.role-requests",
  "monthly-reflection.create",
  "monthly-reflection.list",
]);

function isNextControlFlow(error) {
  return (
    error instanceof Error &&
    typeof error.digest === "string" &&
    NEXT_CONTROL_FLOW_DIGESTS.has(error.digest)
  );
}

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SYMBOLIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const CODE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const FRAME_PATTERN =
  /^ {4}at ([^\n()]{0,80}?) ?\(?([^\s()?]{1,200}:\d+:\d+)\)?$/;

/**
 * Describe an unexpected failure for the log without its content: the error
 * class, a numeric or upper-case symbolic code, the database code name, error
 * labels and the first code frame. The message and any data are never read, so
 * a failure that only a rare timing produces can still be located afterwards.
 */
export function describeFailure(error) {
  const matches = (pattern, value) =>
    typeof value === "string" && pattern.test(value);
  const name = error?.constructor?.name ?? error?.name;
  const code = error?.code;
  const labels = Array.isArray(error?.errorLabels) ? error.errorLabels : [];
  const stack = typeof error?.stack === "string" ? error.stack.split("\n") : [];
  const frame = stack
    .map((line) => FRAME_PATTERN.exec(line))
    .find((match) => match !== null);
  return {
    name: matches(NAME_PATTERN, name) ? name : "Unknown",
    code:
      Number.isSafeInteger(code) || matches(SYMBOLIC_CODE_PATTERN, code)
        ? code
        : null,
    codeName: matches(CODE_NAME_PATTERN, error?.codeName)
      ? error.codeName
      : null,
    labels: labels.filter((label) => matches(NAME_PATTERN, label)).slice(0, 4),
    site: frame ? `${frame[1]} ${frame[2]}`.trim().slice(0, 240) : null,
  };
}

function emitLog(logger, line, level) {
  if (logger) {
    logger(line, level);
    return;
  }
  console[level === "error" ? "error" : "info"](line);
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
  logger = null,
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
      emitLog(
        logger,
        JSON.stringify({
          event: "habi.api.error",
          operation: safeOperation,
          requestId,
          status: response.status,
          code: "DEPENDENCY_UNAVAILABLE",
        }),
        "error",
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
        emitLog(
          logger,
          JSON.stringify({
            event: "habi.api.response_failure",
            operation: safeOperation,
            requestId,
            status: response.status,
          }),
          "error",
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
      emitLog(
        logger,
        JSON.stringify({
          event: "habi.api.error",
          operation: safeOperation,
          requestId,
          status: response.status,
          code: payload.code,
          ...(payload.code === "INTERNAL_ERROR"
            ? { failure: describeFailure(error) }
            : {}),
        }),
        response.status >= 500 ? "error" : "info",
      );
    } catch {
      // Logging failure must not replace the already-redacted API response.
    }
    return response;
  }
}
