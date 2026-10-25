import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import {
  compareAndSwapDocument,
  findTenantDocument,
} from "../src/lib/database/tenant-repository.mjs";
import { runIdempotentCommand } from "../src/lib/database/idempotent-command.mjs";
import { runMigrations } from "../src/lib/database/migrations/runner.mjs";
import { applySyntheticSeed } from "../src/lib/database/seed.mjs";
import { validateContractDocument } from "../src/lib/database/contract-validation.mjs";

const mongoUri = process.env.HABI_TEST_MONGODB_URI;

test("Atlas persistence integration on an isolated Mongo replica set", {
  skip: !mongoUri,
}, async (t) => {
  const client = new MongoClient(mongoUri, {
    appName: "habi-persistence-tests",
    serverSelectionTimeoutMS: 5_000,
  });
  const databaseName = `habi_${process.pid}_${Date.now()}_test`;
  const db = client.db(databaseName);

  await client.connect();
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });

  await t.test("migration is versioned and safe to apply twice", async () => {
    assert.deepEqual(
      await runMigrations(db, new Date("2026-10-25T00:00:00.000Z")),
      {
        applied: ["001-initial-schema"],
        current: "001-initial-schema",
      },
    );
    assert.deepEqual(
      await runMigrations(db, new Date("2026-10-25T00:00:01.000Z")),
      {
        applied: [],
        current: "001-initial-schema",
      },
    );
    const migrationRecord = await db
      .collection("_habi_migrations")
      .findOne({ _id: "001-initial-schema" });
    assert.match(migrationRecord.checksum, /^[a-f0-9]{64}$/);
    await db
      .collection("_habi_migrations")
      .updateOne(
        { _id: "001-initial-schema" },
        { $set: { checksum: "0".repeat(64) } },
      );
    await assert.rejects(runMigrations(db), {
      message: "MIGRATION_CHECKSUM_MISMATCH",
    });
    await db
      .collection("_habi_migrations")
      .updateOne(
        { _id: "001-initial-schema" },
        { $set: { checksum: migrationRecord.checksum } },
      );
    const indexNames = (await db.collection("records").indexes()).map(
      ({ name }) => name,
    );
    assert.ok(indexNames.includes("record_timeline"));
    assert.ok(indexNames.includes("record_checkin_answer_unique"));
    assert.equal(
      validateContractDocument("tenants", {
        id: "valid-tenant",
        tenantId: "valid-tenant",
        schemaVersion: 2,
        revision: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        retentionPolicyId: "retention-v1",
        status: "active",
        controllerPolicyId: "controller-v1",
      }),
      true,
    );
    assert.throws(
      () =>
        validateContractDocument("tenants", {
          id: "invalid-tenant",
          tenantId: "invalid-tenant",
          schemaVersion: 99,
          revision: 0,
        }),
      /DOCUMENT_CONTRACT_INVALID/,
    );
    await assert.rejects(
      db
        .collection("players")
        .insertOne({ id: "invalid", tenantId: "seed-tenant-a" }),
      (error) => error.code === 121,
    );
  });

  await t.test("deterministic two-tenant seed is idempotent", async () => {
    const first = await applySyntheticSeed(db);
    const second = await applySyntheticSeed(db);
    assert.equal(first.inserted, 4);
    assert.equal(second.inserted, 0);
    assert.equal(await db.collection("tenants").countDocuments(), 2);
    assert.equal(await db.collection("players").countDocuments(), 2);
  });

  await t.test("tenant reads cannot cross a tenant boundary", async () => {
    assert.equal(
      (
        await findTenantDocument(
          db.collection("players"),
          "seed-tenant-a",
          "seed-player-001",
        )
      ).timeZone,
      "Europe/Budapest",
    );
    assert.equal(
      (
        await findTenantDocument(
          db.collection("players"),
          "seed-tenant-b",
          "seed-player-001",
        )
      ).timeZone,
      "Europe/London",
    );
    await assert.rejects(
      findTenantDocument(db.collection("players"), "", "seed-player-001"),
      { message: "TENANT_SCOPE_REQUIRED" },
    );
  });

  await t.test(
    "concurrent compare-and-swap permits one revision writer",
    async () => {
      const attempts = await Promise.allSettled([
        compareAndSwapDocument({
          collection: db.collection("players"),
          tenantId: "seed-tenant-a",
          id: "seed-player-001",
          expectedRevision: 1,
          changes: { timeZone: "Europe/London" },
          now: new Date("2026-10-25T01:00:00.000Z"),
        }),
        compareAndSwapDocument({
          collection: db.collection("players"),
          tenantId: "seed-tenant-a",
          id: "seed-player-001",
          expectedRevision: 1,
          changes: { timeZone: "America/New_York" },
          now: new Date("2026-10-25T01:00:00.000Z"),
        }),
      ]);
      assert.equal(
        attempts.filter((item) => item.status === "fulfilled").length,
        1,
      );
      assert.equal(
        attempts.filter(
          (item) =>
            item.status === "rejected" &&
            item.reason.message === "REVISION_CONFLICT",
        ).length,
        1,
      );
      const saved = await findTenantDocument(
        db.collection("players"),
        "seed-tenant-a",
        "seed-player-001",
      );
      assert.equal(saved.revision, 2);
      await assert.rejects(
        compareAndSwapDocument({
          collection: db.collection("players"),
          tenantId: "seed-tenant-a",
          id: "seed-player-001",
          expectedRevision: 2,
          changes: { tenantId: "seed-tenant-b" },
        }),
        { message: "IMMUTABLE_FIELD" },
      );
    },
  );

  await t.test(
    "retries replay a committed result, while a changed body conflicts",
    async () => {
      let executions = 0;
      const command = {
        client,
        db,
        tenantId: "seed-tenant-a",
        retentionPolicyId: "synthetic-retention-v1",
        actorOrClientId: "synthetic-client",
        method: "POST",
        path: "/v1/test-command",
        key: "same-request-key",
        body: { value: 3 },
        execute: async ({ db: transactionDb, session }) => {
          executions += 1;
          await transactionDb.collection("audit").insertOne(
            {
              id: "idempotent-result",
              tenantId: "seed-tenant-a",
              schemaVersion: 2,
              revision: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              retentionPolicyId: "synthetic-retention-v1",
              actorOrClientId: "synthetic-client",
              action: "synthetic-test",
              resourceRef: null,
              requestId: "synthetic-request-001",
              outcome: "allowed",
              occurredAt: "2026-01-01T00:00:00.000Z",
            },
            { session },
          );
          return {
            status: 201,
            resultRef: { id: "idempotent-result", revision: 1 },
          };
        },
        now: () => new Date("2026-10-25T02:00:00.000Z"),
      };
      const first = await runIdempotentCommand(command);
      const retry = await runIdempotentCommand(command);
      assert.equal(first.replayed, false);
      assert.equal(retry.replayed, true);
      assert.equal(executions, 1);
      assert.equal(
        await db
          .collection("audit")
          .countDocuments({ id: "idempotent-result" }),
        1,
      );
      await assert.rejects(
        runIdempotentCommand({ ...command, body: { value: 4 } }),
        { message: "IDEMPOTENCY_CONFLICT" },
      );
    },
  );

  await t.test(
    "concurrent identical requests commit exactly one result",
    async () => {
      const command = {
        client,
        db,
        tenantId: "seed-tenant-a",
        retentionPolicyId: "synthetic-retention-v1",
        actorOrClientId: "synthetic-client",
        method: "POST",
        path: "/v1/concurrent-command",
        key: "concurrent-request-key",
        body: { value: "same" },
        execute: async ({ db: transactionDb, session }) => {
          await transactionDb.collection("audit").insertOne(
            {
              id: "concurrent-result",
              tenantId: "seed-tenant-a",
              schemaVersion: 2,
              revision: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              retentionPolicyId: "synthetic-retention-v1",
              actorOrClientId: "synthetic-client",
              action: "synthetic-concurrent-test",
              resourceRef: null,
              requestId: "synthetic-concurrent-request-001",
              outcome: "allowed",
              occurredAt: "2026-01-01T00:00:00.000Z",
            },
            { session },
          );
          return {
            status: 201,
            resultRef: { id: "concurrent-result", revision: 1 },
          };
        },
      };
      const results = await Promise.all([
        runIdempotentCommand(command),
        runIdempotentCommand(command),
      ]);
      assert.equal(results.filter((result) => result.status === 201).length, 2);
      assert.equal(
        await db
          .collection("audit")
          .countDocuments({ id: "concurrent-result" }),
        1,
      );
      assert.equal(
        await db.collection("idempotency").countDocuments({
          path: "/v1/concurrent-command",
          key: "concurrent-request-key",
        }),
        1,
      );
    },
  );

  await t.test(
    "expired idempotency receipt is not replayed while TTL cleanup is pending",
    async () => {
      let currentTime = new Date("2026-10-25T02:00:00.000Z");
      let executions = 0;
      const command = {
        client,
        db,
        tenantId: "seed-tenant-a",
        retentionPolicyId: "synthetic-retention-v1",
        actorOrClientId: "synthetic-client",
        method: "POST",
        path: "/v1/expired-command",
        key: "expired-request-key",
        body: { value: "same" },
        now: () => currentTime,
        execute: async ({ db: transactionDb, session }) => {
          executions += 1;
          await transactionDb.collection("audit").insertOne(
            {
              id: `expired-result-${executions}`,
              tenantId: "seed-tenant-a",
              schemaVersion: 2,
              revision: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              retentionPolicyId: "synthetic-retention-v1",
              actorOrClientId: "synthetic-client",
              action: "synthetic-expiry-test",
              resourceRef: null,
              requestId: `synthetic-expiry-${executions}`,
              outcome: "allowed",
              occurredAt: "2026-01-01T00:00:00.000Z",
            },
            { session },
          );
          return {
            status: 201,
            resultRef: { id: `expired-result-${executions}`, revision: 1 },
          };
        },
      };

      const first = await runIdempotentCommand(command);
      currentTime = new Date("2026-10-26T03:00:00.000Z");
      const afterWindow = await runIdempotentCommand(command);
      assert.equal(first.replayed, false);
      assert.equal(afterWindow.replayed, false);
      assert.equal(executions, 2);
      assert.equal(
        await db
          .collection("audit")
          .countDocuments({ action: "synthetic-expiry-test" }),
        2,
      );
      assert.equal(
        await db.collection("idempotency").countDocuments({
          path: "/v1/expired-command",
          key: "expired-request-key",
        }),
        1,
      );
    },
  );
});
