export const migration = Object.freeze({
  id: "009-worker-claim-idempotency",
  sourceFile: new URL("./009-worker-claim-idempotency.mjs", import.meta.url),
  async up(db) {
    await db.collection("jobs").updateMany(
      { claimKeyHash: { $exists: false } },
      {
        $set: {
          claimKeyHash: null,
          claimServiceId: null,
          claimRequestHash: null,
          claimContextRevision: null,
        },
      },
    );
    await db.collection("jobs").createIndex(
      { claimKeyHash: 1, claimServiceId: 1 },
      {
        name: "job_worker_claim_idempotency_unique",
        unique: true,
        partialFilterExpression: { claimKeyHash: { $type: "string" } },
      },
    );
  },
});
