import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as verifySignature,
} from "node:crypto";

const REQUEST_TIMEOUT_MS = 5_000;
const SKEW_SECONDS = 60;

function timeoutSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function trustedHttpsUrl(value, issuerOrigin) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== issuerOrigin) {
    throw new Error("SSO_DISCOVERY_UNTRUSTED_ENDPOINT");
  }
  return url.toString();
}

export async function loadOidcDiscovery(issuer, fetchImpl = fetch) {
  const normalizedIssuer = new URL(issuer);
  if (
    normalizedIssuer.protocol !== "https:" ||
    normalizedIssuer.search ||
    normalizedIssuer.hash
  ) {
    throw new Error("SSO_ISSUER_INVALID");
  }
  normalizedIssuer.pathname = normalizedIssuer.pathname.replace(/\/$/, "");
  const issuerUrl = normalizedIssuer.toString().replace(/\/$/, "");
  const response = await fetchImpl(
    new URL("/.well-known/openid-configuration", issuerUrl),
    {
      cache: "no-store",
      signal: timeoutSignal(),
    },
  );
  if (!response.ok) throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
  const body = await response.json();
  if (!body || body.issuer !== issuerUrl || typeof body.jwks_uri !== "string") {
    throw new Error("SSO_DISCOVERY_INVALID");
  }
  const issuerOrigin = new URL(issuerUrl).origin;
  const required = [
    "authorization_endpoint",
    "token_endpoint",
    "userinfo_endpoint",
    "jwks_uri",
  ];
  const endpoints = Object.fromEntries(
    required.map((key) => {
      if (typeof body[key] !== "string")
        throw new Error("SSO_DISCOVERY_INVALID");
      return [key, trustedHttpsUrl(body[key], issuerOrigin)];
    }),
  );
  if (
    !Array.isArray(body.id_token_signing_alg_values_supported) ||
    !body.id_token_signing_alg_values_supported.includes("RS256")
  ) {
    throw new Error("SSO_DISCOVERY_ALGORITHM_UNSUPPORTED");
  }
  return Object.freeze({ issuer: issuerUrl, ...endpoints });
}

export function buildAuthorizationRedirect(
  discovery,
  { clientId, redirectUri, state, nonce, verifier },
) {
  const authorize = new URL(discovery.authorization_endpoint);
  const challenge = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }))
    authorize.searchParams.set(key, value);
  return authorize.toString();
}

export async function exchangeAuthorizationCode(
  discovery,
  config,
  { code, verifier },
  fetchImpl = fetch,
  { requireRefreshToken = true } = {},
) {
  const response = await fetchImpl(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
    cache: "no-store",
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error("SSO_CODE_EXCHANGE_REJECTED");
  const tokens = await response.json();
  if (
    typeof tokens?.id_token !== "string" ||
    typeof tokens?.access_token !== "string" ||
    (requireRefreshToken &&
      (typeof tokens?.refresh_token !== "string" || !tokens.refresh_token)) ||
    !Number.isSafeInteger(tokens?.expires_in) ||
    tokens.expires_in <= 0
  ) {
    throw new Error("SSO_TOKEN_RESPONSE_INVALID");
  }
  return Object.freeze({
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresIn: tokens.expires_in,
  });
}

export async function refreshSsoAccessToken(
  discovery,
  config,
  refreshToken,
  fetchImpl = fetch,
) {
  if (typeof refreshToken !== "string" || !refreshToken) {
    throw new Error("SSO_REFRESH_TOKEN_INVALID");
  }
  let response;
  try {
    response = await fetchImpl(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      cache: "no-store",
      signal: timeoutSignal(),
    });
  } catch (error) {
    if (
      error instanceof TypeError ||
      error?.name === "AbortError" ||
      error?.name === "TimeoutError"
    ) {
      throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(
      response.status >= 500
        ? "SSO_DEPENDENCY_UNAVAILABLE"
        : "SSO_REFRESH_REJECTED",
    );
  }
  const tokens = await response.json();
  if (
    typeof tokens?.access_token !== "string" ||
    !tokens.access_token ||
    !Number.isSafeInteger(tokens?.expires_in) ||
    tokens.expires_in <= 0 ||
    (tokens.refresh_token !== undefined &&
      (typeof tokens.refresh_token !== "string" || !tokens.refresh_token))
  ) {
    throw new Error("SSO_TOKEN_RESPONSE_INVALID");
  }
  return Object.freeze({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresIn: tokens.expires_in,
  });
}

export async function fetchSigningKeys(discovery, fetchImpl = fetch) {
  const response = await fetchImpl(discovery.jwks_uri, {
    cache: "no-store",
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error("SSO_JWKS_UNAVAILABLE");
  const body = await response.json();
  if (!Array.isArray(body?.keys)) throw new Error("SSO_JWKS_INVALID");
  return body.keys;
}

export function verifyIdToken(
  idToken,
  { keys, issuer, clientId, nonce, nowSeconds = Math.floor(Date.now() / 1000) },
) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    );
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const jwk = keys.find(
      (key) =>
        key.kid === header.kid &&
        key.kty === "RSA" &&
        (!key.alg || key.alg === "RS256") &&
        (!key.use || key.use === "sig"),
    );
    if (!jwk) return null;
    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], "base64url");
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    if (!verifySignature("RSA-SHA256", signingInput, publicKey, signature))
      return null;
    const claims = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== issuer || !audiences.includes(clientId)) return null;
    if (audiences.length > 1 && claims.azp !== clientId) return null;
    if (
      typeof claims.sub !== "string" ||
      claims.sub.length < 1 ||
      claims.sub.length > 300
    )
      return null;
    if (
      typeof claims.exp !== "number" ||
      claims.exp <= nowSeconds - SKEW_SECONDS
    )
      return null;
    if (
      typeof claims.iat !== "number" ||
      claims.iat > nowSeconds + SKEW_SECONDS
    )
      return null;
    if (claims.nonce !== nonce) return null;
    return Object.freeze({
      issuer: claims.iss,
      subject: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      name: typeof claims.name === "string" ? claims.name : null,
      emailVerified: claims.email_verified === true,
    });
  } catch {
    return null;
  }
}

/**
 * Verify an ID token using the cached key set, refreshing once only when its
 * header names a key that is not present. This handles SSO signing-key rotation
 * without turning ordinary invalid tokens into repeated network requests.
 */
export async function verifyIdTokenWithKeyRefresh(
  idToken,
  options,
  discovery,
  fetchImpl = fetch,
) {
  let header;
  try {
    const encodedHeader = idToken.split(".", 1)[0];
    header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8"),
    );
  } catch {
    return null;
  }
  if (header?.alg !== "RS256" || typeof header.kid !== "string") return null;

  const hasSigningKey = (keys) =>
    Array.isArray(keys) &&
    keys.some(
      (key) =>
        key.kid === header.kid &&
        key.kty === "RSA" &&
        (!key.alg || key.alg === "RS256") &&
        (!key.use || key.use === "sig"),
    );
  if (hasSigningKey(options.keys)) return verifyIdToken(idToken, options);

  const refreshedKeys = await fetchSigningKeys(discovery, fetchImpl);
  if (!hasSigningKey(refreshedKeys)) return null;
  return verifyIdToken(idToken, { ...options, keys: refreshedKeys });
}

export async function fetchSsoUserinfo(
  discovery,
  accessToken,
  fetchImpl = fetch,
) {
  const response = await fetchImpl(discovery.userinfo_endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error("SSO_USERINFO_REJECTED");
  const info = await response.json();
  if (
    typeof info?.sub !== "string" ||
    !info.sub ||
    typeof info.email !== "string"
  ) {
    throw new Error("SSO_USERINFO_INVALID");
  }
  return Object.freeze({
    subject: info.sub,
    email: info.email,
    name: typeof info.name === "string" ? info.name : null,
    emailVerified: info.email_verified === true,
  });
}

export async function fetchAppPermission(
  discovery,
  { subject, clientId, accessToken },
  fetchImpl = fetch,
) {
  const endpoint = new URL(
    `/api/users/${encodeURIComponent(subject)}/apps/${encodeURIComponent(clientId)}/permissions`,
    discovery.issuer,
  );
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: timeoutSignal(),
    });
  } catch (error) {
    if (
      error instanceof TypeError ||
      error?.name === "AbortError" ||
      error?.name === "TimeoutError"
    ) {
      throw new Error("SSO_DEPENDENCY_UNAVAILABLE");
    }
    throw error;
  }
  if (!response.ok)
    throw new Error(
      response.status >= 500
        ? "SSO_DEPENDENCY_UNAVAILABLE"
        : "SSO_PERMISSION_DENIED",
    );
  const permission = await response.json();
  if (
    permission?.status !== "approved" ||
    !["user", "admin"].includes(permission?.role)
  ) {
    throw new Error("SSO_PERMISSION_DENIED");
  }
  return Object.freeze({ status: permission.status, role: permission.role });
}

export function createOpaqueSecret() {
  return randomBytes(32).toString("base64url");
}
