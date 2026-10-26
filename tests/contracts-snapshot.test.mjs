import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COLLECTIONS,
  COLLECTION_SCHEMA,
  INTERNAL_COLLECTIONS,
  INTERNAL_RUNTIME_COLLECTIONS,
} from "../src/lib/database/migration-schema.mjs";
import { validateContractDocument } from "../src/lib/database/contract-validation.mjs";

test("runtime contract snapshot is pinned and covers every persisted collection", async () => {
  const [manifestBytes, sourceBytes] = await Promise.all([
    readFile(new URL("../contracts/source-manifest.json", import.meta.url)),
    readFile(
      new URL("../contracts/domain-schemas.source.json", import.meta.url),
    ),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const digest = createHash("sha256").update(sourceBytes).digest("hex");
  assert.equal(manifest.artifact, "domain-schemas.source.json");
  assert.equal(manifest.sha256, digest);
  assert.equal(
    Object.keys(COLLECTION_SCHEMA).length,
    COLLECTIONS.length + INTERNAL_RUNTIME_COLLECTIONS.length,
  );
  assert.equal(COLLECTION_SCHEMA.auth_transactions, null);
  assert.equal(COLLECTION_SCHEMA.session_sso_credentials, null);
  assert.equal(COLLECTION_SCHEMA.habi_role_requests, null);
  assert.equal(
    INTERNAL_RUNTIME_COLLECTIONS.includes("habi_role_requests"),
    true,
  );
  assert.equal(INTERNAL_COLLECTIONS.includes("session_sso_credentials"), false);
  assert.equal(
    Object.values(COLLECTION_SCHEMA).filter(Boolean).length,
    COLLECTIONS.length,
  );
  assert.deepEqual(
    Object.entries(COLLECTION_SCHEMA)
      .filter(([, definition]) => definition)
      .map(([collection]) => collection)
      .sort(),
    [...COLLECTIONS].sort(),
  );
});

test("runtime validation rejects a document outside the accepted contract", () => {
  assert.throws(
    () => validateContractDocument("players", { id: "player-without-tenant" }),
    /DOCUMENT_CONTRACT_INVALID/,
  );

  assert.equal(
    validateContractDocument("habi_role_requests", {
      id: "e".repeat(48),
      tenantId: "habi",
      actorId: "actor_1",
      identityHash: "f".repeat(64),
      role: "coach",
      displayName: "Moldován Csaba",
      status: "pending",
      invitationId: null,
      createdAt: "2026-10-26T10:00:00.000Z",
      updatedAt: "2026-10-26T10:00:00.000Z",
      retentionPolicyId: "habi-retention-v1-draft",
    }),
    true,
  );
});

test("SSO owner collection contracts validate hashes and timestamps strictly", () => {
  const link = {
    _id: "a".repeat(64),
    ownerHash: "b".repeat(64),
    linkMethod: "verified_legacy_cookie",
    linkedAt: "2026-10-26T10:00:00.000Z",
  };
  assert.equal(validateContractDocument("habi_sso_owner_links", link), true);
  assert.throws(
    () =>
      validateContractDocument("habi_sso_owner_links", {
        ...link,
        rawSubject: "private-id",
      }),
    /DOCUMENT_CONTRACT_INVALID/,
  );

  const session = {
    _id: "c".repeat(48),
    tokenHash: "d".repeat(64),
    identityHash: "a".repeat(64),
    ownerHash: "b".repeat(64),
    createdAt: "2026-10-26T10:00:00.000Z",
    lastSeenAt: "2026-10-26T10:00:00.000Z",
    expiresAt: new Date("2026-10-26T18:00:00.000Z"),
    revokedAt: null,
  };
  assert.equal(
    validateContractDocument("habi_sso_owner_sessions", session),
    true,
  );
  assert.throws(
    () =>
      validateContractDocument("habi_sso_owner_sessions", {
        ...session,
        lastSeenAt: "yesterday",
      }),
    /DOCUMENT_CONTRACT_INVALID/,
  );
});
