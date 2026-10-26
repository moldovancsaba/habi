import { createHash, randomBytes } from "node:crypto";

export const LEGACY_SESSION_COOKIE = "__Host-habi-session";
const COOKIE_VALUE_PATTERN = /^[a-f0-9]{64}$/;
const DANGEROUS_KEY_PATTERN = /^(?:__proto__|constructor|prototype)$/;
const MAX_STATE_BYTES = 2_000_000;

export function legacyOwnerSession(cookieHeader = "") {
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LEGACY_SESSION_COOKIE}=`))
    ?.slice(LEGACY_SESSION_COOKIE.length + 1);
  const existing =
    typeof token === "string" && COOKIE_VALUE_PATTERN.test(token);
  const secret = existing ? token : randomBytes(32).toString("hex");

  return Object.freeze({
    owner: createHash("sha256").update(secret).digest("hex"),
    cookie: existing
      ? null
      : `${LEGACY_SESSION_COOKIE}=${secret}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
    existing,
  });
}

export function isValidLegacyPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !payload.app ||
    typeof payload.app !== "object" ||
    Array.isArray(payload.app)
  ) {
    return false;
  }

  let visited = 0;
  function check(value, depth) {
    visited += 1;
    if (visited > 150_000 || depth > 35) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.length <= 20_000;
    if (Array.isArray(value)) {
      return (
        value.length <= 20_000 && value.every((item) => check(item, depth + 1))
      );
    }
    if (typeof value !== "object") return false;

    return Object.entries(value).every(
      ([key, nested]) =>
        !DANGEROUS_KEY_PATTERN.test(key) &&
        !key.startsWith("$") &&
        check(nested, depth + 1),
    );
  }

  if (!check(payload, 0)) return false;
  try {
    return (
      Buffer.byteLength(JSON.stringify(payload), "utf8") <= MAX_STATE_BYTES
    );
  } catch {
    return false;
  }
}

export async function readLegacyState(collection, owner) {
  const state = await collection.findOne(
    { _id: owner },
    { projection: { _id: 0, payload: 1, revision: 1 } },
  );
  return state ?? { payload: null, revision: 0 };
}

export async function writeLegacyState(collection, owner, revision, payload) {
  if (revision === 0) {
    try {
      await collection.insertOne({
        _id: owner,
        revision: 1,
        payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return Object.freeze({ revision: 1 });
    } catch (error) {
      if (error?.code === 11000) return null;
      throw error;
    }
  }

  const result = await collection.updateOne(
    { _id: owner, revision },
    { $set: { payload, updatedAt: new Date() }, $inc: { revision: 1 } },
  );
  return result.matchedCount ? Object.freeze({ revision: revision + 1 }) : null;
}
