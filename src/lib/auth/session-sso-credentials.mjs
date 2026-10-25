import { randomBytes } from "node:crypto";
import {
  decryptSessionCredential,
  encryptSessionCredential,
} from "./refresh-credential.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";

const ACCESS_TOKEN_SKEW_MS = 30_000;
const DEFAULT_REFRESH_LEASE_MS = 8_000;
const DEFAULT_REFRESH_WAIT_MS = 3_000;
const DEFAULT_REFRESH_POLL_MS = 40;

function scopeOf({ issuer, clientId, actorId, sessionId }) {
  return { issuer, clientId, actorId, sessionId };
}

function assertValidExpiry(expiresIn) {
  if (!Number.isSafeInteger(expiresIn) || expiresIn < 1 || expiresIn > 86_400) {
    throw new Error("SSO_TOKEN_RESPONSE_INVALID");
  }
}

export async function createSessionSsoCredential(
  collection,
  {
    session,
    issuer,
    clientId,
    accessToken,
    refreshToken,
    expiresIn,
    encryptionKey,
    now = new Date(),
  },
) {
  assertValidExpiry(expiresIn);
  if (
    !session ||
    typeof session.id !== "string" ||
    typeof session.actorId !== "string" ||
    !(session.expiresAt instanceof Date) ||
    session.expiresAt <= now ||
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string"
  ) {
    throw new Error("SSO_CREDENTIAL_INPUT_INVALID");
  }
  const scope = scopeOf({
    issuer,
    clientId,
    actorId: session.actorId,
    sessionId: session.id,
  });
  const document = {
    id: randomBytes(24).toString("hex"),
    schemaVersion: 1,
    revision: 1,
    sessionId: session.id,
    actorId: session.actorId,
    issuer,
    clientId,
    accessCredential: encryptSessionCredential(
      accessToken,
      "access",
      scope,
      encryptionKey,
    ),
    refreshCredential: encryptSessionCredential(
      refreshToken,
      "refresh",
      scope,
      encryptionKey,
    ),
    accessTokenExpiresAt: new Date(now.getTime() + expiresIn * 1000),
    expiresAt: session.expiresAt,
    refreshLeaseId: null,
    refreshLeaseExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
  };
  validateContractDocument("session_sso_credentials", document);
  await collection.insertOne(document);
  return Object.freeze(document);
}

export async function readSessionSsoCredential(
  collection,
  { sessionId, now = new Date() },
) {
  if (typeof sessionId !== "string" || !/^[a-f0-9]{48}$/.test(sessionId)) {
    throw new Error("SSO_CREDENTIAL_SESSION_INVALID");
  }
  const document = await collection.findOne({
    sessionId,
    revokedAt: null,
    expiresAt: { $gt: now },
  });
  return document ?? null;
}

async function claimRefreshLease(
  collection,
  { credential, leaseId, now, leaseMs },
) {
  return collection.findOneAndUpdate(
    {
      id: credential.id,
      sessionId: credential.sessionId,
      revision: credential.revision,
      revokedAt: null,
      expiresAt: { $gt: now },
      $or: [
        { refreshLeaseExpiresAt: null },
        { refreshLeaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        refreshLeaseId: leaseId,
        refreshLeaseExpiresAt: new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}

async function releaseRefreshLease(
  collection,
  { credential, leaseId, now, revoke = false },
) {
  return collection.updateOne(
    {
      id: credential.id,
      sessionId: credential.sessionId,
      revision: credential.revision,
      refreshLeaseId: leaseId,
      revokedAt: null,
    },
    {
      $set: {
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
        revokedAt: revoke ? now : null,
        updatedAt: now,
      },
      ...(revoke ? { $inc: { revision: 1 } } : {}),
    },
  );
}

async function commitRefresh(
  collection,
  {
    credential,
    leaseId,
    accessToken,
    refreshToken,
    expiresIn,
    encryptionKey,
    now,
  },
) {
  assertValidExpiry(expiresIn);
  const scope = scopeOf(credential);
  const update = await collection.updateOne(
    {
      id: credential.id,
      sessionId: credential.sessionId,
      revision: credential.revision,
      refreshLeaseId: leaseId,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        accessCredential: encryptSessionCredential(
          accessToken,
          "access",
          scope,
          encryptionKey,
        ),
        refreshCredential: encryptSessionCredential(
          refreshToken,
          "refresh",
          scope,
          encryptionKey,
        ),
        accessTokenExpiresAt: new Date(now.getTime() + expiresIn * 1000),
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
        updatedAt: now,
      },
      $inc: { revision: 1 },
    },
  );
  if (update.matchedCount !== 1) {
    throw new Error("SSO_CREDENTIAL_REFRESH_RACE");
  }
}

export async function getSessionAccessToken({
  collection,
  sessionId,
  encryptionKey,
  refresh,
  now = () => new Date(),
  leaseMs = DEFAULT_REFRESH_LEASE_MS,
  waitMs = DEFAULT_REFRESH_WAIT_MS,
  pollMs = DEFAULT_REFRESH_POLL_MS,
}) {
  if (
    typeof refresh !== "function" ||
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 1000 ||
    !Number.isSafeInteger(waitMs) ||
    waitMs < 0 ||
    !Number.isSafeInteger(pollMs) ||
    pollMs < 1
  ) {
    throw new Error("SSO_CREDENTIAL_REFRESH_CONFIG_INVALID");
  }
  const deadline = now().getTime() + waitMs;
  while (true) {
    const currentTime = now();
    const credential = await readSessionSsoCredential(collection, {
      sessionId,
      now: currentTime,
    });
    if (!credential) throw new Error("SSO_CREDENTIAL_UNAVAILABLE");

    const scope = scopeOf(credential);
    if (
      credential.accessTokenExpiresAt.getTime() >
      currentTime.getTime() + ACCESS_TOKEN_SKEW_MS
    ) {
      return decryptSessionCredential(
        credential.accessCredential,
        "access",
        scope,
        encryptionKey,
      );
    }

    const leaseId = randomBytes(32).toString("base64url");
    const leased = await claimRefreshLease(collection, {
      credential,
      leaseId,
      now: currentTime,
      leaseMs,
    });
    if (leased) {
      try {
        const refreshToken = decryptSessionCredential(
          leased.refreshCredential,
          "refresh",
          scope,
          encryptionKey,
        );
        const tokens = await refresh(refreshToken);
        assertValidExpiry(tokens?.expiresIn);
        if (
          typeof tokens?.accessToken !== "string" ||
          !tokens.accessToken ||
          typeof tokens?.refreshToken !== "string" ||
          !tokens.refreshToken
        ) {
          throw new Error("SSO_TOKEN_RESPONSE_INVALID");
        }
        const committedAt = now();
        await commitRefresh(collection, {
          credential: leased,
          leaseId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          encryptionKey,
          now: committedAt,
        });
        return tokens.accessToken;
      } catch (error) {
        const failedAt = now();
        await releaseRefreshLease(collection, {
          credential: leased,
          leaseId,
          now: failedAt,
          revoke: error?.message === "SSO_REFRESH_REJECTED",
        }).catch(() => undefined);
        throw error;
      }
    }

    if (currentTime.getTime() >= deadline) {
      throw new Error("SSO_CREDENTIAL_REFRESH_BUSY");
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export async function revokeSessionSsoCredential(
  collection,
  { sessionId, now = new Date() },
) {
  const result = await collection.updateOne(
    { sessionId, revokedAt: null },
    {
      $set: {
        revokedAt: now,
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
        updatedAt: now,
      },
      $inc: { revision: 1 },
    },
  );
  return result.modifiedCount === 1;
}
