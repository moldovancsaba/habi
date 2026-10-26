import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { migration as initialSchema } from "./001-initial-schema.mjs";
import { migration as authTransactions } from "./002-auth-transactions.mjs";
import { migration as sessionSsoCredentials } from "./003-session-sso-credentials.mjs";
import { migration as checkinSessionRevision } from "./004-checkin-result-session-revision.mjs";
import { migration as interpretationReviews } from "./005-interpretation-reviews.mjs";
import { migration as coachMaterials } from "./006-coach-materials.mjs";
import { migration as publicationUniqueness } from "./007-publication-uniqueness.mjs";
import { migration as uploadChunks } from "./008-upload-chunks.mjs";
import { migration as workerClaimIdempotency } from "./009-worker-claim-idempotency.mjs";
import { migration as ssoBrowserOwnerSessions } from "./010-sso-browser-owner-sessions.mjs";

const MIGRATIONS = [
  initialSchema,
  authTransactions,
  sessionSsoCredentials,
  checkinSessionRevision,
  interpretationReviews,
  coachMaterials,
  publicationUniqueness,
  uploadChunks,
  workerClaimIdempotency,
  ssoBrowserOwnerSessions,
];

export async function runMigrations(db, now = new Date()) {
  const ledger = db.collection("_habi_migrations");
  const applied = [];

  for (const migration of MIGRATIONS) {
    const checksum = createHash("sha256")
      .update(await readFile(migration.sourceFile))
      .digest("hex");
    const prior = await ledger.findOne({ _id: migration.id });
    if (prior) {
      if (prior.checksum !== checksum) {
        throw new Error("MIGRATION_CHECKSUM_MISMATCH");
      }
      continue;
    }

    await migration.up(db);
    try {
      await ledger.insertOne({
        _id: migration.id,
        checksum,
        appliedAt: now.toISOString(),
        schemaVersion: 1,
      });
      applied.push(migration.id);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const concurrentRecord = await ledger.findOne({ _id: migration.id });
      if (!concurrentRecord) throw error;
    }
  }

  return Object.freeze({ applied, current: MIGRATIONS.at(-1)?.id ?? null });
}

export function migrationList() {
  return Object.freeze(MIGRATIONS.map(({ id }) => id));
}
