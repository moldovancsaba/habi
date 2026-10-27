import assert from "node:assert/strict";
import test from "node:test";
import { HabiApiError } from "../src/lib/api/error-response.mjs";
import {
  completeCheckin,
  createCheckinSession,
  listCheckinResults,
  readCheckinSession,
  saveCheckinAnswer,
} from "../src/lib/workflows/checkin.mjs";

function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected && typeof expected === "object" && "$gt" in expected) {
      return Date.parse(actual) > Date.parse(expected.$gt);
    }
    if (
      expected &&
      typeof expected === "object" &&
      ("$lte" in expected || "$gte" in expected)
    ) {
      return (
        (!expected.$lte || Date.parse(actual) <= Date.parse(expected.$lte)) &&
        (!expected.$gte || Date.parse(actual) >= Date.parse(expected.$gte))
      );
    }
    return actual === expected;
  });
}

function testDatabase() {
  const state = {
    players: [{ tenantId: "seed-tenant-a", id: "seed-player-001" }],
  };
  const collections = new Map();
  function collection(name) {
    if (collections.has(name)) return collections.get(name);
    if (!state[name]) state[name] = [];
    const documents = state[name];
    const result = {
      documents,
      async findOne(filter) {
        return structuredClone(
          documents.find((document) => matches(document, filter)) ?? null,
        );
      },
      async insertOne(document) {
        if (
          documents.some(
            (item) =>
              item.id &&
              item.id === document.id &&
              item.tenantId === document.tenantId,
          )
        ) {
          const error = new Error("duplicate key");
          error.code = 11000;
          throw error;
        }
        documents.push(structuredClone(document));
      },
      async updateOne(filter, update, options = {}) {
        let document = documents.find((item) => matches(item, filter));
        if (!document && options.upsert) {
          document = structuredClone(filter);
          Object.assign(document, structuredClone(update.$setOnInsert ?? {}));
          documents.push(document);
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        if (!document)
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        Object.assign(document, structuredClone(update.$set ?? {}));
        for (const [key, amount] of Object.entries(update.$inc ?? {}))
          document[key] = (document[key] ?? 0) + amount;
        for (const [key, value] of Object.entries(update.$push ?? {}))
          document[key].push(structuredClone(value));
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      },
      async deleteOne(filter) {
        const index = documents.findIndex((item) => matches(item, filter));
        if (index < 0) return { deletedCount: 0 };
        documents.splice(index, 1);
        return { deletedCount: 1 };
      },
      find(filter) {
        let found = documents.filter((item) => matches(item, filter));
        return {
          sort(spec) {
            const [[field, order]] = Object.entries(spec);
            found = [...found].sort(
              (a, b) =>
                String(a[field]).localeCompare(String(b[field])) * order,
            );
            return this;
          },
          limit(amount) {
            found = found.slice(0, amount);
            return this;
          },
          async toArray() {
            return structuredClone(found);
          },
        };
      },
    };
    collections.set(name, result);
    return result;
  }
  const db = { collection };
  const client = {
    startSession() {
      return {
        async withTransaction(callback) {
          await callback();
        },
        async endSession() {},
      };
    },
  };
  return { db, client, state };
}

const now = new Date("2026-10-25T10:00:00.000Z");
const player = {
  actorId: "seed-a-player-actor",
  tenantId: "seed-tenant-a",
  retentionPolicyId: "synthetic-retention-v1",
  role: "player",
  playerId: "seed-player-001",
};
const parent = { ...player, actorId: "seed-a-parent-one", role: "parent" };

function request(path, body, key) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

test("player check-in persists answers and immutable feedback; parent reads the saved snapshot", async () => {
  const { db, client } = testDatabase();
  const start = await createCheckinSession({
    request: request(
      "/v1/players/seed-player-001/checkin-sessions",
      { timeZone: "Europe/Budapest", instrumentVersion: "checkin-hu-1" },
      "start-one",
    ),
    db,
    client,
    principal: player,
    playerId: player.playerId,
    now,
  });
  assert.equal(start.status, 201);
  assert.equal(start.body.status, "started");
  assert.deepEqual(start.body.answers, []);

  const saved = await saveCheckinAnswer({
    request: request(
      `/v1/checkin-sessions/${start.body.id}/answers`,
      { expectedRevision: 1, metric: "energy", answerCode: 2 },
      "answer-energy",
    ),
    db,
    client,
    principal: player,
    id: start.body.id,
    now,
  });
  assert.equal(saved.status, 201);
  assert.deepEqual(saved.body, {
    id: saved.body.id,
    revision: 1,
    metric: "energy",
    answerCode: 2,
    submittedAt: now.toISOString(),
  });

  const complete = await completeCheckin({
    request: request(
      `/v1/checkin-sessions/${start.body.id}/complete`,
      { expectedRevision: 2 },
      "complete-one",
    ),
    db,
    client,
    principal: player,
    id: start.body.id,
    now,
  });
  assert.equal(complete.body.answerCodes.length, 1);
  assert.deepEqual(complete.body.answerCodes[0], { metric: "energy", code: 2 });
  assert.equal(complete.body.sessionRef.revision, 3);
  assert.equal(complete.body.personalText, null);

  const parentView = await readCheckinSession({
    db,
    principal: parent,
    id: start.body.id,
  });
  assert.equal(parentView.status, "completed");
  assert.deepEqual(
    parentView.answers.map(({ metric, answerCode }) => ({
      metric,
      answerCode,
    })),
    [{ metric: "energy", answerCode: 2 }],
  );
  assert.equal(Object.hasOwn(parentView, "tenantId"), false);
});

test("check-in history accepts an authorized date window", async () => {
  const { db, state } = testDatabase();
  state.checkin_results = [
    {
      tenantId: player.tenantId,
      playerId: player.playerId,
      id: "before",
      completedAt: "2026-10-24T23:59:59.000Z",
    },
    {
      tenantId: player.tenantId,
      playerId: player.playerId,
      id: "inside",
      completedAt: "2026-10-25T10:00:00.000Z",
    },
    {
      tenantId: player.tenantId,
      playerId: player.playerId,
      id: "after",
      completedAt: "2026-10-26T00:00:00.000Z",
    },
  ];
  const page = await listCheckinResults({
    db,
    principal: parent,
    playerId: player.playerId,
    from: "2026-10-25T00:00:00.000Z",
    to: "2026-10-25T23:59:59.999Z",
  });
  assert.deepEqual(
    page.items.map((item) => item.id),
    ["inside"],
  );
  await assert.rejects(
    listCheckinResults({
      db,
      principal: parent,
      playerId: player.playerId,
      from: "not-a-date",
    }),
    (error) => error instanceof HabiApiError && error.code === "INVALID_INPUT",
  );
});

test("check-in answer writes require the player role, expected revision, and unique metric", async () => {
  const { db, client } = testDatabase();
  const start = await createCheckinSession({
    request: request(
      "/v1/players/seed-player-001/checkin-sessions",
      { timeZone: "Europe/Budapest", instrumentVersion: "checkin-hu-1" },
      "start-two",
    ),
    db,
    client,
    principal: player,
    playerId: player.playerId,
    now,
  });
  await assert.rejects(
    () =>
      saveCheckinAnswer({
        request: request(
          `/v1/checkin-sessions/${start.body.id}/answers`,
          { expectedRevision: 1, metric: "energy", answerCode: 2 },
          "parent-answer",
        ),
        db,
        client,
        principal: parent,
        id: start.body.id,
        now,
      }),
    (error) => error instanceof HabiApiError && error.code === "ACCESS_DENIED",
  );
  await saveCheckinAnswer({
    request: request(
      `/v1/checkin-sessions/${start.body.id}/answers`,
      { expectedRevision: 1, metric: "energy", answerCode: 2 },
      "answer-two",
    ),
    db,
    client,
    principal: player,
    id: start.body.id,
    now,
  });
  await assert.rejects(
    () =>
      saveCheckinAnswer({
        request: request(
          `/v1/checkin-sessions/${start.body.id}/answers`,
          { expectedRevision: 1, metric: "sleep", answerCode: 1 },
          "stale-answer",
        ),
        db,
        client,
        principal: player,
        id: start.body.id,
        now,
      }),
    (error) =>
      error instanceof HabiApiError && error.code === "REVISION_CONFLICT",
  );
  await assert.rejects(
    () =>
      saveCheckinAnswer({
        request: request(
          `/v1/checkin-sessions/${start.body.id}/answers`,
          { expectedRevision: 2, metric: "energy", answerCode: 1 },
          "duplicate-metric",
        ),
        db,
        client,
        principal: player,
        id: start.body.id,
        now,
      }),
    (error) =>
      error instanceof HabiApiError && error.code === "REVISION_CONFLICT",
  );
});
