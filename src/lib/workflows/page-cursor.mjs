import { createHmac, timingSafeEqual } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";

function mac(payload, key) {
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") < 32)
    throw new Error("CURSOR_KEY_INVALID");
  return createHmac("sha256", key)
    .update(`habi-page:${payload}`)
    .digest("base64url");
}

export function encodePageCursor(
  { principal, resource, scopeId, snapshotAt, at, id, now = new Date() },
  key,
) {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      tenantId: principal.tenantId,
      playerId: scopeId,
      accessRevision: principal.accessRevision,
      resource,
      snapshotAt,
      at,
      id,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    }),
  ).toString("base64url");
  return `${payload}.${mac(payload, key)}`;
}

export function decodePageCursor(
  token,
  { principal, resource, scopeId, now = new Date() },
  key,
) {
  if (typeof token !== "string" || token.length > 2000)
    throw new HabiApiError("INVALID_INPUT");
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra !== undefined)
    throw new HabiApiError("INVALID_INPUT");
  const expected = Buffer.from(mac(payload, key));
  const actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new HabiApiError("INVALID_INPUT");
  let value;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (
    value.v !== 1 ||
    value.tenantId !== principal.tenantId ||
    value.playerId !== scopeId ||
    value.accessRevision !== principal.accessRevision ||
    value.resource !== resource ||
    typeof value.at !== "string" ||
    typeof value.id !== "string" ||
    !Number.isFinite(Date.parse(value.snapshotAt)) ||
    !Number.isFinite(Date.parse(value.expiresAt))
  )
    throw new HabiApiError("INVALID_INPUT");
  if (Date.parse(value.expiresAt) <= now.getTime())
    throw new HabiApiError("CURSOR_EXPIRED");
  return value;
}

export function pageFilter({
  snapshotAt,
  position,
  timestampField = "createdAt",
}) {
  const terms = [{ [timestampField]: { $lte: snapshotAt } }];
  if (position)
    terms.push({
      $or: [
        { [timestampField]: { $lt: position.at } },
        { [timestampField]: position.at, id: { $lt: position.id } },
      ],
    });
  return { $and: terms };
}
