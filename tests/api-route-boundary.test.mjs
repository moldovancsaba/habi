import assert from "node:assert/strict";
import test from "node:test";
import { HabiApiError } from "../src/lib/api/error-response.mjs";
import {
  describeFailure,
  isTransientDatabaseFailure,
  runApiRoute,
} from "../src/lib/api/route-boundary.mjs";

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
  for (const operation of [
    "api.players.list",
    "api.v1.me",
    "api.auth.login",
    "auth.legacy-handoff",
    "auth.legacy-handoff.accept",
  ]) {
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

test("SSO-browser MVP permits SSO, admin, invite, and owner storage routes only", async () => {
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
    "admin.me",
    "admin.invitations",
    "admin.role-requests",
    "admin.memberships",
    "identity.claim",
    "identity.role-requests",
    "monthly-reflection.create",
    "monthly-reflection.list",
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

test("role-workflow runtime opens authenticated product API operations", async () => {
  const env = { VERCEL_ENV: "production", HG_MVP_MODE: "role-workflow" };
  for (const operation of [
    "api.v1.me",
    "api.players.list",
    "worker.jobs.claim",
  ]) {
    const allowed = await runApiRoute(
      new Request("https://habigoal.com/api/role-workflow"),
      operation,
      async () => Response.json({ ok: true }),
      () =>
        assert.fail(
          "configured role workflow should not be blocked at the route boundary",
        ),
      env,
    );
    assert.equal(allowed.status, 200);
  }
});

test("maps known errors and emits content-free structured diagnostics", async () => {
  const lines = [];
  const levels = [];
  const response = await runApiRoute(
    new Request("https://habi.test/api/private?token=must-not-log"),
    "api.private",
    async () => {
      throw new HabiApiError("ACCESS_DENIED");
    },
    (line, level) => {
      lines.push(line);
      levels.push(level);
    },
  );
  const body = await response.json();
  const log = JSON.parse(lines[0]);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-request-id"), body.requestId);
  assert.equal(log.requestId, body.requestId);
  assert.equal(log.code, "ACCESS_DENIED");
  assert.equal(levels[0], "info");
  assert.equal(log.operation, "api.private");
  assert.equal(JSON.stringify(log).includes("must-not-log"), false);
});

test("records expected dependency-unavailable responses without response data", async () => {
  const lines = [];
  const levels = [];
  const response = await runApiRoute(
    new Request("https://habi.test/api/ready"),
    "api.ready",
    async () =>
      Response.json(
        { ok: false, service: "habi", error: "DEPENDENCY_UNAVAILABLE" },
        { status: 503 },
      ),
    (line, level) => {
      lines.push(line);
      levels.push(level);
    },
  );
  const log = JSON.parse(lines[0]);

  assert.equal(response.status, 503);
  assert.equal(log.event, "habi.api.response_failure");
  assert.equal(log.operation, "api.ready");
  assert.equal(log.status, 503);
  assert.equal(levels[0], "error");
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

test("an unexpected failure logs its class, code and code location but never its message or data", async () => {
  const lines = [];
  class MongoServerError extends Error {}
  const failure = Object.assign(
    new MongoServerError("Rejected for token=never-log-this"),
    {
      code: 112,
      codeName: "WriteConflict",
      errorLabels: ["RetryableWriteError", "bad label!"],
    },
  );
  const response = await runApiRoute(
    new Request("https://habi.test/api/private?secret=never-log-this"),
    "ai-coach.read",
    async () => {
      throw failure;
    },
    (line) => lines.push(line),
  );

  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, "INTERNAL_ERROR");
  const log = JSON.parse(lines[0]);
  assert.equal(log.operation, "ai-coach.read");
  assert.equal(log.code, "INTERNAL_ERROR");
  assert.equal(log.failure.name, "MongoServerError");
  assert.equal(log.failure.code, 112);
  assert.equal(log.failure.codeName, "WriteConflict");
  assert.deepEqual(log.failure.labels, ["RetryableWriteError"]);
  assert.match(log.failure.site, /api-route-boundary\.test\.mjs:\d+:\d+$/);
  assert.equal(lines[0].includes("never-log-this"), false);
});

test("describing a failure tolerates values that are not errors", () => {
  for (const value of [undefined, null, "text", 7, { stack: 3, code: {} }]) {
    const described = describeFailure(value);
    assert.equal(typeof described.name, "string");
    assert.equal(described.site, null);
    assert.equal(described.code, null);
    assert.deepEqual(described.labels, []);
  }
  assert.equal(describeFailure(new Error("x")).name, "Error");
});

test("a mapped public error carries no failure descriptor", async () => {
  const lines = [];
  await runApiRoute(
    new Request("https://habi.test/api/private"),
    "api.private",
    async () => {
      throw new HabiApiError("NOT_FOUND");
    },
    (line) => lines.push(line),
  );
  assert.equal(Object.hasOwn(JSON.parse(lines[0]), "failure"), false);
});

test("a slow request is logged with its duration and nothing else", async () => {
  const lines = [];
  const response = await runApiRoute(
    new Request("https://habi.test/api/v1/worker/jobs/secret-job/context"),
    "worker.job.context",
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return Response.json({ private: "never-log-this" });
    },
    (line, level) => lines.push({ line, level }),
    { HG_SLOW_API_MS: "10" },
  );

  assert.equal(response.status, 200);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, "warn");
  const entry = JSON.parse(lines[0].line);
  assert.deepEqual(Object.keys(entry).sort(), [
    "durationMs",
    "event",
    "operation",
    "requestId",
    "status",
  ]);
  assert.equal(entry.event, "habi.api.slow");
  assert.equal(entry.operation, "worker.job.context");
  assert.equal(entry.status, 200);
  assert.equal(entry.requestId, response.headers.get("x-request-id"));
  assert.ok(entry.durationMs >= 10);
  assert.doesNotMatch(lines[0].line, /never-log-this|secret-job/);
});

test("a slow failing request is logged once more as slow, and fast or misconfigured thresholds stay quiet", async () => {
  const slowFailure = [];
  await runApiRoute(
    new Request("https://habi.test/api/v1/me"),
    "me.read",
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new HabiApiError("NOT_FOUND");
    },
    (line) => slowFailure.push(JSON.parse(line).event),
    { HG_SLOW_API_MS: "5" },
  );
  assert.deepEqual(slowFailure, ["habi.api.error", "habi.api.slow"]);

  for (const HG_SLOW_API_MS of [undefined, "not-a-number", "0", "-5"]) {
    const quiet = [];
    await runApiRoute(
      new Request("https://habi.test/api/health"),
      "api.health",
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return Response.json({ ok: true });
      },
      (line) => quiet.push(line),
      { HG_SLOW_API_MS },
    );
    assert.deepEqual(
      quiet,
      [],
      `threshold ${HG_SLOW_API_MS} must fall back to 3000 ms`,
    );
  }
});

test("a broken database connection answers a retryable 503 and still logs what failed", async () => {
  for (const name of [
    "MongoNetworkError",
    "MongoNetworkTimeoutError",
    "MongoServerSelectionError",
    "MongoWaitQueueTimeoutError",
    "MongoPoolClearedError",
  ]) {
    const failure = new { [name]: class extends Error {} }[name](
      "never-log-this",
    );
    Object.defineProperty(failure, "name", { value: name });
    const lines = [];
    const response = await runApiRoute(
      new Request("https://habi.test/api/v1/me"),
      "me.read",
      async () => {
        throw failure;
      },
      (line, level) => lines.push({ line, level }),
    );
    assert.equal(response.status, 503, name);
    assert.equal(response.headers.get("retry-after"), "2", name);
    const body = await response.json();
    assert.equal(body.code, "DEPENDENCY_UNAVAILABLE", name);
    assert.equal(body.retryAfter, 2, name);
    assert.equal(lines.length, 1, name);
    assert.equal(lines[0].level, "error", name);
    const entry = JSON.parse(lines[0].line);
    assert.equal(entry.code, "DEPENDENCY_UNAVAILABLE", name);
    assert.equal(entry.failure.name, name, name);
    assert.doesNotMatch(lines[0].line, /never-log-this/, name);
  }
});

test("a transaction asking to be retried is transient and other database errors stay internal", async () => {
  const transaction = Object.assign(new Error("never-log-this"), {
    errorLabels: ["TransientTransactionError"],
  });
  assert.equal(isTransientDatabaseFailure(transaction), true);

  const duplicate = Object.assign(new Error("never-log-this"), {
    name: "MongoServerError",
    code: 11000,
  });
  for (const unexpected of [
    duplicate,
    new Error("plain"),
    new TypeError("typed"),
    null,
    undefined,
    "text",
    { name: "MongoNetworkErrorLookalike" },
  ]) {
    assert.equal(isTransientDatabaseFailure(unexpected), false);
  }

  const response = await runApiRoute(
    new Request("https://habi.test/api/v1/me"),
    "me.read",
    async () => {
      throw duplicate;
    },
    () => {},
  );
  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, "INTERNAL_ERROR");
});
