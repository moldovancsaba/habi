import assert from "node:assert/strict";
import test from "node:test";
import {
  HabiApiError,
  toHabiErrorResponse,
} from "../src/lib/api/error-response.mjs";

test("public errors follow status and strict envelope contract without internal details", async () => {
  const response = toHabiErrorResponse(
    new HabiApiError("DEPENDENCY_UNAVAILABLE", { retryAfter: 5 }),
    { requestId: "request-123" },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Retry-After"), "5");
  assert.deepEqual(await response.json(), {
    code: "DEPENDENCY_UNAVAILABLE",
    requestId: "request-123",
    retryAfter: 5,
  });

  const internal = toHabiErrorResponse(
    Object.assign(new Error("mongodb://user:secret@host/private"), {
      stack: "sensitive stack trace",
      code: "UNRECOGNIZED_INTERNAL_CODE",
    }),
  );
  const body = await internal.json();
  assert.equal(internal.status, 500);
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.match(body.requestId, /^[a-f0-9]{32}$/);
  assert.equal(body.retryAfter, null);
  assert.equal(JSON.stringify(body).includes("secret"), false);
  assert.equal(JSON.stringify(body).includes("mongodb"), false);
  assert.equal(JSON.stringify(body).includes("stack"), false);
});

test("known error codes map consistently and unsafe request/retry values are replaced", async () => {
  for (const [code, status] of [
    ["INVALID_INPUT", 400],
    ["AUTHENTICATION_REQUIRED", 401],
    ["ACCESS_DENIED", 403],
    ["NOT_FOUND", 404],
    ["REVISION_CONFLICT", 409],
    ["CURSOR_EXPIRED", 410],
    ["RATE_LIMITED", 429],
  ]) {
    const response = toHabiErrorResponse(new HabiApiError(code));
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.equal(body.retryAfter, null);
  }

  const unsafe = toHabiErrorResponse(
    new HabiApiError("RATE_LIMITED", { retryAfter: -1 }),
    { requestId: "../private" },
  );
  const body = await unsafe.json();
  assert.match(body.requestId, /^[a-f0-9]{32}$/);
  assert.equal(body.retryAfter, null);
  assert.equal(unsafe.headers.has("Retry-After"), false);
});
