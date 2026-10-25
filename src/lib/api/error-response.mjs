import { randomBytes } from "node:crypto";

const ERROR_STATUS = Object.freeze({
  INVALID_INPUT: 400,
  AUTHENTICATION_REQUIRED: 401,
  ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  CURSOR_EXPIRED: 410,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
});

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function createRequestId() {
  return randomBytes(16).toString("hex");
}

function safeRequestId(value) {
  if (typeof value === "string" && REQUEST_ID_PATTERN.test(value)) {
    return value;
  }
  return createRequestId();
}

function safeRetryAfter(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export class HabiApiError extends Error {
  constructor(code, { retryAfter = null } = {}) {
    super(code);
    this.name = "HabiApiError";
    this.code = code;
    this.retryAfter = safeRetryAfter(retryAfter);
  }
}

/**
 * Convert domain/runtime failures to the public error contract without
 * serializing exception text, stack data, database details, or credentials.
 */
export function toHabiErrorResponse(error, { requestId } = {}) {
  const candidate = typeof error?.code === "string" ? error.code : "";
  const code = Object.hasOwn(ERROR_STATUS, candidate)
    ? candidate
    : "INTERNAL_ERROR";
  const status = ERROR_STATUS[code] ?? 500;
  const id = safeRequestId(requestId);
  const retryAfter = safeRetryAfter(error?.retryAfter);
  const body = {
    code,
    requestId: id,
    retryAfter,
  };
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  if (retryAfter !== null) headers.set("Retry-After", String(retryAfter));

  return new Response(JSON.stringify(body), { status, headers });
}
