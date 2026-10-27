import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { MongoClient } from "mongodb";
import {
  compareAndSwapDocument,
  findTenantDocument,
} from "../src/lib/database/tenant-repository.mjs";
import { runIdempotentCommand } from "../src/lib/database/idempotent-command.mjs";
import { runMigrations } from "../src/lib/database/migrations/runner.mjs";
import { applySyntheticSeed } from "../src/lib/database/seed.mjs";
import {
  deleteExperienceDraft,
  readExperienceDraft,
  saveExperienceDraft,
} from "../src/lib/workflows/experience-drafts.mjs";
import { validateContractDocument } from "../src/lib/database/contract-validation.mjs";
import {
  consumeLoginTransaction,
  createLoginTransaction,
  persistLoginTransaction,
} from "../src/lib/auth/login-transaction.mjs";
import { createLoginHandler } from "../src/lib/auth/login-handler.mjs";
import {
  createLogoutHandler,
  SESSION_COOKIE,
  CSRF_HEADER,
} from "../src/lib/auth/logout-handler.mjs";
import {
  createSessionSsoCredential,
  getSessionAccessToken,
  readSessionSsoCredential,
  revokeSessionSsoCredential,
} from "../src/lib/auth/session-sso-credentials.mjs";
import {
  issueSession,
  readActiveSession,
  revokeSession,
  touchSession,
} from "../src/lib/auth/session.mjs";

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
        applied: [
          "001-initial-schema",
          "002-auth-transactions",
          "003-session-sso-credentials",
          "004-checkin-result-session-revision",
          "005-interpretation-reviews",
          "006-coach-materials",
          "007-publication-uniqueness",
          "008-upload-chunks",
          "009-worker-claim-idempotency",
          "010-sso-browser-owner-sessions",
          "011-role-invitations",
          "012-player-display-names",
          "013-role-requests",
          "014-experience-drafts",
        ],
        current: "014-experience-drafts",
      },
    );
    assert.deepEqual(
      await runMigrations(db, new Date("2026-10-25T00:00:01.000Z")),
      {
        applied: [],
        current: "014-experience-drafts",
      },
    );
    const draftIndexes = (
      await db.collection("habi_experience_drafts").indexes()
    ).map(({ name }) => name);
    assert.ok(draftIndexes.includes("habi_experience_draft_id_unique"));
    assert.ok(draftIndexes.includes("habi_experience_draft_owner_key_unique"));
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
    const authIndexes = (
      await db.collection("auth_transactions").indexes()
    ).map(({ name }) => name);
    assert.ok(authIndexes.includes("auth_transaction_state_unique"));
    assert.ok(authIndexes.includes("auth_transaction_browser_active_unique"));
    assert.ok(authIndexes.includes("auth_transaction_expiry_ttl"));
    const ownerLinkIndexes = (
      await db.collection("habi_sso_owner_links").indexes()
    ).map(({ name }) => name);
    assert.ok(ownerLinkIndexes.includes("habi_sso_owner_link_owner_unique"));
    const ownerSessionIndexes = (
      await db.collection("habi_sso_owner_sessions").indexes()
    ).map(({ name }) => name);
    assert.ok(
      ownerSessionIndexes.includes("habi_sso_owner_session_token_unique"),
    );
    assert.ok(
      ownerSessionIndexes.includes("habi_sso_owner_session_expiry_ttl"),
    );
    const ownerHandoffIndexes = (
      await db.collection("habi_sso_owner_handoffs").indexes()
    ).map(({ name }) => name);
    assert.ok(
      ownerHandoffIndexes.includes("habi_sso_owner_handoff_token_unique"),
    );
    assert.ok(
      ownerHandoffIndexes.includes("habi_sso_owner_handoff_binding_unique"),
    );
    assert.ok(
      ownerHandoffIndexes.includes("habi_sso_owner_handoff_expiry_ttl"),
    );
    await db.collection("habi_sso_owner_links").insertOne({
      _id: "a".repeat(64),
      ownerHash: "b".repeat(64),
      linkMethod: "verified_legacy_cookie",
      linkedAt: "2026-10-26T10:00:00.000Z",
    });
    await assert.rejects(
      db.collection("habi_sso_owner_links").insertOne({
        _id: "c".repeat(64),
        ownerHash: "b".repeat(64),
        linkMethod: "verified_legacy_cookie",
        linkedAt: "2026-10-26T10:00:00.000Z",
      }),
      (error) => error.code === 11000,
    );
    await db.collection("habi_sso_owner_sessions").insertOne({
      _id: "d".repeat(48),
      tokenHash: "e".repeat(64),
      identityHash: "a".repeat(64),
      ownerHash: "b".repeat(64),
      createdAt: "2026-10-26T10:00:00.000Z",
      lastSeenAt: "2026-10-26T10:00:00.000Z",
      expiresAt: new Date("2026-10-26T18:00:00.000Z"),
      revokedAt: null,
    });
    await assert.rejects(
      db.collection("habi_sso_owner_sessions").insertOne({
        _id: "f".repeat(48),
        tokenHash: "g".repeat(64),
      }),
      (error) => error.code === 121,
    );
    await db.collection("habi_sso_owner_handoffs").insertOne({
      _id: "a".repeat(48),
      tokenHash: "b".repeat(64),
      ownerHash: "c".repeat(64),
      bindingHash: null,
      createdAt: "2026-10-26T10:00:00.000Z",
      boundAt: null,
      expiresAt: new Date("2026-10-26T10:30:00.000Z"),
      consumedAt: null,
    });
    await assert.rejects(
      db.collection("habi_sso_owner_handoffs").insertOne({
        _id: "d".repeat(48),
        tokenHash: "e".repeat(64),
      }),
      (error) => error.code === 121,
    );
    await assert.rejects(
      db.collection("auth_transactions").insertOne({ id: "invalid-auth-txn" }),
      (error) => error.code === 121,
    );
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

  await t.test(
    "SSO callback can install only its versioned session prerequisites before first login",
    async () => {
      const callbackDb = client.db(`${databaseName}_callback`);
      try {
        assert.deepEqual(
          await runMigrations(
            callbackDb,
            new Date("2026-10-26T00:00:00.000Z"),
            ["010-sso-browser-owner-sessions", "011-role-invitations"],
          ),
          {
            applied: ["010-sso-browser-owner-sessions", "011-role-invitations"],
            current: "011-role-invitations",
          },
        );
        assert.deepEqual(
          await callbackDb.collection("_habi_migrations").distinct("_id"),
          ["010-sso-browser-owner-sessions", "011-role-invitations"],
        );
        const now = new Date("2026-10-26T00:00:00.000Z");
        await callbackDb.collection("habi_sso_owner_sessions").insertOne({
          _id: "a".repeat(48),
          tokenHash: "b".repeat(64),
          identityHash: "c".repeat(64),
          ownerHash: "d".repeat(64),
          issuer: "https://sso.example.test",
          subject: "verified-owner",
          permissionRole: "admin",
          createdAt: now.toISOString(),
          lastSeenAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
        });
        assert.deepEqual(
          await runMigrations(
            callbackDb,
            new Date("2026-10-26T00:00:01.000Z"),
            ["010-sso-browser-owner-sessions", "011-role-invitations"],
          ),
          { applied: [], current: "011-role-invitations" },
        );
      } finally {
        await callbackDb.dropDatabase();
      }
    },
  );

  await t.test("deterministic two-tenant seed is idempotent", async () => {
    const first = await applySyntheticSeed(db);
    const second = await applySyntheticSeed(db);
    assert.equal(first.inserted, 16);
    assert.equal(second.inserted, 0);
    assert.equal(await db.collection("tenants").countDocuments(), 2);
    assert.equal(await db.collection("players").countDocuments(), 2);
    assert.equal(await db.collection("actors").countDocuments(), 6);
    assert.equal(await db.collection("memberships").countDocuments(), 6);
  });

  await t.test(
    "reflection drafts persist, revision-fence, isolate roles, and clear",
    async () => {
      const principal = {
        actorId: "seed-a-player-actor",
        tenantId: "seed-tenant-a",
        role: "player",
        playerId: "seed-player-001",
        retentionPolicyId: "synthetic-retention-v1",
      };
      const path =
        "https://habi.example.test/api/v1/players/seed-player-001/drafts/daily-reflection";
      const saveRequest = (key, expectedRevision, payload) =>
        new Request(path, {
          method: "PUT",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({
            expectedRevision,
            contentVersion: "daily-reflection-v1",
            payload,
          }),
        });
      const first = await saveExperienceDraft({
        request: saveRequest("draft-save-1", 0, {
          moment: "A saját csapatom.",
          helped: "A bemelegítés.",
        }),
        client,
        db,
        principal,
        playerId: principal.playerId,
        draftKey: "daily-reflection",
      });
      assert.equal(first.status, 201);
      assert.equal(first.body.draft.revision, 1);
      const updated = await saveExperienceDraft({
        request: saveRequest("draft-save-2", 1, {
          moment: "A saját csapatom.",
          helped: "A rövid pihenő.",
        }),
        client,
        db,
        principal,
        playerId: principal.playerId,
        draftKey: "daily-reflection",
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.draft.revision, 2);
      assert.equal(updated.body.draft.payload.helped, "A rövid pihenő.");
      await assert.rejects(
        saveExperienceDraft({
          request: saveRequest("draft-stale-write", 1, {
            moment: "Régi változat",
            helped: "Régi változat",
          }),
          client,
          db,
          principal,
          playerId: principal.playerId,
          draftKey: "daily-reflection",
        }),
        { code: "REVISION_CONFLICT" },
      );
      await assert.rejects(
        readExperienceDraft({
          db,
          principal: { ...principal, role: "parent" },
          playerId: principal.playerId,
          draftKey: "daily-reflection",
        }),
        { code: "ACCESS_DENIED" },
      );
      const cleared = await deleteExperienceDraft({
        request: new Request(path, {
          method: "DELETE",
          headers: { "Idempotency-Key": "draft-delete-1" },
          body: JSON.stringify({ expectedRevision: 2 }),
        }),
        client,
        db,
        principal,
        playerId: principal.playerId,
        draftKey: "daily-reflection",
      });
      assert.equal(cleared.body.cleared, true);
      assert.deepEqual(
        await readExperienceDraft({
          db,
          principal,
          playerId: principal.playerId,
          draftKey: "daily-reflection",
        }),
        { draft: null },
      );

      const guidedPath =
        "https://habi.example.test/api/v1/players/seed-player-001/drafts/guided-conversation";
      const guided = await saveExperienceDraft({
        request: new Request(guidedPath, {
          method: "PUT",
          headers: { "Idempotency-Key": "guided-draft-save-1" },
          body: JSON.stringify({
            expectedRevision: 0,
            contentVersion: "guided-situation-v1",
            payload: { situationId: "after-mistake", answers: [1, 2] },
          }),
        }),
        client,
        db,
        principal,
        playerId: principal.playerId,
        draftKey: "guided-conversation",
      });
      assert.equal(guided.status, 201);
      assert.equal(guided.body.draft.payload.situationId, "after-mistake");
      assert.deepEqual(guided.body.draft.payload.answers, [1, 2]);
      assert.deepEqual(
        await readExperienceDraft({
          db,
          principal,
          playerId: principal.playerId,
          draftKey: "guided-conversation",
        }).then(({ draft }) => draft.payload),
        { situationId: "after-mistake", answers: [1, 2] },
      );
      const guidedClear = await deleteExperienceDraft({
        request: new Request(guidedPath, {
          method: "DELETE",
          headers: { "Idempotency-Key": "guided-draft-delete-1" },
          body: JSON.stringify({ expectedRevision: 1 }),
        }),
        client,
        db,
        principal,
        playerId: principal.playerId,
        draftKey: "guided-conversation",
      });
      assert.deepEqual(guidedClear.body, { cleared: true });

      const topicPath =
        "https://habi.example.test/api/v1/players/seed-player-001/drafts/guided-topic-conversation";
      const topicDraft = await saveExperienceDraft({
        request: new Request(topicPath, {
          method: "PUT",
          headers: { "Idempotency-Key": "guided-topic-save-1" },
          body: JSON.stringify({
            expectedRevision: 0,
            contentVersion: "guided-chat-v3",
            payload: {
              categoryId: "dreams",
              opening: "Szeretnék fejlődni",
              turns: ["emotion:first", "frequency:sometimes"],
            },
          }),
        }),
        client,
        db,
        principal,
        playerId: principal.playerId,
        draftKey: "guided-topic-conversation",
      });
      assert.equal(topicDraft.status, 201);
      assert.deepEqual(topicDraft.body.draft.payload, {
        categoryId: "dreams",
        opening: "Szeretnék fejlődni",
        turns: ["emotion:first", "frequency:sometimes"],
      });
      assert.deepEqual(
        await readExperienceDraft({
          db,
          principal,
          playerId: principal.playerId,
          draftKey: "guided-topic-conversation",
        }).then(({ draft }) => draft.payload),
        topicDraft.body.draft.payload,
      );
      const topicClear = await deleteExperienceDraft({
        request: new Request(topicPath, {
          method: "DELETE",
          headers: { "Idempotency-Key": "guided-topic-delete-1" },
          body: JSON.stringify({ expectedRevision: 1 }),
        }),
        client,
        db,
        principal,
        playerId: principal.playerId,
        draftKey: "guided-topic-conversation",
      });
      assert.deepEqual(topicClear.body, { cleared: true });
    },
  );

  await t.test(
    "auth transaction is persisted and consumed once by its browser",
    async () => {
      const collection = db.collection("auth_transactions");
      const transaction = createLoginTransaction({ now: new Date() });
      await persistLoginTransaction(collection, transaction.document);
      const wrongBrowser = await consumeLoginTransaction(collection, {
        state: transaction.state,
        binding: "another-browser",
      });
      assert.equal(wrongBrowser, null);
      const consumed = await consumeLoginTransaction(collection, {
        state: transaction.state,
        binding: transaction.binding,
      });
      assert.ok(consumed);
      assert.ok(consumed.consumedAt instanceof Date);
      assert.equal(
        await consumeLoginTransaction(collection, {
          state: transaction.state,
          binding: transaction.binding,
        }),
        null,
      );
    },
  );

  await t.test(
    "login route writes strict transaction state before redirect",
    async () => {
      const issuer = "https://sso.example.test";
      const handler = createLoginHandler({
        db,
        config: {
          issuer,
          clientId: "habi-integration-client",
          redirectUri: "https://habi.example.test/auth/callback",
        },
        fetchImpl: async (url, options) => {
          assert.equal(
            String(url),
            `${issuer}/.well-known/openid-configuration`,
          );
          assert.equal(options.cache, "no-store");
          return Response.json({
            issuer,
            authorization_endpoint: `${issuer}/api/oauth/authorize`,
            token_endpoint: `${issuer}/api/oauth/token`,
            userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
            jwks_uri: `${issuer}/api/oauth/jwks`,
            id_token_signing_alg_values_supported: ["RS256"],
          });
        },
      });
      const response = await handler(
        new Request("https://habi.example.test/auth/login?returnTo=%2Fhome"),
      );
      assert.equal(response.status, 302);
      const state = new URL(response.headers.get("location")).searchParams.get(
        "state",
      );
      const transaction = await db.collection("auth_transactions").findOne({
        stateHash: createHash("sha256").update(state).digest("hex"),
      });
      assert.ok(transaction);
      assert.equal(transaction.returnTo, "/home");
    },
  );

  await t.test(
    "opaque session expires, touches idle time, and revokes",
    async () => {
      const collection = db.collection("sessions");
      const now = new Date("2026-10-25T12:00:00.000Z");
      const key = "test-only-session-key-material-0123456789";
      const issued = await issueSession(collection, {
        actorId: "seed-actor-test",
        tenantId: "seed-tenant-a",
        retentionPolicyId: "retention-v1",
        activeRole: "parent",
        playerId: "seed-player-001",
        accessRevision: 1,
        hmacKey: key,
        now,
      });
      let session = await readActiveSession(collection, issued.token, key, now);
      assert.ok(session);
      assert.equal(
        await touchSession(collection, session, new Date(now.getTime() + 1000)),
        true,
      );
      session = await readActiveSession(
        collection,
        issued.token,
        key,
        new Date(now.getTime() + 1000),
      );
      assert.ok(session);
      assert.equal(
        await readActiveSession(
          collection,
          issued.token,
          key,
          new Date(now.getTime() + 31 * 60_000),
        ),
        null,
      );
      assert.equal(
        await revokeSession(
          collection,
          session,
          new Date(now.getTime() + 2000),
        ),
        true,
      );
      assert.equal(
        await readActiveSession(
          collection,
          issued.token,
          key,
          new Date(now.getTime() + 2000),
        ),
        null,
      );
    },
  );

  await t.test(
    "encrypted SSO credentials persist under strict schema and concurrent refresh rotates once",
    async () => {
      const now = new Date();
      const key = "test-refresh-encryption-key-with-strong-length-0123456789";
      const issued = await issueSession(db.collection("sessions"), {
        actorId: "seed-actor-test",
        tenantId: "seed-tenant-a",
        retentionPolicyId: "retention-v1",
        activeRole: "parent",
        playerId: "seed-player-001",
        accessRevision: 1,
        hmacKey: "test-only-session-key-material-0123456789",
        now,
      });
      const collection = db.collection("session_sso_credentials");
      await createSessionSsoCredential(collection, {
        session: issued.document,
        issuer: "https://sso.example.test",
        clientId: "habi-test-client",
        accessToken: "integration-access-token",
        refreshToken: "integration-refresh-token",
        expiresIn: 3600,
        encryptionKey: key,
        now,
      });
      const original = await collection.findOne({
        sessionId: issued.document.id,
      });
      assert.ok(original);
      const credentialIndexes = (await collection.indexes()).map(
        ({ name }) => name,
      );
      assert.ok(
        credentialIndexes.includes("session_sso_credential_session_unique"),
      );
      assert.ok(
        credentialIndexes.includes("session_sso_credential_expiry_ttl"),
      );
      assert.equal(
        JSON.stringify(original).includes("integration-access-token"),
        false,
      );
      assert.equal(
        JSON.stringify(original).includes("integration-refresh-token"),
        false,
      );
      await assert.rejects(
        collection.insertOne({
          ...original,
          plaintextRefreshToken: "forbidden",
        }),
        (error) => error.code === 121,
      );

      await collection.updateOne(
        { sessionId: issued.document.id },
        { $set: { accessTokenExpiresAt: new Date(now.getTime() - 1) } },
      );
      let refreshCalls = 0;
      const refresh = async (token) => {
        refreshCalls += 1;
        assert.equal(token, "integration-refresh-token");
        await new Promise((resolve) => setTimeout(resolve, 80));
        return {
          accessToken: "integration-access-token-rotated",
          refreshToken: "integration-refresh-token-rotated",
          expiresIn: 3600,
        };
      };
      const getToken = () =>
        getSessionAccessToken({
          collection,
          sessionId: issued.document.id,
          encryptionKey: key,
          refresh,
          leaseMs: 2000,
          waitMs: 1000,
          pollMs: 10,
        });
      assert.deepEqual(await Promise.all([getToken(), getToken()]), [
        "integration-access-token-rotated",
        "integration-access-token-rotated",
      ]);
      assert.equal(refreshCalls, 1);
      const rotated = await collection.findOne({
        sessionId: issued.document.id,
      });
      assert.equal(rotated.revision, 2);
      assert.equal(rotated.refreshLeaseId, null);
      assert.equal(rotated.refreshLeaseExpiresAt, null);
      assert.equal(
        await readSessionSsoCredential(collection, {
          sessionId: issued.document.id,
        }).then((document) => document.revision),
        2,
      );
      assert.equal(
        await revokeSessionSsoCredential(collection, {
          sessionId: issued.document.id,
        }),
        true,
      );
      assert.equal(
        await readSessionSsoCredential(collection, {
          sessionId: issued.document.id,
        }),
        null,
      );
    },
  );

  await t.test(
    "logout revokes a real session and its encrypted credential",
    async () => {
      const now = new Date();
      const hmacKey = "test-only-session-key-material-0123456789";
      const encryptionKey =
        "test-refresh-encryption-key-with-strong-length-0123456789";
      const issued = await issueSession(db.collection("sessions"), {
        actorId: "seed-actor-test",
        tenantId: "seed-tenant-a",
        retentionPolicyId: "retention-v1",
        activeRole: "parent",
        playerId: "seed-player-001",
        accessRevision: 1,
        hmacKey,
        now,
      });
      await createSessionSsoCredential(
        db.collection("session_sso_credentials"),
        {
          session: issued.document,
          issuer: "https://sso.example.test",
          clientId: "habi-test-client",
          accessToken: "logout-access-token",
          refreshToken: "logout-refresh-token",
          expiresIn: 3600,
          encryptionKey,
          now,
        },
      );
      const response = await createLogoutHandler({
        db,
        hmacKey,
        now: () => now,
      })(
        new Request("https://habi.example.test/auth/logout", {
          method: "POST",
          headers: {
            Origin: "https://habi.example.test",
            Cookie: `${SESSION_COOKIE}=${issued.token}`,
            [CSRF_HEADER]: issued.csrfToken,
          },
        }),
      );
      assert.equal(response.status, 204);
      assert.ok(
        await db
          .collection("sessions")
          .findOne({ id: issued.document.id, revokedAt: now.toISOString() }),
      );
      assert.ok(
        await db
          .collection("session_sso_credentials")
          .findOne({ sessionId: issued.document.id, revokedAt: now }),
      );
    },
  );

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
