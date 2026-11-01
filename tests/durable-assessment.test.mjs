import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { runMigrations } from "../src/lib/database/migrations/runner.mjs";
import { applySyntheticSeed } from "../src/lib/database/seed.mjs";
import {
  writeAssessmentAttempt,
  readAssessmentAttempt,
} from "../src/lib/workflows/assessment-attempts.mjs";
import { cancelJob } from "../src/lib/workflows/job-cancellation.mjs";
import { startCoachTurn } from "../src/lib/workflows/ai-coach.mjs";
import content from "../src/lib/content/coach-assessments-v1.json" with {
  type: "json",
};
const topic = content.topics.find((t) =>
  content.items.some((i) => i.construct_id === t.id),
);
const items = content.items.filter((i) => i.construct_id === topic.id);
const at = new Date("2026-11-01T09:00:00Z");
function req(path, body, key = randomUUID()) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}
test("durable attempts and user cancellation commit atomically and retain ownership fences", {
  skip: !process.env.HABI_TEST_MONGODB_URI,
}, async (t) => {
  const uri = process.env.HABI_TEST_MONGODB_URI;
  assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost):/);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(`habi_attempts_${process.pid}_${Date.now()}_test`);
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  await runMigrations(db);
  await applySyntheticSeed(db);
  const principal = {
    tenantId: "seed-tenant-a",
    actorId: "seed-a-coach-one",
    role: "coach",
    playerId: null,
    retentionPolicyId: "synthetic-retention-v1",
    accessRevision: 1,
  };
  const common = { client, db, principal, now: at };
  const playerId = "seed-player-001";
  const startBody = {
    topicId: topic.id,
    mode: "questionnaire",
    date: "2026-11-01",
  };
  const start = (key = randomUUID()) =>
    writeAssessmentAttempt({
      ...common,
      playerId,
      request: req(
        `/api/v1/players/${playerId}/assessment-attempts`,
        startBody,
        key,
      ),
    });
  const mutate = (a, action, body, key) =>
    writeAssessmentAttempt({
      ...common,
      id: a.id,
      action,
      request: req(
        `/api/v1/assessment-attempts/${a.id}/${action}`,
        { expectedRevision: a.revision, ...body },
        key,
      ),
    });
  await t.test(
    "start and answer retries produce one logical attempt and saved answer",
    async () => {
      const key = randomUUID();
      const a = (await start(key)).body;
      const replay = (await start(key)).body;
      assert.equal(a.id, replay.id);
      const answerKey = randomUUID();
      const b = (
        await mutate(a, "answers", { itemId: items[0].id, value: 3 }, answerKey)
      ).body;
      const again = (
        await mutate(a, "answers", { itemId: items[0].id, value: 3 }, answerKey)
      ).body;
      assert.deepEqual(again, b);
      assert.equal(b.submittedItems.length, 1);
      const read = await readAssessmentAttempt({ ...common, id: a.id });
      assert.equal(read.submittedItems[0].value, 3);
      await assert.rejects(
        mutate(a, "answers", { itemId: items[0].id, value: 2 }),
        { code: "REVISION_CONFLICT" },
      );
      await mutate(b, "interrupt", {});
      await assert.rejects(
        mutate({ ...b, revision: b.revision + 1 }, "complete", {
          fields: { example: "Synthetic" },
        }),
        { code: "REVISION_CONFLICT" },
      );
    },
  );
  await t.test(
    "completion requires every explicit answer or skip and produces one legacy-readable result",
    async () => {
      let a = (await start()).body;
      await assert.rejects(
        mutate(a, "complete", { fields: { example: "Synthetic" } }),
        { code: "INVALID_INPUT" },
      );
      for (const item of items)
        a = (await mutate(a, "answers", { itemId: item.id, value: 3 })).body;
      const key = randomUUID();
      const done = (
        await mutate(
          a,
          "complete",
          { fields: { example: "Szintetikus példa" } },
          key,
        )
      ).body;
      const again = (
        await mutate(
          a,
          "complete",
          { fields: { example: "Szintetikus példa" } },
          key,
        )
      ).body;
      assert.equal(done.status, "completed");
      assert.deepEqual(again.resultRef, done.resultRef);
      assert.equal(
        await db.collection("records").countDocuments({ sessionId: a.id }),
        1,
      );
      const record = await db
        .collection("records")
        .findOne({ id: done.resultRef.id });
      assert.match(record.text, /Szintetikus példa/);
      assert.equal(record.sharingClass, "coach");
      assert.ok(
        (await db
          .collection("events")
          .countDocuments({ kind: "activity.assessment-attempts.complete" })) >
          0,
      );
    },
  );
  await t.test(
    "observers read but cannot append to another coach attempt; expired attempts cannot resume",
    async () => {
      const a = (await start()).body;
      const observer = { ...principal, actorId: "seed-a-coach-two" };
      assert.equal(
        (
          await readAssessmentAttempt({
            ...common,
            principal: observer,
            id: a.id,
          })
        ).id,
        a.id,
      );
      await assert.rejects(
        writeAssessmentAttempt({
          ...common,
          principal: observer,
          id: a.id,
          action: "interrupt",
          request: req(`/api/v1/assessment-attempts/${a.id}/interrupt`, {
            expectedRevision: a.revision,
          }),
        }),
        { code: "NOT_FOUND" },
      );
      await assert.rejects(
        readAssessmentAttempt({
          ...common,
          principal: { ...principal, tenantId: "seed-tenant-b" },
          id: a.id,
        }),
        { code: "NOT_FOUND" },
      );
      await assert.rejects(
        startCoachTurn({
          ...common,
          principal: { ...principal, role: "parent", playerId: "not-owned" },
          playerId,
          request: req("/api/v1/unused", {}),
        }),
      );
      const expired = await writeAssessmentAttempt({
        ...common,
        now: new Date(at.getTime() + 5 * 3600000),
        id: a.id,
        action: "answers",
        request: req(`/api/v1/assessment-attempts/${a.id}/answers`, {
          expectedRevision: a.revision,
          itemId: items[0].id,
          value: 3,
        }),
      });
      assert.equal(expired.body.status, "expired");
      assert.equal(expired.body.submittedItems.length, 0);
    },
  );
  await t.test(
    "processing cancellation invalidates worker fence and observer cancellation is denied",
    async () => {
      const result = await startCoachTurn({
        ...common,
        playerId,
        request: req(`/api/v1/players/${playerId}/ai-coach`, {
          threadId: null,
          context: {
            kind: "page",
            id: "overview",
            page: "overview",
            revision: 1,
          },
          question: "Szintetikus kérdés",
          expectedRevision: 0,
        }),
      });
      const id = result.jobId;
      assert.ok(id);
      await db.collection("jobs").updateOne(
        { id },
        {
          $set: {
            status: "running",
            leaseUntil: "2026-11-01T10:00:00Z",
            leaseTokenHash: "a".repeat(64),
          },
        },
      );
      const job = await db.collection("jobs").findOne({ id });
      const key = randomUUID();
      const command = () =>
        cancelJob({
          ...common,
          id,
          request: req(
            `/api/v1/jobs/${id}/cancel`,
            { expectedRevision: job.revision },
            key,
          ),
        });
      await assert.rejects(
        cancelJob({
          ...common,
          principal: { ...principal, actorId: "seed-a-coach-two" },
          id,
          request: req(`/api/v1/jobs/${id}/cancel`, {
            expectedRevision: job.revision,
          }),
        }),
        { code: "NOT_FOUND" },
      );
      assert.equal((await command()).body.status, "cancelled");
      assert.equal((await command()).body.status, "cancelled");
      const cancelled = await db.collection("jobs").findOne({ id });
      assert.equal(cancelled.fence, job.fence + 1);
      assert.equal(cancelled.leaseUntil, null);
      assert.equal(cancelled.leaseTokenHash, null);
      assert.equal(
        await db
          .collection("events")
          .countDocuments({ kind: "activity.jobs.post", "resourceRef.id": id }),
        1,
      );
    },
  );
});

test("record corrections keep immutable originals and retire superseded facts", {
  skip: !process.env.HABI_TEST_MONGODB_URI,
}, async (t) => {
  const { createRecord, getRecord } = await import(
    "../src/lib/workflows/records.mjs"
  );
  const { correctRecord } = await import(
    "../src/lib/workflows/record-corrections.mjs"
  );
  const { collectCoachSources, getCoachProfile } = await import(
    "../src/lib/workflows/coach-memory.mjs"
  );
  assert.match(
    process.env.HABI_TEST_MONGODB_URI,
    /^mongodb:\/\/(127\.0\.0\.1|localhost):/,
  );
  const client = new MongoClient(process.env.HABI_TEST_MONGODB_URI);
  await client.connect();
  const db = client.db(`habi_corrections_${process.pid}_${Date.now()}_test`);
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  await runMigrations(db);
  await applySyntheticSeed(db);
  const principal = {
    tenantId: "seed-tenant-a",
    actorId: "seed-a-coach-one",
    role: "coach",
    playerId: null,
    retentionPolicyId: "synthetic-retention-v1",
    accessRevision: 1,
  };
  const playerId = "seed-player-001";
  const common = { client, db, principal, playerId, now: at };
  const original = (
    await createRecord({
      ...common,
      request: req(`/api/v1/players/${playerId}/records`, {
        kind: "observation",
        text: "Szintetikus eredeti reggeli.",
        occurredAt: at.toISOString(),
        timeZone: "Europe/Budapest",
        sourceKind: "observation",
        sessionId: null,
        metric: null,
        answerCode: null,
        context: { setting: "training", activity: null, durationMinutes: null },
      }),
    })
  ).body;
  const body = {
    expectedRevision: original.revision,
    reason: "Pontosított étkezés",
    replacement: { text: "Szintetikus pontosított vacsora." },
  };
  const key = randomUUID();
  const path = `/api/v1/players/${playerId}/records/${original.id}/corrections`;
  const mutate = (p = principal, commandKey = key, payload = body) =>
    correctRecord({
      ...common,
      principal: p,
      id: original.id,
      request: req(path, payload, commandKey),
    });
  const next = (await mutate()).body;
  assert.equal(next.supersedesId, original.id);
  assert.equal((await mutate()).body.id, next.id);
  const old = await getRecord({ ...common, id: original.id });
  assert.equal(old.text, original.text);
  assert.equal(old.revision, original.revision);
  assert.equal(old.supersededByRef.id, next.id);
  await assert.rejects(mutate(principal, randomUUID()), {
    code: "REVISION_CONFLICT",
  });
  await assert.rejects(
    mutate({ ...principal, actorId: "seed-a-coach-two" }, randomUUID()),
    { code: "NOT_FOUND" },
  );
  const { sources } = await collectCoachSources(db, principal, playerId);
  assert.equal(
    sources.find((s) => s.id === original.id).kind,
    "retired_records",
  );
  const { profile } = await getCoachProfile(common);
  assert.ok(
    !profile.facts.some((f) => f.sourceRefs.some((r) => r.id === original.id)),
  );
  assert.ok(
    (await db.collection("records").findOne({ id: next.id })).correctionReason,
  );
});
