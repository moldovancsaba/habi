import assert from "node:assert/strict";
import test from "node:test";
import {
  HabiClientError,
  requestHabiApi,
} from "../src/lib/client/api-client.mjs";

test("uses same-origin, no-store, non-redirecting requests", async () => {
  let captured;
  const result = await requestHabiApi("/v1/me/scope?cursor=abc", {
    validateResponse: (value) => value.tenantId === "tenant-1",
    fetchImpl: async (...args) => {
      captured = args;
      return Response.json({ tenantId: "tenant-1" });
    },
  });

  assert.deepEqual(result, { tenantId: "tenant-1" });
  assert.equal(captured[0], "/v1/me/scope?cursor=abc");
  assert.equal(captured[1].credentials, "same-origin");
  assert.equal(captured[1].cache, "no-store");
  assert.equal(captured[1].redirect, "error");
  assert.equal(captured[1].method, "GET");
});

test("serializes JSON bodies and preserves CSRF/idempotency headers", async () => {
  let captured;
  await requestHabiApi("/v1/records", {
    method: "POST",
    body: { text: "test" },
    headers: { "X-CSRF-Token": "csrf-test", "Idempotency-Key": "key-test" },
    validateResponse: (value) => value.id === "record-1",
    fetchImpl: async (...args) => {
      captured = args;
      return Response.json({ id: "record-1" }, { status: 201 });
    },
  });

  assert.equal(captured[1].headers.get("content-type"), "application/json");
  assert.equal(captured[1].headers.get("x-csrf-token"), "csrf-test");
  assert.equal(captured[1].headers.get("idempotency-key"), "key-test");
  assert.equal(captured[1].body, JSON.stringify({ text: "test" }));
});

test("requires a caller-supplied contract validator for product API responses", async () => {
  let calls = 0;
  await assert.rejects(
    requestHabiApi("/v1/private", {
      fetchImpl: async () => {
        calls += 1;
        return Response.json({ unsafe: true });
      },
    }),
    (error) => error.code === "RESPONSE_VALIDATOR_REQUIRED",
  );
  assert.equal(calls, 0);

  for (const validateResponse of [
    () => false,
    () => {
      throw new Error("sensitive validator detail");
    },
  ]) {
    await assert.rejects(
      requestHabiApi("/v1/private", {
        validateResponse,
        fetchImpl: async () => Response.json({ unexpected: "payload" }),
      }),
      (error) =>
        error.kind === "contract" &&
        error.code === "INVALID_API_RESPONSE" &&
        !error.message.includes("sensitive"),
    );
  }
});

test("rejects cross-origin, malformed, and unsupported API paths", async () => {
  for (const path of [
    "https://attacker.example/v1/me",
    "//attacker.example/v1/me",
    "/private",
    "/v1/me#fragment",
  ]) {
    await assert.rejects(requestHabiApi(path), (error) => {
      assert.ok(error instanceof HabiClientError);
      assert.equal(error.code, "INVALID_API_PATH");
      return true;
    });
  }
});

test("rejects browser bearer credentials and bodies on read requests", async () => {
  await assert.rejects(
    requestHabiApi("/v1/me", { headers: { Authorization: "Bearer secret" } }),
    (error) => error.code === "INVALID_REQUEST_HEADER",
  );
  await assert.rejects(
    requestHabiApi("/v1/me", { method: "GET", body: { unexpected: true } }),
    (error) => error.code === "INVALID_REQUEST_BODY",
  );
});

test("distinguishes offline, abort, HTTP, and invalid protocol failures", async () => {
  await assert.rejects(
    requestHabiApi("/v1/me", {
      validateResponse: () => true,
      fetchImpl: async () => {
        throw new TypeError("offline");
      },
    }),
    (error) => error.kind === "network" && error.code === "NETWORK_UNAVAILABLE",
  );
  await assert.rejects(
    requestHabiApi("/v1/me", {
      validateResponse: () => true,
      fetchImpl: async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    }),
    (error) => error.kind === "aborted" && error.code === "REQUEST_ABORTED",
  );
  await assert.rejects(
    requestHabiApi("/v1/me", {
      validateResponse: () => true,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: "DEPENDENCY_UNAVAILABLE",
            requestId: "request-1",
            retryAfter: 4,
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "X-Request-ID": "request-1",
              "Retry-After": "4",
            },
          },
        ),
    }),
    (error) =>
      error.kind === "http" &&
      error.status === 503 &&
      error.retryAfter === 4 &&
      error.requestId === "request-1",
  );
  await assert.rejects(
    requestHabiApi("/v1/me", {
      validateResponse: () => true,
      fetchImpl: async () => new Response("secret detail", { status: 500 }),
    }),
    (error) =>
      error.kind === "protocol" && error.code === "INVALID_API_RESPONSE",
  );
});

test("does not retry writes automatically and does not expose raw failures", async () => {
  let calls = 0;
  await assert.rejects(
    requestHabiApi("/v1/records", {
      method: "POST",
      body: { text: "private" },
      validateResponse: () => true,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("token=secret");
      },
    }),
    (error) =>
      error.message === "NETWORK_UNAVAILABLE" &&
      !error.message.includes("secret"),
  );
  assert.equal(calls, 1);
});
