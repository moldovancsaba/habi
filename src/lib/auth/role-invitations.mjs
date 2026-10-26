import { createHmac, randomBytes } from "node:crypto";
import { validateContractDocument } from "../database/contract-validation.mjs";

export const ROLE_INVITATION_MS = 7 * 24 * 60 * 60 * 1000;

/** @typedef {import("mongodb").ClientSession} ClientSession */

function tokenDigest(token, key) {
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") < 32) {
    throw new Error("SESSION_HMAC_KEY_INVALID");
  }
  return createHmac("sha256", key)
    .update(`habi-role-invitation:${token}`, "utf8")
    .digest("hex");
}

/**
 * @param {import("mongodb").Collection<import("mongodb").Document>} collection
 * @param {{tenantId: string, role: "player" | "parent" | "coach", playerId?: string | null, playerDisplayName?: string | null, createdByIdentityHash: string, hmacKey: string, now?: Date}} options
 */
export async function issueRoleInvitation(
  collection,
  {
    tenantId,
    role,
    playerId = null,
    playerDisplayName = null,
    createdByIdentityHash,
    hmacKey,
    now = new Date(),
  },
) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(tenantId ?? "") ||
    !["player", "parent", "coach"].includes(role) ||
    !/^[a-f0-9]{64}$/.test(createdByIdentityHash ?? "") ||
    (role === "coach"
      ? playerId !== null
      : !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(playerId ?? "")) ||
    (playerDisplayName !== null &&
      (role !== "player" ||
        typeof playerDisplayName !== "string" ||
        playerDisplayName.trim().length < 1 ||
        playerDisplayName.trim().length > 100))
  ) {
    throw new Error("ROLE_INVITATION_INPUT_INVALID");
  }
  const token = randomBytes(32).toString("base64url");
  const invitation = {
    id: randomBytes(24).toString("hex"),
    tokenHash: tokenDigest(token, hmacKey),
    tenantId,
    role,
    playerId,
    ...(playerDisplayName
      ? { playerDisplayName: playerDisplayName.trim() }
      : {}),
    createdByIdentityHash,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ROLE_INVITATION_MS),
    claimedAt: null,
    claimedIdentityHash: null,
    revokedAt: null,
  };
  validateContractDocument("habi_role_invitations", invitation);
  await collection.insertOne(invitation);
  return Object.freeze({ token, invitation: Object.freeze(invitation) });
}

/**
 * @param {import("mongodb").Collection<import("mongodb").Document>} collection
 * @param {{token: string, identityHash: string, hmacKey: string, now?: Date, mongoSession?: ClientSession}} options
 */
export async function claimRoleInvitation(
  collection,
  { token, identityHash, hmacKey, now = new Date(), mongoSession = undefined },
) {
  if (
    typeof token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    !/^[a-f0-9]{64}$/.test(identityHash ?? "")
  ) {
    return null;
  }
  const invitation = await collection.findOneAndUpdate(
    {
      tokenHash: tokenDigest(token, hmacKey),
      expiresAt: { $gt: now },
      claimedAt: null,
      claimedIdentityHash: null,
      revokedAt: null,
    },
    {
      $set: {
        claimedAt: now.toISOString(),
        claimedIdentityHash: identityHash,
      },
    },
    {
      returnDocument: "after",
      ...(mongoSession ? { session: mongoSession } : {}),
    },
  );
  if (invitation)
    return Object.freeze({ ...invitation, alreadyClaimed: false });
  const prior = await collection.findOne(
    {
      tokenHash: tokenDigest(token, hmacKey),
      claimedIdentityHash: identityHash,
      claimedAt: { $ne: null },
      revokedAt: null,
    },
    mongoSession ? { session: mongoSession } : undefined,
  );
  return prior ? Object.freeze({ ...prior, alreadyClaimed: true }) : null;
}

export async function readRoleInvitation(
  collection,
  token,
  hmacKey,
  now = new Date(),
) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    return null;
  const invitation = await collection.findOne({
    tokenHash: tokenDigest(token, hmacKey),
    claimedAt: null,
    claimedIdentityHash: null,
    revokedAt: null,
    expiresAt: { $gt: now },
  });
  if (!invitation) return null;
  return Object.freeze({
    tenantId: invitation.tenantId,
    role: invitation.role,
    ...(invitation.playerDisplayName
      ? { playerDisplayName: invitation.playerDisplayName }
      : {}),
    expiresAt: invitation.expiresAt,
  });
}

export async function revokeRoleInvitation(collection, id, now = new Date()) {
  if (!/^[a-f0-9]{48}$/.test(id ?? "")) return false;
  const result = await collection.updateOne(
    { id, claimedAt: null, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now.toISOString() } },
  );
  return result.modifiedCount === 1;
}
