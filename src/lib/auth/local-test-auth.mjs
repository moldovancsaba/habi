import { randomBytes } from "node:crypto";
import { SYNTHETIC_TEST_IDENTITIES } from "../database/seed.mjs";
import { validateRuntimeConfig } from "../runtime-config.mjs";

export const LOCAL_TEST_SESSION_COOKIE = "habi_test_session";

const runtime = globalThis;
if (!runtime._habiLocalTestHmacKey) {
  runtime._habiLocalTestHmacKey = randomBytes(32).toString("base64url");
}

export function localTestHmacKey() {
  return runtime._habiLocalTestHmacKey;
}

export function localSyntheticTestRequestStatus(request, env = process.env) {
  let config;
  try {
    config = validateRuntimeConfig(env);
  } catch {
    return "CONFIG_INVALID";
  }
  if (!config.localTestMode) return "CONFIG_DISABLED";
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(host)) {
    return "NONLOCAL_HOST";
  }
  const appOrigin = new URL(config.appOrigin);
  if (url.protocol !== appOrigin.protocol || url.port !== appOrigin.port)
    return "ORIGIN_MISMATCH";
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("origin") !== config.appOrigin)
      return "REQUEST_ORIGIN_MISMATCH";
  }
  return "allowed";
}

export function requireLocalSyntheticTestRequest(request, env = process.env) {
  return localSyntheticTestRequestStatus(request, env) === "allowed";
}

export function findSyntheticTestIdentity(actorId) {
  return (
    SYNTHETIC_TEST_IDENTITIES.find((identity) => identity.id === actorId) ??
    null
  );
}

export function sessionCookie(token) {
  return `${LOCAL_TEST_SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`;
}

export function clearedTestSessionCookie() {
  return `${LOCAL_TEST_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
