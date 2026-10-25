import {
  AUTH_TRANSACTION_COOKIE,
  createLoginTransaction,
  persistLoginTransaction,
} from "./login-transaction.mjs";
import { buildAuthorizationRedirect, loadOidcDiscovery } from "./sso-oidc.mjs";
import { HabiApiError } from "../api/error-response.mjs";

function readCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() !== name) continue;
    const value = entry.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  return null;
}

export function createLoginHandler({
  db,
  config,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  if (!db || !config || typeof fetchImpl !== "function") {
    throw new Error("AUTH_LOGIN_HANDLER_CONFIG_INVALID");
  }

  return async function handleLogin(request) {
    if (request.method !== "GET") throw new HabiApiError("INVALID_INPUT");
    const url = new URL(request.url);
    const transaction = createLoginTransaction({
      returnTo: url.searchParams.get("returnTo") ?? "/",
      binding: readCookie(request, AUTH_TRANSACTION_COOKIE) ?? undefined,
      now: now(),
    });

    let discovery;
    try {
      discovery = await loadOidcDiscovery(config.issuer, fetchImpl);
    } catch {
      throw new HabiApiError("DEPENDENCY_UNAVAILABLE", { retryAfter: 5 });
    }

    await persistLoginTransaction(
      db.collection("auth_transactions"),
      transaction.document,
    );

    const location = buildAuthorizationRedirect(discovery, {
      ...config,
      ...transaction,
    });
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: location,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Set-Cookie": `${AUTH_TRANSACTION_COOKIE}=${transaction.binding}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      },
    });
    return response;
  };
}
