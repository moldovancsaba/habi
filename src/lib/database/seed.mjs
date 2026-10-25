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
  return {
    id: "seed-player-001",
    tenantId,
    schemaVersion: 2,
    revision: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    retentionPolicyId: "synthetic-retention-v1",
    actorId: null,
    registeredAt: FIXED_TIME,
    timeZone,
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
    inserted += tenantResult.upsertedCount + playerResult.upsertedCount;
  }

  return Object.freeze({
    tenants: 2,
    players: 2,
    inserted,
    seededAt: now,
    syntheticOnly: true,
  });
}
