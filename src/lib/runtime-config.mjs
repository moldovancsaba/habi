const CLOUD_REQUIRED = [
  "HG_ATLAS_URI",
  "HG_ATLAS_DATABASE",
  "HG_SSO_ISSUER",
  "HG_SSO_CLIENT_ID",
  "HG_SSO_CLIENT_SECRET",
  "HG_SSO_REDIRECT_URI",
  "HG_SESSION_HMAC_KEY",
  "HG_REFRESH_ENCRYPTION_KEY",
  "HG_CURSOR_HMAC_KEY",
  "HG_WORKER_SERVICE_ID",
  "HG_WORKER_BEARER_SHA256",
];

const HOSTED_KEYS = [
  "HG_ATLAS_URI",
  "HG_ATLAS_DATABASE",
  "HG_SSO_ISSUER",
  "HG_SSO_CLIENT_ID",
  "HG_SSO_CLIENT_SECRET",
  "HG_SSO_REDIRECT_URI",
  "HG_SESSION_HMAC_KEY",
  "HG_REFRESH_ENCRYPTION_KEY",
  "HG_CURSOR_HMAC_KEY",
  "HG_WORKER_SERVICE_ID",
  "HG_WORKER_BEARER_SHA256",
];

const NON_WEB_KEYS = [
  "HG_CLOUD_API_ORIGIN",
  "HG_WORKER_CLIENT_ID",
  "HG_WORKER_CLIENT_SECRET",
  "HG_WORKER_SSO_TOKEN_ENDPOINT",
  "HG_HOST_LOCK_PATH",
  "HG_OLLAMA_ORIGIN",
  "HG_MODEL",
  "HG_MODEL_DIGEST",
  "HG_PROMPT_HASH",
  "HG_EXTERNAL_PROJECT",
  "HG_EXTERNAL_MODEL",
  "HG_EXTERNAL_API_KEY",
];

function parseUrl(value, name) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

export function validateRuntimeConfig(env) {
  const misplaced = NON_WEB_KEYS.filter((key) => env[key]);
  if (misplaced.length) {
    throw new Error(
      `Worker/provider configuration is forbidden in the web runtime: ${misplaced.join(", ")}`,
    );
  }

  const environment = env.HG_ENVIRONMENT;
  if (!new Set(["development", "test", "production"]).has(environment)) {
    throw new Error("HG_ENVIRONMENT must be development, test, or production");
  }

  const appOrigin = parseUrl(env.HG_APP_ORIGIN ?? "", "HG_APP_ORIGIN");
  if (appOrigin.origin !== env.HG_APP_ORIGIN) {
    throw new Error(
      "HG_APP_ORIGIN must not contain a path, query, or fragment",
    );
  }

  if (env.HG_EXTERNAL_ENABLED !== "false") {
    throw new Error("External AI is disabled until policy and budget approval");
  }

  if (environment === "test" && env.HG_LOCAL_TEST_MODE === "true") {
    if (env.HG_SYNTHETIC_DATA_ONLY !== "true") {
      throw new Error("Local test mode requires synthetic-only data");
    }
    if (
      appOrigin.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(appOrigin.hostname)
    ) {
      throw new Error(
        "Local test mode requires a localhost application origin",
      );
    }
    const localWorkerAuth = new Set([
      "HG_WORKER_SERVICE_ID",
      "HG_WORKER_BEARER_SHA256",
    ]);
    const accidentallyConfigured = HOSTED_KEYS.filter(
      (key) => env[key] && !localWorkerAuth.has(key),
    );
    if (accidentallyConfigured.length) {
      throw new Error(
        `Local test mode must not receive hosted secrets: ${accidentallyConfigured.join(", ")}`,
      );
    }
    const testDatabase = parseUrl(
      env.HABI_TEST_MONGODB_URI ?? "",
      "HABI_TEST_MONGODB_URI",
    );
    const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (
      !["mongodb:", "mongodb+srv:"].includes(testDatabase.protocol) ||
      !allowedHosts.has(testDatabase.hostname) ||
      !env.HABI_TEST_MONGODB_DATABASE?.endsWith("_test") ||
      env.HG_MIGRATION_ALLOW_LOCAL_TEST_DB !== "true"
    ) {
      throw new Error(
        "Local test mode requires an explicit localhost _test database",
      );
    }
    return Object.freeze({
      environment,
      appOrigin: appOrigin.origin,
      syntheticOnly: true,
      localTestMode: true,
    });
  }

  if (environment === "development") {
    if (env.HG_SYNTHETIC_DATA_ONLY !== "true") {
      throw new Error("Development requires HG_SYNTHETIC_DATA_ONLY=true");
    }
    if (
      appOrigin.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(appOrigin.hostname)
    ) {
      throw new Error("Synthetic development must use a localhost origin");
    }
    const accidentallyConfigured = HOSTED_KEYS.filter((key) => env[key]);
    if (accidentallyConfigured.length) {
      throw new Error(
        `Synthetic development must not receive service secrets: ${accidentallyConfigured.join(", ")}`,
      );
    }
    return Object.freeze({
      environment,
      appOrigin: appOrigin.origin,
      syntheticOnly: true,
    });
  }

  if (env.HG_SYNTHETIC_DATA_ONLY !== "false") {
    throw new Error(`${environment} requires HG_SYNTHETIC_DATA_ONLY=false`);
  }
  if (appOrigin.protocol !== "https:") {
    throw new Error(`${environment} requires an HTTPS HG_APP_ORIGIN`);
  }

  const missing = CLOUD_REQUIRED.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error(
      `Missing required runtime configuration: ${missing.join(", ")}`,
    );
  }

  const atlas = parseUrl(env.HG_ATLAS_URI, "HG_ATLAS_URI");
  if (
    !["mongodb:", "mongodb+srv:"].includes(atlas.protocol) ||
    !env.HG_ATLAS_DATABASE.trim()
  ) {
    throw new Error("Atlas URI or database name is invalid");
  }

  const issuer = parseUrl(env.HG_SSO_ISSUER, "HG_SSO_ISSUER");
  const callback = parseUrl(env.HG_SSO_REDIRECT_URI, "HG_SSO_REDIRECT_URI");
  if (issuer.protocol !== "https:" || callback.protocol !== "https:") {
    throw new Error("SSO issuer and callback must use HTTPS");
  }
  if (
    callback.origin !== appOrigin.origin ||
    callback.pathname !== "/auth/callback" ||
    callback.search ||
    callback.hash
  ) {
    throw new Error(
      "HG_SSO_REDIRECT_URI must match the application /auth/callback route",
    );
  }

  for (const key of [
    "HG_SESSION_HMAC_KEY",
    "HG_REFRESH_ENCRYPTION_KEY",
    "HG_CURSOR_HMAC_KEY",
  ]) {
    if (Buffer.byteLength(env[key], "utf8") < 32) {
      throw new Error(`${key} must contain at least 32 bytes`);
    }
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(env.HG_WORKER_SERVICE_ID ?? "") ||
    !/^[a-f0-9]{64}$/.test(env.HG_WORKER_BEARER_SHA256 ?? "")
  ) {
    throw new Error("Worker service authentication is invalid");
  }

  return Object.freeze({
    environment,
    appOrigin: appOrigin.origin,
    syntheticOnly: false,
    localTestMode: false,
  });
}

export function validateRuntimeStartup(env) {
  if (env.NEXT_PHASE === "phase-production-build") return;
  // An unconfigured Vercel Preview may render only the public, disabled landing
  // page. API routes remain fail-closed until a complete Habi environment exists.
  if (env.VERCEL_ENV === "preview" && !env.HG_ENVIRONMENT) return;
  validateRuntimeConfig(env);
}
