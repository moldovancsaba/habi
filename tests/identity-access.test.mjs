import assert from "node:assert/strict";
import test from "node:test";
import { resolveSsoIdentityAccess } from "../src/lib/auth/identity-access.mjs";

function testDatabase({
  identity,
  actor,
  memberships = [],
  tenants = [],
  players = [],
}) {
  const queries = [];
  const data = {
    identities: identity ? [identity] : [],
    actors: actor ? [actor] : [],
    memberships,
    tenants,
    players,
  };
  return {
    queries,
    collection(name) {
      return {
        async findOne(query) {
          queries.push({ name, query });
          return (
            (data[name] ?? []).find((row) =>
              Object.entries(query).every(([key, value]) => row[key] === value),
            ) ?? null
          );
        },
        find(query) {
          queries.push({ name, query });
          const rows = (data[name] ?? []).filter(
            (row) =>
              row.actorId === query.actorId &&
              row.status === query.status &&
              (row.expiresAt === null ||
                Date.parse(row.expiresAt) >
                  Date.parse(query.$or[1].expiresAt.$gt)),
          );
          return {
            sort() {
              return this;
            },
            limit() {
              return this;
            },
            async toArray() {
              return rows;
            },
          };
        },
      };
    },
  };
}

test("identity lookup is exact issuer and subject and never falls back to email", async () => {
  const db = testDatabase({ identity: null, actor: null });
  assert.equal(
    await resolveSsoIdentityAccess(db, {
      issuer: "https://sso.example",
      subject: "sub-1",
    }),
    null,
  );
  assert.deepEqual(db.queries, [
    {
      name: "identities",
      query: { issuer: "https://sso.example", subject: "sub-1" },
    },
  ]);
});

test("only active actor, nonexpired membership, active tenant and same-tenant player resolve", async () => {
  const identity = {
    id: "identity-1",
    actorId: "actor-1",
    issuer: "https://sso.example",
    subject: "sub-1",
  };
  const actor = {
    id: "actor-1",
    identityId: "identity-1",
    status: "active",
    accessRevision: 4,
    retentionPolicyId: "retention-v1",
  };
  const memberships = [
    {
      id: "parent-1",
      tenantId: "tenant-a",
      actorId: "actor-1",
      status: "active",
      role: "parent",
      playerId: "player-a",
      expiresAt: null,
      revision: 3,
      retentionPolicyId: "retention-v1",
    },
    {
      id: "player-1",
      tenantId: "tenant-a",
      actorId: "actor-1",
      status: "active",
      role: "player",
      playerId: "player-a",
      expiresAt: null,
      revision: 2,
      retentionPolicyId: "retention-v1",
    },
    {
      id: "player-wrong-actor",
      tenantId: "tenant-a",
      actorId: "actor-1",
      status: "active",
      role: "player",
      playerId: "player-b",
      expiresAt: null,
      revision: 1,
      retentionPolicyId: "retention-v1",
    },
    {
      id: "coach-expired",
      tenantId: "tenant-a",
      actorId: "actor-1",
      status: "active",
      role: "coach",
      playerId: null,
      expiresAt: "2020-01-01T00:00:00.000Z",
      revision: 1,
      retentionPolicyId: "retention-v1",
    },
    {
      id: "parent-other-tenant",
      tenantId: "tenant-b",
      actorId: "actor-1",
      status: "active",
      role: "parent",
      playerId: "player-a",
      expiresAt: null,
      revision: 1,
      retentionPolicyId: "retention-v1",
    },
    {
      id: "coach-1",
      tenantId: "tenant-a",
      actorId: "actor-1",
      status: "active",
      role: "coach",
      playerId: null,
      expiresAt: null,
      revision: 2,
      retentionPolicyId: "retention-v1",
    },
  ];
  const db = testDatabase({
    identity,
    actor,
    memberships,
    tenants: [
      { id: "tenant-a", tenantId: "tenant-a", status: "active" },
      { id: "tenant-b", tenantId: "tenant-b", status: "active" },
    ],
    players: [
      { id: "player-a", tenantId: "tenant-a", actorId: "actor-1" },
      { id: "player-b", tenantId: "tenant-a", actorId: "actor-else" },
    ],
  });
  const access = await resolveSsoIdentityAccess(db, {
    issuer: "https://sso.example",
    subject: "sub-1",
    now: new Date("2026-10-25T00:00:00.000Z"),
  });
  assert.equal(access.actorAccessRevision, 4);
  assert.deepEqual(
    access.memberships.map(({ id }) => id),
    ["parent-1", "player-1", "coach-1"],
  );
});

test("suspended actor and an actor-identity mismatch have no access", async () => {
  const identity = {
    id: "identity-1",
    actorId: "actor-1",
    issuer: "https://sso.example",
    subject: "sub-1",
  };
  assert.equal(
    await resolveSsoIdentityAccess(
      testDatabase({
        identity,
        actor: { id: "actor-1", identityId: "identity-1", status: "suspended" },
      }),
      { issuer: "https://sso.example", subject: "sub-1" },
    ),
    null,
  );
  assert.equal(
    await resolveSsoIdentityAccess(
      testDatabase({
        identity,
        actor: {
          id: "actor-1",
          identityId: "identity-other",
          status: "active",
        },
      }),
      { issuer: "https://sso.example", subject: "sub-1" },
    ),
    null,
  );
});
