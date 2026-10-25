import assert from "node:assert/strict";
import test from "node:test";
import { HabiApiError } from "../src/lib/api/error-response.mjs";
import { runApiRoute } from "../src/lib/api/route-boundary.mjs";

test("adds a fresh request ID to successful route responses", async () => {
  const response = await runApiRoute(
    new Request("https://habi.test/api/health"),
    "api.health",
    async () => Response.json({ ok: true }),
    () => assert.fail("success should not log"),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-request-id"), /^[a-f0-9]{32}$/);
});

test("maps known errors and emits content-free structured diagnostics", async () => {
  const lines = [];
  const response = await runApiRoute(
    new Request("https://habi.test/api/private?token=must-not-log"),
    "api.private",
    async () => {
      throw new HabiApiError("ACCESS_DENIED");
    },
    (line) => lines.push(line),
  );
  const body = await response.json();
  const log = JSON.parse(lines[0]);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-request-id"), body.requestId);
  assert.equal(log.requestId, body.requestId);
  assert.equal(log.code, "ACCESS_DENIED");
  assert.equal(log.operation, "api.private");
  assert.equal(JSON.stringify(log).includes("must-not-log"), false);
});

test("records expected dependency-unavailable responses without response data", async () => {
  const lines = [];
  const response = await runApiRoute(
    new Request("https://habi.test/api/ready"),
    "api.ready",
    async () =>
      Response.json(
        { ok: false, service: "habi", error: "DEPENDENCY_UNAVAILABLE" },
        { status: 503 },
      ),
    (line) => lines.push(line),
  );
  const log = JSON.parse(lines[0]);

  assert.equal(response.status, 503);
  assert.equal(log.event, "habi.api.response_failure");
  assert.equal(log.operation, "api.ready");
  assert.equal(log.status, 503);
  assert.equal(Object.hasOwn(log, "response"), false);
});

test("redacts unknown failures and survives logger failure", async () => {
  const response = await runApiRoute(
    new Request("https://habi.test/api/private"),
    "API/private\nsecret",
    async () => {
      throw new Error("credential=never-return-this");
    },
    () => {
      throw new Error("logger failure");
    },
  );

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("retry-after"), null);
  assert.deepEqual(await response.json(), {
    code: "INTERNAL_ERROR",
    requestId: response.headers.get("x-request-id"),
    retryAfter: null,
  });
  assert.match(response.headers.get("x-request-id"), /^[a-f0-9]{32}$/);
});

test("preserves Next.js prerender control-flow signals", async () => {
  const dynamicSignal = Object.assign(new Error("dynamic request data"), {
    digest: "NEXT_PRERENDER_INTERRUPTED",
  });

  await assert.rejects(
    runApiRoute(
      new Request("https://habi.test/api/health"),
      "api.health",
      async () => {
        throw dynamicSignal;
      },
      () =>
        assert.fail(
          "framework control flow must not be logged as an API error",
        ),
    ),
    (error) => error === dynamicSignal,
  );
});
