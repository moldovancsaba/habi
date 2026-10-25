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
      Buffer.from("habi-refresh-credential-v1", "utf8"),
      Buffer.from("refresh-token-encryption", "utf8"),
      32,
    ),
  );
}

function associatedData({ issuer, clientId, actorId }) {
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
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(actorId)
  ) {
    throw new Error("REFRESH_CREDENTIAL_SCOPE_INVALID");
  }
  return Buffer.from(
    JSON.stringify([
      parsedIssuer.toString().replace(/\/$/, ""),
      clientId,
      actorId,
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

export function encryptRefreshCredential(refreshToken, scope, keyMaterial) {
  if (
    typeof refreshToken !== "string" ||
    !refreshToken ||
    Buffer.byteLength(refreshToken, "utf8") > 16_384
  ) {
    throw new Error("SSO_REFRESH_TOKEN_INVALID");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(keyMaterial), iv);
  const aad = associatedData(scope);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  return Object.freeze({
    version: VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  });
}

export function decryptRefreshCredential(envelope, scope, keyMaterial) {
  if (
    !envelope ||
    envelope.version !== VERSION ||
    envelope.algorithm !== ALGORITHM ||
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
    decipher.setAAD(associatedData(scope));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("REFRESH_CREDENTIAL_INVALID");
  }
}
