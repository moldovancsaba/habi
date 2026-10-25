import { validateContractDocument } from "./contract-validation.mjs";

const FIXED_TIME = "2026-01-01T00:00:00.000Z";

function tenantDocument(id) {
  return {
    id,
    tenantId: id,
    schemaVersion: 2,
    revision: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    retentionPolicyId: "synthetic-retention-v1",
    status: "active",
    controllerPolicyId: "synthetic-controller-v1",
  };
}

function playerDocument(tenantId, timeZone) {
  const actorId = `seed-${tenantId.slice(-1)}-player-actor`;
  return {
    id: "seed-player-001",
    tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    retentionPolicyId: "synthetic-retention-v1",
    actorId,
    registeredAt: FIXED_TIME,
    timeZone,
  };
}

function actorDocument(id) {
  return {
    id,
    schemaVersion: 2,
    revision: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    retentionPolicyId: "synthetic-retention-v1",
    identityId: null,
    status: "active",
    accessRevision: 1,
  };
}

function membershipDocument(tenantId, playerId, actorId, role, suffix) {
  return {
    id: `seed-${tenantId.slice(-1)}-${suffix}-membership`,
    tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    retentionPolicyId: "synthetic-retention-v1",
    actorId,
    playerId,
    role,
    status: "active",
    expiresAt: null,
    representationEvidenceRef: null,
  };
}

export const SYNTHETIC_SEED = Object.freeze([
  Object.freeze({
    tenant: tenantDocument("seed-tenant-a"),
    player: playerDocument("seed-tenant-a", "Europe/Budapest"),
  }),
  Object.freeze({
    tenant: tenantDocument("seed-tenant-b"),
    player: playerDocument("seed-tenant-b", "Europe/London"),
  }),
]);

export const SYNTHETIC_TEST_IDENTITIES = Object.freeze([
  Object.freeze({
    id: "seed-a-player-actor",
    role: "player",
    playerId: "seed-player-001",
    tenantId: "seed-tenant-a",
  }),
  Object.freeze({
    id: "seed-b-player-actor",
    role: "player",
    playerId: "seed-player-001",
    tenantId: "seed-tenant-b",
  }),
  Object.freeze({
    id: "seed-a-parent-one",
    role: "parent",
    playerId: "seed-player-001",
    tenantId: "seed-tenant-a",
  }),
  Object.freeze({
    id: "seed-a-parent-two",
    role: "parent",
    playerId: "seed-player-001",
    tenantId: "seed-tenant-a",
  }),
  Object.freeze({
    id: "seed-a-coach-one",
    role: "coach",
    playerId: "seed-player-001",
    tenantId: "seed-tenant-a",
  }),
  Object.freeze({
    id: "seed-a-coach-two",
    role: "coach",
    playerId: "seed-player-001",
    tenantId: "seed-tenant-a",
  }),
]);

export async function applySyntheticSeed(db) {
  const now = new Date().toISOString();
  let inserted = 0;

  for (const fixture of SYNTHETIC_SEED) {
    validateContractDocument("tenants", fixture.tenant);
    validateContractDocument("players", fixture.player);
    const tenantResult = await db
      .collection("tenants")
      .updateOne(
        { tenantId: fixture.tenant.tenantId, id: fixture.tenant.id },
        { $setOnInsert: fixture.tenant },
        { upsert: true },
      );
    const playerResult = await db
      .collection("players")
      .updateOne(
        { tenantId: fixture.player.tenantId, id: fixture.player.id },
        { $setOnInsert: fixture.player },
        { upsert: true },
      );
    await db
      .collection("players")
      .updateOne(
        { tenantId: fixture.player.tenantId, id: fixture.player.id },
        { $set: { actorId: fixture.player.actorId } },
      );
    inserted += tenantResult.upsertedCount + playerResult.upsertedCount;
  }

  for (const identity of SYNTHETIC_TEST_IDENTITIES) {
    const actor = actorDocument(identity.id);
    const membership = membershipDocument(
      identity.tenantId,
      identity.playerId,
      identity.id,
      identity.role,
      identity.id.replace(/^seed-[a-z]-/, ""),
    );
    validateContractDocument("actors", actor);
    validateContractDocument("memberships", membership);
    const actorResult = await db
      .collection("actors")
      .updateOne({ id: actor.id }, { $setOnInsert: actor }, { upsert: true });
    const membershipResult = await db
      .collection("memberships")
      .updateOne(
        { tenantId: membership.tenantId, id: membership.id },
        { $setOnInsert: membership },
        { upsert: true },
      );
    inserted += actorResult.upsertedCount + membershipResult.upsertedCount;
  }

  return Object.freeze({
    tenants: 2,
    players: 2,
    testActors: SYNTHETIC_TEST_IDENTITIES.length,
    testMemberships: SYNTHETIC_TEST_IDENTITIES.length,
    inserted,
    seededAt: now,
    syntheticOnly: true,
  });
}
