const API_PATH_PATTERN = /^\/(?:api|auth|v1)\//;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const API_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const CALLER_HEADERS = new Set([
  "idempotency-key",
  "if-match",
  "if-none-match",
  "x-csrf-token",
]);

export class HabiClientError extends Error {
  constructor({
    kind,
    code,
    status = null,
    requestId = null,
    retryAfter = null,
  }) {
    super(code);
    this.name = "HabiClientError";
    this.kind = kind;
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

function validatePath(path) {
  if (typeof path !== "string" || !API_PATH_PATTERN.test(path)) {
    throw new HabiClientError({ kind: "contract", code: "INVALID_API_PATH" });
  }
  const parsed = new URL(path, "https://habi.invalid");
  if (
    parsed.origin !== "https://habi.invalid" ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new HabiClientError({ kind: "contract", code: "INVALID_API_PATH" });
  }
  return `${parsed.pathname}${parsed.search}`;
}

function parseJsonResponse(response) {
  if (response.status === 204) return Promise.resolve(null);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HabiClientError({
      kind: "protocol",
      code: "INVALID_API_RESPONSE",
      status: response.status,
      requestId: response.headers.get("x-request-id"),
    });
  }
  return response.json().catch(() => {
    throw new HabiClientError({
      kind: "protocol",
      code: "INVALID_API_RESPONSE",
      status: response.status,
      requestId: response.headers.get("x-request-id"),
    });
  });
}

function parseError(response, body) {
  const headerRequestId = response.headers.get("x-request-id");
  const requestId = REQUEST_ID_PATTERN.test(headerRequestId ?? "")
    ? headerRequestId
    : REQUEST_ID_PATTERN.test(body?.requestId ?? "")
      ? body.requestId
      : null;
  const code = ERROR_CODE_PATTERN.test(body?.code ?? "")
    ? body.code
    : "INVALID_API_RESPONSE";
  const headerRetry = response.headers.get("retry-after");
  const headerRetrySeconds = /^\d+$/.test(headerRetry ?? "")
    ? Number(headerRetry)
    : null;
  const retryAfter =
    Number.isSafeInteger(body?.retryAfter) && body.retryAfter >= 0
      ? body.retryAfter
      : headerRetrySeconds;

  return new HabiClientError({
    kind: code === "INVALID_API_RESPONSE" ? "protocol" : "http",
    code,
    status: response.status,
    requestId,
    retryAfter,
  });
}

/**
 * Issue a same-origin Habi API request. Network failures, aborts, protocol
 * failures, and server errors remain distinct; requests are never retried.
 */
export async function requestHabiApi(
  path,
  { method = "GET", body, headers, signal, fetchImpl = fetch } = {},
) {
  const endpoint = validatePath(path);
  if (typeof method !== "string" || !API_METHODS.has(method.toUpperCase())) {
    throw new HabiClientError({
      kind: "contract",
      code: "INVALID_HTTP_METHOD",
    });
  }
  const normalizedMethod = method.toUpperCase();
  if (body !== undefined && ["GET", "HEAD"].includes(normalizedMethod)) {
    throw new HabiClientError({
      kind: "contract",
      code: "INVALID_REQUEST_BODY",
    });
  }
  const requestHeaders = new Headers(headers);
  for (const name of requestHeaders.keys()) {
    if (!CALLER_HEADERS.has(name.toLowerCase())) {
      throw new HabiClientError({
        kind: "contract",
        code: "INVALID_REQUEST_HEADER",
      });
    }
  }
  let serializedBody;

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
    try {
      serializedBody = JSON.stringify(body);
    } catch {
      throw new HabiClientError({
        kind: "contract",
        code: "INVALID_REQUEST_BODY",
      });
    }
    if (serializedBody === undefined) {
      throw new HabiClientError({
        kind: "contract",
        code: "INVALID_REQUEST_BODY",
      });
    }
  }

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: normalizedMethod,
      body: serializedBody,
      headers: requestHeaders,
      signal,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HabiClientError({ kind: "aborted", code: "REQUEST_ABORTED" });
    }
    throw new HabiClientError({ kind: "network", code: "NETWORK_UNAVAILABLE" });
  }

  const result = await parseJsonResponse(response);
  if (!response.ok) throw parseError(response, result);
  return result;
}
