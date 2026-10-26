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

test("unconfigured Vercel Preview blocks product APIs but keeps health probes", async () => {
  const env = { VERCEL_ENV: "preview" };
  const blocked = await runApiRoute(
    new Request("https://habi.test/api/v1/players"),
    "api.players.list",
    async () => assert.fail("unconfigured preview must not run product APIs"),
    () => {},
    env,
  );
  assert.equal(blocked.status, 503);
  assert.equal((await blocked.json()).code, "DEPENDENCY_UNAVAILABLE");

  const health = await runApiRoute(
    new Request("https://habi.test/api/health"),
    "api.health",
    async () => Response.json({ ok: true }),
    () => {},
    env,
  );
  assert.equal(health.status, 200);
});

test("legacy-browser MVP permits only health, readiness, and legacy storage", async () => {
  const env = { VERCEL_ENV: "production", HG_MVP_MODE: "legacy-browser" };
  for (const operation of ["api.players.list", "api.v1.me", "api.auth.login"]) {
    const blocked = await runApiRoute(
      new Request("https://habi.doneisbetter.com/api/blocked"),
      operation,
      async () =>
        assert.fail("new multi-role APIs must remain closed in MVP mode"),
      () => {},
      env,
    );
    assert.equal(blocked.status, 503);
    assert.equal((await blocked.json()).code, "DEPENDENCY_UNAVAILABLE");
  }

  for (const operation of ["api.health", "api.ready", "api.legacy.storage"]) {
    const allowed = await runApiRoute(
      new Request("https://habi.doneisbetter.com/api/allowed"),
      operation,
      async () => Response.json({ ok: true }),
      () => assert.fail("allowed route should not log"),
      env,
    );
    assert.equal(allowed.status, 200);
  }

  const previewStorage = await runApiRoute(
    new Request("https://habi-preview.example/api/app"),
    "api.legacy.storage",
    async () => Response.json({ ok: true }),
    () => assert.fail("configured preview legacy storage should not log"),
    { VERCEL_ENV: "preview", HG_MVP_MODE: "legacy-browser" },
  );
  assert.equal(previewStorage.status, 200);
});

test("SSO-browser MVP permits SSO and owner storage routes only", async () => {
  const env = { VERCEL_ENV: "production", HG_MVP_MODE: "sso-browser" };
  for (const operation of ["api.players.list", "api.v1.me", "api.auth.login"]) {
    const blocked = await runApiRoute(
      new Request("https://www.habigoal.com/api/blocked"),
      operation,
      async () => assert.fail("out-of-scope role APIs remain closed"),
      () => {},
      env,
    );
    assert.equal(blocked.status, 503);
  }
  for (const operation of [
    "api.health",
    "api.ready",
    "api.legacy.storage",
    "auth.login",
    "auth.callback",
    "auth.logout",
    "auth.legacy-handoff",
    "auth.legacy-handoff.accept",
  ]) {
    const allowed = await runApiRoute(
      new Request("https://www.habigoal.com/api/allowed"),
      operation,
      async () => Response.json({ ok: true }),
      () => assert.fail("SSO MVP route should not log on success"),
      env,
    );
    assert.equal(allowed.status, 200);
  }
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
