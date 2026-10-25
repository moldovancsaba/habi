import assert from "node:assert/strict";
import test from "node:test";
import {
  checkAppPermissionWithOutageGrace,
  createAppPermissionCache,
  PERMISSION_CACHE_MAX_AGE_MS,
} from "../src/lib/auth/app-permission-cache.mjs";

const scope = {
  issuer: "https://sso.example",
  subject: "subject-1",
  clientId: "habi-client",
};

function check(cache, operation, checkPermission, now, scopeOverride = {}) {
  return checkAppPermissionWithOutageGrace({
    ...scope,
    ...scopeOverride,
    operation,
    cache,
    checkPermission,
    now,
  });
}

test("permission results are refreshed and scoped to issuer, subject, and client", async () => {
  const cache = createAppPermissionCache();
  let calls = 0;
  const allowed = await check(
    cache,
    "read",
    async () => {
      calls += 1;
      return { status: "approved", role: "user" };
    },
    1_000,
  );
  assert.deepEqual(allowed, {
    status: "approved",
    role: "user",
    checkedAt: 1_000,
    stale: false,
  });
  assert.equal(calls, 1);

  const offlineRead = await check(
    cache,
    "read",
    async () => {
      throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
    },
    1_000 + PERMISSION_CACHE_MAX_AGE_MS,
  );
  assert.equal(offlineRead.stale, true);
  assert.equal(offlineRead.role, "user");

  await assert.rejects(
    check(
      cache,
      "read",
      async () => {
        throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
      },
      1_001,
      { subject: "different-subject" },
    ),
    { message: "SSO_DEPENDENCY_UNAVAILABLE" },
  );

  await assert.rejects(
    check(
      cache,
      "read",
      async () => {
        throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
      },
      1_001 + PERMISSION_CACHE_MAX_AGE_MS,
    ),
    { message: "SSO_DEPENDENCY_UNAVAILABLE" },
  );
  await assert.rejects(
    check(
      cache,
      "read",
      async () => {
        throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
      },
      999,
    ),
    { message: "SSO_DEPENDENCY_UNAVAILABLE" },
  );
});

test("SSO outage never permits writes, publication, worker context, or unknown operations", async () => {
  const cache = createAppPermissionCache();
  await check(
    cache,
    "read",
    async () => ({ status: "approved", role: "admin" }),
    50_000,
  );
  for (const operation of ["write", "publish", "worker_context"]) {
    await assert.rejects(
      check(
        cache,
        operation,
        async () => {
          throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
        },
        50_001,
      ),
      { message: "SSO_DEPENDENCY_UNAVAILABLE" },
    );
  }
  await assert.rejects(
    check(
      cache,
      "unknown",
      async () => ({ status: "approved", role: "user" }),
      50_001,
    ),
    { message: "SSO_PERMISSION_CHECK_INVALID" },
  );
});

test("a fresh SSO denial invalidates cached approval and does not use outage grace", async () => {
  const cache = createAppPermissionCache();
  await check(
    cache,
    "read",
    async () => ({ status: "approved", role: "user" }),
    100_000,
  );
  await assert.rejects(
    check(
      cache,
      "read",
      async () => ({ status: "revoked", role: "user" }),
      100_001,
    ),
    { message: "SSO_PERMISSION_DENIED" },
  );
  await assert.rejects(
    check(
      cache,
      "read",
      async () => {
        throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
      },
      100_002,
    ),
    { message: "SSO_DEPENDENCY_UNAVAILABLE" },
  );
});

test("unexpected checker errors fail closed and do not serve cached approval", async () => {
  const cache = createAppPermissionCache();
  await check(
    cache,
    "read",
    async () => ({ status: "approved", role: "user" }),
    1_000,
  );
  await assert.rejects(
    check(
      cache,
      "read",
      async () => {
        throw new Error("programming bug");
      },
      1_001,
    ),
    { message: "SSO_PERMISSION_CHECK_FAILED" },
  );
});

test("the per-process cache is bounded to 256 entries", () => {
  const cache = createAppPermissionCache();
  for (let index = 0; index < 257; index += 1) {
    cache.set(`permission-${index}`, {
      status: "approved",
      role: "user",
      checkedAt: index,
    });
  }
  assert.equal(cache.get("permission-0"), null);
  assert.equal(cache.get("permission-256").status, "approved");
});
