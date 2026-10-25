import { authenticateHabiRequest } from "./session-guard.mjs";
import {
  LOCAL_TEST_SESSION_COOKIE,
  localTestHmacKey,
} from "./local-test-auth.mjs";
import { validateRuntimeConfig } from "../runtime-config.mjs";

export function runtimeSessionSettings() {
  const config = validateRuntimeConfig(process.env);
  const localTest = config.localTestMode === true;
  return Object.freeze({
    cookieName: localTest ? LOCAL_TEST_SESSION_COOKIE : "__Host-hg_session",
    hmacKey: localTest ? localTestHmacKey() : process.env.HG_SESSION_HMAC_KEY,
    expectedOrigin: config.appOrigin,
  });
}

export function runtimeCursorHmacKey() {
  const config = validateRuntimeConfig(process.env);
  return config.localTestMode
    ? localTestHmacKey()
    : process.env.HG_CURSOR_HMAC_KEY;
}

export async function authenticateRuntimeRequest(db, request, { now } = {}) {
  const settings = runtimeSessionSettings();
  return authenticateHabiRequest(db, request, {
    ...settings,
    ...(now ? { now } : {}),
  });
}
