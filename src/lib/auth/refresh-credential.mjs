import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const VERSION = 1;
const ALGORITHM = "A256GCM";

function credentialKey(keyMaterial) {
  if (typeof keyMaterial !== "string" || Buffer.byteLength(keyMaterial) < 32) {
    throw new Error("REFRESH_ENCRYPTION_KEY_INVALID");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(keyMaterial, "utf8"),
      Buffer.from("habi-session-credential-v1", "utf8"),
      Buffer.from("sso-token-encryption", "utf8"),
      32,
    ),
  );
}

function associatedData({ issuer, clientId, actorId, sessionId }, purpose) {
  let parsedIssuer;
  try {
    parsedIssuer = new URL(issuer);
  } catch {
    throw new Error("REFRESH_CREDENTIAL_SCOPE_INVALID");
  }
  if (
    parsedIssuer.protocol !== "https:" ||
    parsedIssuer.search ||
    parsedIssuer.hash ||
    typeof clientId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,299}$/.test(clientId) ||
    typeof actorId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(actorId) ||
    typeof sessionId !== "string" ||
    !/^[a-f0-9]{48}$/.test(sessionId) ||
    !["access", "refresh"].includes(purpose)
  ) {
    throw new Error("REFRESH_CREDENTIAL_SCOPE_INVALID");
  }
  return Buffer.from(
    JSON.stringify([
      parsedIssuer.toString().replace(/\/$/, ""),
      clientId,
      actorId,
      sessionId,
      purpose,
    ]),
    "utf8",
  );
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("REFRESH_CREDENTIAL_INVALID");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("REFRESH_CREDENTIAL_INVALID");
  }
  return decoded;
}

export function encryptSessionCredential(
  credential,
  purpose,
  scope,
  keyMaterial,
) {
  if (
    typeof credential !== "string" ||
    !credential ||
    Buffer.byteLength(credential, "utf8") > 16_384
  ) {
    throw new Error("SSO_CREDENTIAL_INVALID");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(keyMaterial), iv);
  cipher.setAAD(associatedData(scope, purpose));
  const ciphertext = Buffer.concat([
    cipher.update(credential, "utf8"),
    cipher.final(),
  ]);
  return Object.freeze({
    version: VERSION,
    algorithm: ALGORITHM,
    purpose,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  });
}

export function decryptSessionCredential(
  envelope,
  purpose,
  scope,
  keyMaterial,
) {
  if (
    !envelope ||
    envelope.version !== VERSION ||
    envelope.algorithm !== ALGORITHM ||
    envelope.purpose !== purpose ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string" ||
    typeof envelope.tag !== "string"
  ) {
    throw new Error("REFRESH_CREDENTIAL_INVALID");
  }
  try {
    const iv = decodeBase64Url(envelope.iv);
    const ciphertext = decodeBase64Url(envelope.ciphertext);
    const tag = decodeBase64Url(envelope.tag);
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) {
      throw new Error("REFRESH_CREDENTIAL_INVALID");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      credentialKey(keyMaterial),
      iv,
    );
    decipher.setAAD(associatedData(scope, purpose));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("REFRESH_CREDENTIAL_INVALID");
  }
}

export const encryptRefreshCredential = (token, scope, keyMaterial) =>
  encryptSessionCredential(token, "refresh", scope, keyMaterial);

export const decryptRefreshCredential = (envelope, scope, keyMaterial) =>
  decryptSessionCredential(envelope, "refresh", scope, keyMaterial);
