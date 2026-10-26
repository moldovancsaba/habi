import { HabiApiError } from "../api/error-response.mjs";
import {
  createSsoOwnerSession,
  readCookie,
  resolveSsoOwnerLink,
  expiredSsoOwnerHandoffCookie,
  ssoOwnerSessionCookie,
} from "./browser-sso-session.mjs";
import {
  AUTH_TRANSACTION_COOKIE,
  consumeLoginTransaction,
  safeReturnTo,
} from "./login-transaction.mjs";
import {
  exchangeAuthorizationCode,
  fetchAppPermission,
  fetchSigningKeys,
  fetchSsoUserinfo,
  loadOidcDiscovery,
  verifyIdTokenWithKeyRefresh,
} from "./sso-oidc.mjs";
import {
  adminPermissionCookie,
  createAdminPermissionToken,
} from "./admin-permission.mjs";

function expiredCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function failRedirect(request, reasonCode, onFailure, returnTo = "/") {
  onFailure?.(reasonCode);
  const target = new URL(returnTo, request.url);
  target.searchParams.set("signin", "failed");
  target.searchParams.set("reason", reasonCode);
  const response = new Response(null, {
    status: 303,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
  response.headers.append("Set-Cookie", expiredCookie(AUTH_TRANSACTION_COOKIE));
  response.headers.append("Set-Cookie", expiredSsoOwnerHandoffCookie());
  return response;
}

export function createSsoBrowserCallbackHandler({
  db,
  config,
  hmacKey,
  fetchImpl = fetch,
  oidc = {},
  prepareSession = async () => {},
  onFailure,
  now = () => new Date(),
}) {
  if (!db || !config || typeof hmacKey !== "string") {
    throw new Error("SSO_BROWSER_CALLBACK_CONFIG_INVALID");
  }

  return async function handleCallback(request) {
    if (request.method !== "GET") throw new HabiApiError("INVALID_INPUT");
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const binding = readCookie(
      request.headers.get("cookie"),
      AUTH_TRANSACTION_COOKIE,
    );
    const transaction = await consumeLoginTransaction(
      db.collection("auth_transactions"),
      { state, binding, now: now() },
    );
    if (!transaction)
      return failRedirect(request, "LOGIN_TRANSACTION_INVALID", onFailure);
    if (url.searchParams.has("error") || !url.searchParams.get("code")) {
      return failRedirect(
        request,
        "PROVIDER_DENIED",
        onFailure,
        safeReturnTo(transaction.returnTo),
      );
    }

    let claims;
    let userinfo;
    let permission;
    try {
      const discover = oidc.loadOidcDiscovery ?? loadOidcDiscovery;
      const exchange =
        oidc.exchangeAuthorizationCode ?? exchangeAuthorizationCode;
      const readKeys = oidc.fetchSigningKeys ?? fetchSigningKeys;
      const verify =
        oidc.verifyIdTokenWithKeyRefresh ?? verifyIdTokenWithKeyRefresh;
      const readUserinfo = oidc.fetchSsoUserinfo ?? fetchSsoUserinfo;
      const readPermission = oidc.fetchAppPermission ?? fetchAppPermission;
      const discovery = await discover(config.issuer, fetchImpl);
      const tokens = await exchange(
        discovery,
        config,
        {
          code: url.searchParams.get("code"),
          verifier: transaction.pkceVerifier,
        },
        fetchImpl,
        { requireRefreshToken: false },
      );
      const keys = await readKeys(discovery, fetchImpl);
      claims = await verify(
        tokens.idToken,
        {
          keys,
          issuer: config.issuer,
          clientId: config.clientId,
          nonce: transaction.nonce,
          nowSeconds: Math.floor(now().getTime() / 1000),
        },
        discovery,
        fetchImpl,
      );
      if (!claims)
        return failRedirect(
          request,
          "ID_TOKEN_INVALID",
          onFailure,
          safeReturnTo(transaction.returnTo),
        );
      userinfo = await readUserinfo(discovery, tokens.accessToken, fetchImpl);
      if (userinfo.subject !== claims.subject)
        return failRedirect(
          request,
          "USERINFO_SUBJECT_MISMATCH",
          onFailure,
          safeReturnTo(transaction.returnTo),
        );
      permission = await readPermission(
        discovery,
        {
          subject: claims.subject,
          clientId: config.clientId,
          accessToken: tokens.accessToken,
        },
        fetchImpl,
      );
    } catch (error) {
      const reasonCode =
        error?.message === "SSO_PERMISSION_DENIED"
          ? "APP_PERMISSION_DENIED"
          : error?.message === "SSO_DEPENDENCY_UNAVAILABLE"
            ? "SSO_DEPENDENCY_UNAVAILABLE"
            : "OIDC_VALIDATION_FAILED";
      return failRedirect(
        request,
        reasonCode,
        onFailure,
        safeReturnTo(transaction.returnTo),
      );
    }

    await prepareSession();
    let link;
    try {
      link = await resolveSsoOwnerLink(db.collection("habi_sso_owner_links"), {
        issuer: claims.issuer,
        subject: claims.subject,
        hmacKey,
        now: now(),
      });
    } catch {
      return failRedirect(
        request,
        "OWNER_IDENTITY_CONFLICT",
        onFailure,
        safeReturnTo(transaction.returnTo),
      );
    }

    const issued = await createSsoOwnerSession(
      db.collection("habi_sso_owner_sessions"),
      {
        identityHash: link.identityHash,
        ownerHash: link.ownerHash,
        issuer: claims.issuer,
        subject: claims.subject,
        permissionRole: permission.role,
        hmacKey,
        now: now(),
      },
    );
    const target = new URL(transaction.returnTo, url.origin);
    if (permission?.role === "admin" && target.pathname === "/") {
      target.pathname = "/admin";
      target.search = "";
      target.hash = "";
    }
    const response = new Response(null, {
      status: 303,
      headers: {
        Location: target.toString(),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
    response.headers.append("Set-Cookie", ssoOwnerSessionCookie(issued.token));
    const adminToken = createAdminPermissionToken(
      issued.session,
      permission?.role,
      hmacKey,
    );
    if (adminToken)
      response.headers.append("Set-Cookie", adminPermissionCookie(adminToken));
    response.headers.append(
      "Set-Cookie",
      expiredCookie(AUTH_TRANSACTION_COOKIE),
    );
    response.headers.append("Set-Cookie", expiredSsoOwnerHandoffCookie());
    response.headers.append("Set-Cookie", expiredSsoOwnerHandoffCookie());
    response.headers.append("Set-Cookie", expiredCookie("__Host-habi-session"));
    return response;
  };
}
