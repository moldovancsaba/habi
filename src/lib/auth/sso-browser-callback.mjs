import { HabiApiError } from "../api/error-response.mjs";
import {
  createSsoOwnerSession,
  consumeLegacyOwnerHandoff,
  readCookie,
  resolveSsoOwnerLink,
  SSO_OWNER_HANDOFF_COOKIE,
  expiredSsoOwnerHandoffCookie,
  ssoOwnerSessionCookie,
} from "./browser-sso-session.mjs";
import {
  AUTH_TRANSACTION_COOKIE,
  consumeLoginTransaction,
} from "./login-transaction.mjs";
import {
  exchangeAuthorizationCode,
  fetchAppPermission,
  fetchSigningKeys,
  fetchSsoUserinfo,
  loadOidcDiscovery,
  verifyIdTokenWithKeyRefresh,
} from "./sso-oidc.mjs";

function expiredCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function failRedirect(request) {
  const response = new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/?signin=failed", request.url).toString(),
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
    if (!transaction) return failRedirect(request);
    if (url.searchParams.has("error") || !url.searchParams.get("code")) {
      return failRedirect(request);
    }

    let claims;
    let userinfo;
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
      if (!claims) return failRedirect(request);
      userinfo = await readUserinfo(discovery, tokens.accessToken, fetchImpl);
      if (userinfo.subject !== claims.subject) return failRedirect(request);
      await readPermission(
        discovery,
        {
          subject: claims.subject,
          clientId: config.clientId,
          accessToken: tokens.accessToken,
        },
        fetchImpl,
      );
    } catch {
      return failRedirect(request);
    }

    const handoffBinding = readCookie(
      request.headers.get("cookie"),
      SSO_OWNER_HANDOFF_COOKIE,
    );
    let handoff = null;
    try {
      if (handoffBinding) {
        handoff = await consumeLegacyOwnerHandoff(
          db.collection("habi_sso_owner_handoffs"),
          handoffBinding,
          hmacKey,
          now(),
        );
      }
    } catch {
      return failRedirect(request);
    }
    const legacyOwnerHash = handoff?.ownerHash ?? null;
    let link;
    try {
      link = await resolveSsoOwnerLink(db.collection("habi_sso_owner_links"), {
        issuer: claims.issuer,
        subject: claims.subject,
        legacyOwnerHash,
        hmacKey,
        now: now(),
      });
    } catch {
      return failRedirect(request);
    }

    const issued = await createSsoOwnerSession(
      db.collection("habi_sso_owner_sessions"),
      {
        identityHash: link.identityHash,
        ownerHash: link.ownerHash,
        hmacKey,
        now: now(),
      },
    );
    const target = new URL(transaction.returnTo, url.origin);
    if (legacyOwnerHash) target.searchParams.set("linked", "1");
    const response = new Response(null, {
      status: 303,
      headers: {
        Location: target.toString(),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
    response.headers.append("Set-Cookie", ssoOwnerSessionCookie(issued.token));
    response.headers.append(
      "Set-Cookie",
      expiredCookie(AUTH_TRANSACTION_COOKIE),
    );
    response.headers.append("Set-Cookie", expiredSsoOwnerHandoffCookie());
    if (legacyOwnerHash)
      response.headers.append(
        "Set-Cookie",
        expiredCookie("__Host-habi-session"),
      );
    return response;
  };
}
