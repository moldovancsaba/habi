import { createHash, randomBytes } from "node:crypto";

const AUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
export const AUTH_TRANSACTION_COOKIE = "__Host-hg_auth_txn";

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

export function safeReturnTo(value) {
  if (typeof value !== "string" || value.length > 500) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";
  try {
    const parsed = new URL(value, "https://habi.invalid");
    if (parsed.origin !== "https://habi.invalid") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export function createLoginTransaction({
  returnTo = "/",
  binding = randomBytes(32).toString("base64url"),
  now = new Date(),
} = {}) {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  if (!/^[A-Za-z0-9_-]{43}$/.test(binding))
    throw new Error("AUTH_BROWSER_BINDING_INVALID");
  const expiresAt = new Date(now.getTime() + AUTH_TRANSACTION_TTL_MS);
  return Object.freeze({
    state,
    nonce,
    verifier,
    binding,
    expiresAt,
    document: {
      id: randomBytes(24).toString("base64url"),
      stateHash: sha256(state),
      browserBindingHash: sha256(binding),
      nonce,
      pkceVerifier: verifier,
      returnTo: safeReturnTo(returnTo),
      createdAt: now,
      expiresAt,
      consumedAt: null,
    },
  });
}

export function buildAuthorizeUrl(
  { issuer, clientId, redirectUri },
  transaction,
) {
  const base = new URL(issuer);
  if (base.protocol !== "https:") throw new Error("SSO_ISSUER_INVALID");
  const authorize = new URL("/api/oauth/authorize", base);
  const challenge = createHash("sha256")
    .update(transaction.verifier, "ascii")
    .digest("base64url");
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }))
    authorize.searchParams.set(key, value);
  return authorize.toString();
}

export async function persistLoginTransaction(collection, document) {
  const now = document.createdAt;
  await collection.updateMany(
    { browserBindingHash: document.browserBindingHash, consumedAt: null },
    { $set: { consumedAt: now } },
  );
  await collection.insertOne(document);
}

export async function consumeLoginTransaction(
  collection,
  { state, binding, now = new Date() },
) {
  if (typeof state !== "string" || typeof binding !== "string") return null;
  return collection.findOneAndUpdate(
    {
      stateHash: sha256(state),
      browserBindingHash: sha256(binding),
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { returnDocument: "after" },
  );
}

export function authTransactionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_TRANSACTION_TTL_MS / 1000,
  };
}
