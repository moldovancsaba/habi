import { createHash } from "node:crypto";

export const PERMISSION_CACHE_MAX_AGE_MS = 60_000;

function cacheKey({ issuer, subject, clientId }) {
  if (
    typeof issuer !== "string" ||
    !issuer ||
    typeof subject !== "string" ||
    !subject ||
    typeof clientId !== "string" ||
    !clientId
  ) {
    throw new Error("SSO_PERMISSION_SCOPE_INVALID");
  }
  return createHash("sha256")
    .update(`${issuer}\0${subject}\0${clientId}`, "utf8")
    .digest("hex");
}

export function createAppPermissionCache() {
  const entries = new Map();
  return Object.freeze({
    get(key) {
      return entries.get(key) ?? null;
    },
    set(key, entry) {
      entries.delete(key);
      entries.set(key, Object.freeze({ ...entry }));
      while (entries.size > 256) entries.delete(entries.keys().next().value);
    },
    delete(key) {
      entries.delete(key);
    },
  });
}

function isDependencyUnavailable(error) {
  return (
    error?.message === "SSO_DEPENDENCY_UNAVAILABLE" ||
    error?.name === "AbortError" ||
    error?.name === "TimeoutError"
  );
}

function isApprovedPermission(value) {
  return value?.status === "approved" && ["user", "admin"].includes(value.role);
}

/**
 * Check permission against SSO for each operation. During an SSO outage only,
 * an approved check no older than 60 seconds may sustain an ordinary read.
 * Writes and other operations always fail closed when a fresh check is not
 * available. This memory cache is process-local and is never authoritative.
 */
export async function checkAppPermissionWithOutageGrace({
  issuer,
  subject,
  clientId,
  operation,
  cache,
  checkPermission,
  now = Date.now(),
}) {
  if (
    !["read", "write", "publish", "worker_context"].includes(operation) ||
    !cache ||
    typeof cache.get !== "function" ||
    typeof cache.set !== "function" ||
    typeof cache.delete !== "function" ||
    typeof checkPermission !== "function" ||
    !Number.isSafeInteger(now) ||
    now < 0
  ) {
    throw new Error("SSO_PERMISSION_CHECK_INVALID");
  }

  const key = cacheKey({ issuer, subject, clientId });
  try {
    const permission = await checkPermission();
    if (!isApprovedPermission(permission)) {
      cache.delete(key);
      throw new Error("SSO_PERMISSION_DENIED");
    }
    const entry = {
      status: "approved",
      role: permission.role,
      checkedAt: now,
    };
    cache.set(key, entry);
    return Object.freeze({ ...entry, stale: false });
  } catch (error) {
    if (error?.message === "SSO_PERMISSION_DENIED") throw error;
    if (!isDependencyUnavailable(error)) {
      throw new Error("SSO_PERMISSION_CHECK_FAILED");
    }

    const cached = cache.get(key);
    const age = cached ? now - cached.checkedAt : Number.POSITIVE_INFINITY;
    if (
      operation === "read" &&
      cached?.status === "approved" &&
      ["user", "admin"].includes(cached.role) &&
      Number.isSafeInteger(cached.checkedAt) &&
      age >= 0 &&
      age <= PERMISSION_CACHE_MAX_AGE_MS
    ) {
      return Object.freeze({ ...cached, stale: true });
    }
    throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
  }
}
