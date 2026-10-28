import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { runMigrations } from "../src/lib/database/migrations/runner.mjs";
import { applySyntheticSeed } from "../src/lib/database/seed.mjs";
import {
  buildCoachProfile,
  contentSource,
  getCoachProfile,
  selectRelevantSources,
} from "../src/lib/workflows/coach-memory.mjs";
import {
  startCoachTurn,
  readCoachThread,
  listCoachThreads,
  writeCoachEvent,
  reviewCoachTurn,
  listCoachReviews,
  verifyCoachSources,
  coachJobProgress,
} from "../src/lib/workflows/ai-coach.mjs";
import {
  claimWorkerJob,
  heartbeatWorkerJob,
  deferWorkerJob,
  getWorkerJobContext,
  completeWorkerJob,
} from "../src/lib/workflows/worker-jobs.mjs";
import { hashRequestBody } from "../src/lib/database/idempotent-command.mjs";

const now = new Date("2026-10-27T10:00:00.000Z");
const sleep = (id, at, text = "Hogyan aludtál? Rosszul") => ({
  id,
  revision: 1,
  span: null,
  kind: "checkin_results",
  title: text,
  text,
  at,
  role: "player",
});
test("player memory preserves conflicting answers, time windows and explicit corrections", () => {
  const sources = [
    sleep("old", "2026-10-01T09:00:00.000Z"),
    sleep("one", "2026-10-25T09:00:00.000Z"),
    sleep("two", "2026-10-26T09:00:00.000Z", "Hogyan aludtál? Jól"),
  ];
  const profile = buildCoachProfile(sources, [], now);
  const fact = profile.facts.find((f) => f.id === "pattern-sleep-7-3");
  assert.match(fact.text, /1 alkalommal/);
  assert.equal(fact.counterEvidence[0].id, "two");
  const corrected = buildCoachProfile(
    sources,
    [{ kind: "correction", targetId: fact.id }],
    now,
  );
  assert.ok(!corrected.facts.some((f) => f.id === fact.id));
  assert.equal(profile.recommendations[0].practiceId, "sleep");
  assert.equal(profile.recommendations[0].reviewAt, "2026-11-01T09:00:00.000Z");
});
test("retrieval retains relevant older evidence instead of taking only the latest records", () => {
  const older = {
    ...sleep("older", "2024-01-01T00:00:00Z"),
    text: "A bemelegítés segített a kezdésnél.",
  };
  const records = [
    older,
    ...Array.from({ length: 30 }, (_, i) => ({
      ...sleep(`new-${i}`, "2026-10-26T00:00:00Z"),
      text: "Mai rövid bejegyzés",
    })),
  ];
  assert.ok(
    selectRelevantSources(records, "bemelegítés", null).some(
      (s) => s.id === "older",
    ),
  );
  assert.ok(
    contentSource({ kind: "practice", id: "focus" }).text.includes(
      "Nevezd meg",
    ),
  );
  assert.equal(contentSource({ kind: "practice", id: "forged" }), null);
  const latestCheckin = sleep("real-checkin", "2026-10-26T09:00:00Z");
  const chatFlood = Array.from({ length: 30 }, (_, i) => ({
    ...latestCheckin,
    id: `message-${i}`,
    kind: "messages",
    at: "2026-10-27T09:00:00Z",
    text: "Közös beszélgetés",
  }));
  assert.ok(
    selectRelevantSources(
      [latestCheckin, ...chatFlood],
      "Hogy áll a srác?",
      null,
    ).some((s) => s.id === latestCheckin.id),
  );
});
test("conversation preferences stay tentative until explicitly confirmed", () => {
  const source = {
    ...sleep("coach-question-one", "2026-10-26T09:00:00.000Z"),
    kind: "conversation_note",
    text: "Nekem reggel könnyebb.",
  };
  const p = buildCoachProfile([source], [], now);
  assert.equal(
    p.facts.find((f) => f.id === `fact-${source.id}`).status,
    "candidate",
  );
  const confirmed = buildCoachProfile(
    [source],
    [{ kind: "memory", targetId: `fact-${source.id}` }],
    now,
  );
  assert.ok(!confirmed.facts.some((f) => f.id === `fact-${source.id}`));
});
test("job progress distinguishes the provider queue, repair, retry and a lost heartbeat", () => {
  const turn = {
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: "queued",
  };
  const base = {
    status: "running",
    reasonCode: "AI_PROVIDER_QUEUED",
    leaseUntil: new Date(now.getTime() + 90000).toISOString(),
    updatedAt: now.toISOString(),
    attempts: 2,
  };
  assert.equal(coachJobProgress(base, turn, now, 2).phase, "provider_wait");
  assert.equal(
    coachJobProgress({ ...base, reasonCode: "AI_REPAIRING" }, turn, now).phase,
    "repairing",
  );
  assert.equal(
    coachJobProgress(
      {
        ...base,
        status: "queued",
        nextAttemptAt: new Date(now.getTime() + 30000).toISOString(),
      },
      turn,
      now,
    ).phase,
    "retry_wait",
  );
  assert.equal(
    coachJobProgress(base, turn, new Date(now.getTime() + 100000)).phase,
    "reconnecting",
  );
  assert.equal(
    coachJobProgress({ ...base, status: "succeeded" }, turn, now).phase,
    "completed",
  );
});
test("contextual coach persists private dialogue, refreshes memory and validates reviews and exact source revisions", {
  skip: !process.env.HABI_TEST_MONGODB_URI,
}, async (t) => {
  const client = new MongoClient(process.env.HABI_TEST_MONGODB_URI);
  await client.connect();
  const db = client.db(`habi_ai_${process.pid}_${Date.now()}_test`);
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  await runMigrations(db);
  await applySyntheticSeed(db);
  const shared = {
    tenantId: "seed-tenant-a",
    retentionPolicyId: "synthetic-retention-v1",
    accessRevision: 1,
  };
  const player = {
    ...shared,
    actorId: "seed-a-player-actor",
    role: "player",
    playerId: "seed-player-001",
  };
  const parent = {
    ...shared,
    actorId: "seed-a-parent-one",
    role: "parent",
    playerId: player.playerId,
  };
  const coach = {
    ...shared,
    actorId: "seed-a-coach-one",
    role: "coach",
    playerId: null,
  };
  const args = {
    client,
    db,
    principal: player,
    playerId: player.playerId,
    now,
  };
  const context = { page: "checkin", kind: "page", id: "checkin", revision: 1 };
  const request = (path, body, key = randomUUID()) =>
    new Request(
      `http://127.0.0.1:3000/api/v1/players/${player.playerId}${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(body),
      },
    );
  let first, second, claimed;
  await t.test(
    "explicit questions queue real AI work, retries replay and thread ownership remains private",
    async () => {
      const body = {
        threadId: null,
        question: "Mit mutat az állapotjelzés?",
        context,
        expectedRevision: 0,
      };
      const key = randomUUID();
      first = await startCoachTurn({
        ...args,
        request: request("/ai-coach", body, key),
      });
      assert.deepEqual(
        await startCoachTurn({
          ...args,
          request: request("/ai-coach", body, key),
        }),
        first,
      );
      assert.equal(
        (await listCoachThreads({ ...args, principal: parent })).items.length,
        0,
      );
      await assert.rejects(
        readCoachThread({ ...args, principal: parent, id: first.threadId }),
        { message: "NOT_FOUND" },
      );
      await assert.rejects(
        startCoachTurn({
          ...args,
          principal: parent,
          request: request("/ai-coach", {
            ...body,
            threadId: first.threadId,
            question: "cizí",
            expectedRevision: 1,
          }),
        }),
        { message: "NOT_FOUND" },
      );
    },
  );
  await t.test(
    "opening never blocks the composer and multiple user questions persist while answers wait",
    async () => {
      const opened = await startCoachTurn({
        ...args,
        request: request("/ai-coach", {
          threadId: null,
          question: "",
          context,
          expectedRevision: 0,
        }),
      });
      assert.equal(opened.jobId, null);
      assert.equal(opened.turnId, null);
      let detail = await readCoachThread({ ...args, id: opened.threadId });
      assert.equal(detail.items.length, 0);
      assert.ok(detail.thread.opening);
      const a = await startCoachTurn({
        ...args,
        request: request("/ai-coach", {
          threadId: opened.threadId,
          question: "Első saját kérdés",
          context,
          expectedRevision: detail.thread.revision,
        }),
      });
      detail = await readCoachThread({ ...args, id: opened.threadId });
      const b = await startCoachTurn({
        ...args,
        request: request("/ai-coach", {
          threadId: opened.threadId,
          question: "Második saját kérdés",
          context,
          expectedRevision: detail.thread.revision,
        }),
      });
      detail = await readCoachThread({ ...args, id: opened.threadId });
      assert.equal(detail.items.filter((t) => t.status === "queued").length, 2);
      // Keep the shared test worker focused on the original test thread.
      await db
        .collection("jobs")
        .updateMany(
          { id: { $in: [a.jobId, b.jobId] } },
          { $set: { status: "cancelled" } },
        );
    },
  );
  await t.test(
    "a question supersedes a legacy automatic opening without losing either message",
    async () => {
      const opening = await startCoachTurn({
        ...args,
        request: request("/ai-coach", {
          threadId: null,
          question: "Magyarázd el ezt egyszerűen: Állapotjelzések.",
          context,
          expectedRevision: 0,
        }),
      });
      const detail = await readCoachThread({ ...args, id: opening.threadId });
      const own = await startCoachTurn({
        ...args,
        request: request("/ai-coach", {
          threadId: opening.threadId,
          question: "Mit kell tudni Csabáról?",
          context,
          expectedRevision: detail.thread.revision,
        }),
      });
      const job = await db.collection("jobs").findOne({ id: opening.jobId });
      assert.equal(job.status, "cancelled");
      assert.equal(job.reasonCode, "REPLACED_BY_QUESTION");
      const after = await readCoachThread({ ...args, id: opening.threadId });
      assert.equal(
        after.items.find((t) => t.id === own.turnId).status,
        "queued",
      );
      assert.equal(
        after.items.find((t) => t.id === opening.turnId).failureReason,
        "REPLACED_BY_QUESTION",
      );
      await db
        .collection("jobs")
        .updateOne({ id: own.jobId }, { $set: { status: "cancelled" } });
    },
  );
  const worker = { serviceId: "synthetic-coach-worker" };
  async function claim() {
    return claimWorkerJob({
      db,
      clientId: worker.serviceId,
      now: new Date(now.getTime() + 10000),
      request: new Request("http://localhost/api/v1/worker/jobs/claim", {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify({ kinds: ["coachConversation"], maxJobs: 1 }),
      }),
    });
  }
  async function workerContext(job) {
    return getWorkerJobContext({
      db,
      worker,
      id: job.jobId,
      now,
      request: new Request("http://localhost/context", {
        headers: {
          "X-Lease-Token": job.leaseToken,
          "X-Job-Fence": String(job.fence),
        },
      }),
    });
  }
  async function complete(
    job,
    ctx,
    kind = "general",
    refs = ctx.sourceManifest,
  ) {
    const result = {
      status: "awaiting_review",
      questionRevision: ctx.turnRevision,
      claims: [
        {
          id: "claim-1",
          text:
            kind === "inference"
              ? "Lehetséges személyes értelmezés, ellenőrzésre vár."
              : "Az állapotjelzés a saját beszámolódat mutatja.",
          kind,
          evidenceRefs: refs,
          review: null,
        },
      ],
      attributions: [],
      unknowns: [],
      clarifyingQuestions: [],
      suggestedAction: null,
      validity: "review_required",
      manifest: ctx.promptManifest,
    };
    const data = { result, sourceManifest: ctx.sourceManifest };
    return completeWorkerJob({
      client,
      db,
      worker,
      id: job.jobId,
      now,
      request: new Request("http://localhost/complete", {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify({
          fence: job.fence,
          leaseToken: job.leaseToken,
          resultHash: hashRequestBody(data),
          ...data,
        }),
      }),
    });
  }
  await t.test(
    "authored content explains without personal records and complete rejects invented citations",
    async () => {
      claimed = await claim();
      await heartbeatWorkerJob({
        db,
        worker,
        id: claimed.jobId,
        now: new Date(now.getTime() + 20000),
        request: new Request("http://localhost/heartbeat", {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: JSON.stringify({
            fence: claimed.fence,
            leaseToken: claimed.leaseToken,
            progressCode: "provider_queued",
          }),
        }),
      });
      assert.equal(
        (await db.collection("jobs").findOne({ id: claimed.jobId })).reasonCode,
        "AI_PROVIDER_QUEUED",
      );
      const ctx = await workerContext(claimed);
      assert.equal(ctx.coachMode, true);
      assert.equal(ctx.viewerRole, "player");
      assert.equal(ctx.dialogue.length, 0);
      assert.ok(ctx.sourceSnapshots.some((s) => s.kind === "authored_content"));
      await assert.rejects(
        complete(claimed, ctx, "direct", [
          { id: "invented", revision: 1, span: null },
        ]),
        { message: "INVALID_INPUT" },
      );
      await complete(claimed, ctx);
      const thread = await readCoachThread({ ...args, id: first.threadId });
      assert.equal(thread.items[0].answer.claims.length, 1);
      assert.equal(thread.items[0].answer.status, "ready");
    },
  );
  await t.test(
    "follow-up keeps prior question and actual answer in the worker context",
    async () => {
      const thread = await readCoachThread({ ...args, id: first.threadId });
      second = await startCoachTurn({
        ...args,
        now: new Date(now.getTime() + 1000),
        request: request("/ai-coach", {
          threadId: first.threadId,
          question: "Tényleg?",
          context,
          expectedRevision: thread.thread.revision,
        }),
      });
      claimed = await claim();
      const ctx = await workerContext(claimed);
      assert.match(ctx.dialogue[0].answer, /saját beszámolódat/);
      assert.equal(ctx.question, "Tényleg?");
      await complete(claimed, ctx, "inference");
      const result = await readCoachThread({ ...args, id: first.threadId });
      const turn = result.items.find((x) => x.id === second.turnId);
      assert.equal(turn.answer.claims.length, 0);
      assert.equal(turn.pendingReview, true);
    },
  );
  await t.test(
    "only explicitly requested answers enter coach review, without exposing the private thread",
    async () => {
      assert.equal(
        (await listCoachReviews({ ...args, principal: coach })).items.length,
        0,
      );
      const thread = await readCoachThread({ ...args, id: first.threadId });
      const turn = thread.items.find((x) => x.id === second.turnId);
      await reviewCoachTurn({
        ...args,
        id: turn.id,
        request: request(`/ai-reviews/${turn.id}`, {
          decision: "request",
          expectedRevision: turn.revision,
          rationale: "Ezt az egy választ megosztom.",
        }),
      });
      const queue = await listCoachReviews({ ...args, principal: coach });
      assert.equal(queue.items.length, 1);
      await assert.rejects(
        readCoachThread({ ...args, principal: coach, id: first.threadId }),
        { message: "NOT_FOUND" },
      );
      await reviewCoachTurn({
        ...args,
        principal: coach,
        id: turn.id,
        request: request(`/ai-reviews/${turn.id}`, {
          decision: "approved",
          expectedRevision: queue.items[0].revision,
          rationale: "A pontos forrás alapján ellenőriztem.",
        }),
      });
      assert.equal(
        (await readCoachThread({ ...args, id: first.threadId })).items.find(
          (x) => x.id === turn.id,
        ).answer.claims.length,
        1,
      );
    },
  );
  await t.test(
    "explicit player memories and corrections are private and durable",
    async () => {
      await writeCoachEvent({
        ...args,
        request: request("/ai-profile", {
          kind: "memory",
          targetId: "self",
          text: "Reggel szeretek gyakorolni.",
          value: "",
          sourceRefs: [],
        }),
      });
      let profile = (await getCoachProfile(args)).profile;
      assert.ok(profile.facts.some((f) => f.text.includes("Reggel szeretek")));
      assert.ok(
        !(
          await getCoachProfile({ ...args, principal: parent })
        ).profile.facts.some((f) => f.text.includes("Reggel szeretek")),
      );
      const fact = profile.facts.find(
        (f) => f.category === "known" && f.text.includes("Reggel szeretek"),
      );
      await writeCoachEvent({
        ...args,
        request: request("/ai-profile", {
          kind: "correction",
          targetId: fact.id,
          text: "Most inkább délután.",
          value: "outdated",
          sourceRefs: fact.sourceRefs,
        }),
      });
      profile = (await getCoachProfile(args)).profile;
      assert.ok(!profile.facts.some((f) => f.id === fact.id));
      assert.ok(profile.facts.some((f) => f.text.includes("délután")));
    },
  );
  await t.test(
    "profile snapshots keep provenance and disappear when an underlying memory is removed",
    async () => {
      const thread = await readCoachThread({ ...args, id: first.threadId });
      const next = await startCoachTurn({
        ...args,
        now: new Date(now.getTime() + 2000),
        request: request("/ai-coach", {
          threadId: first.threadId,
          question: "Mit jegyeztél meg rólam?",
          context,
          expectedRevision: thread.thread.revision,
        }),
      });
      const job = await claim();
      const ctx = await workerContext(job);
      assert.ok(
        ctx.sourceSnapshots.some(
          (s) => s.kind === "derived_profile" && s.text.includes("délután"),
        ),
      );
      await complete(job, ctx);
      const detail = await readCoachThread({ ...args, id: first.threadId });
      const turn = detail.items.find((t) => t.id === next.turnId);
      assert.equal(turn.profileSnapshot, undefined);
      assert.equal(turn.profileSources, undefined);
      const stored = await db
        .collection("habi_coach_turns")
        .findOne({ id: next.turnId });
      const dependency = stored.profileSources.find(
        (r) => r.id.startsWith("habi-") === false,
      );
      await db
        .collection("habi_coach_profile_events")
        .deleteOne({ id: dependency.id });
      const withdrawn = (
        await readCoachThread({ ...args, id: first.threadId })
      ).items.find((t) => t.id === next.turnId);
      assert.equal(withdrawn.sourceState, "withdrawn");
      assert.equal(withdrawn.answer, null);
      assert.equal(withdrawn.profileSnapshot, undefined);
    },
  );
  await t.test(
    "source revision changes invalidate old answers and wrong player scope is denied",
    async () => {
      await assert.rejects(
        verifyCoachSources(db, player, player.playerId, [
          { id: "habi-page-checkin", revision: 2, span: null },
        ]),
        { message: "NOT_FOUND" },
      );
      await assert.rejects(
        getCoachProfile({ ...args, playerId: "seed-player-002" }),
        { message: "NOT_FOUND" },
      );
      const other = { ...coach, tenantId: "seed-tenant-b" };
      await assert.rejects(getCoachProfile({ ...args, principal: other }), {
        message: "NOT_FOUND",
      });
    },
  );
  await t.test(
    "transient jobs stop retrying after four claims instead of waiting forever",
    async () => {
      const next = await startCoachTurn({
        ...args,
        now: new Date(now.getTime() + 5000),
        request: request("/ai-coach", {
          threadId: null,
          question: "Új kérdés",
          context,
          expectedRevision: 0,
        }),
      });
      await db
        .collection("jobs")
        .updateOne({ id: next.jobId }, { $set: { attempts: 3 } });
      const lease = await claim();
      assert.equal(lease.jobId, next.jobId);
      await deferWorkerJob({
        client,
        db,
        worker,
        id: lease.jobId,
        now: new Date(now.getTime() + 20000),
        request: new Request("http://localhost/defer", {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: JSON.stringify({
            fence: lease.fence,
            leaseToken: lease.leaseToken,
            reasonCode: "DEPENDENCY_UNAVAILABLE",
          }),
        }),
      });
      assert.equal(
        (await db.collection("jobs").findOne({ id: next.jobId })).status,
        "failed",
      );
      const detail = await readCoachThread({ ...args, id: next.threadId });
      assert.equal(detail.items[0].progress.phase, "failed");
    },
  );
  await t.test(
    "attendance guide is version-pinned, delivered to worker and leaves stored answers unchanged",
    async () => {
      const started = await startCoachTurn({
        ...args,
        request: request("/ai-coach", {
          threadId: null,
          question: "menjek ma edzésre?",
          context,
          expectedRevision: 0,
        }),
      });
      const job = await claim();
      assert.equal(job.jobId, started.jobId);
      const ctx = await workerContext(job);
      assert.ok(ctx.guidance);
      assert.equal(ctx.guidance.claim.kind, "general");
      assert.ok(
        ctx.sourceManifest.some(
          (ref) =>
            ref.id === "habi-guidance-training-attendance" &&
            ref.revision === 1,
        ),
      );
      await verifyCoachSources(
        db,
        player,
        player.playerId,
        ctx.guidance.claim.evidenceRefs,
      );
      await complete(job, ctx);
      const before = await db
        .collection("habi_coach_turns")
        .findOne({ id: started.turnId });
      // Simulate a historical result that predates the guide; reading adds current
      // authored help without changing the historical answer or its manifest.
      await db.collection("habi_coach_turns").updateOne(
        { id: started.turnId },
        {
          $pull: { sourceRefs: { id: "habi-guidance-training-attendance" } },
        },
      );
      const read = await readCoachThread({ ...args, id: started.threadId });
      assert.ok(read.items[0].guidance);
      assert.match(read.items[0].guidance.claim.text, /Ha ma/);
      const after = await db
        .collection("habi_coach_turns")
        .findOne({ id: started.turnId });
      assert.deepEqual(after.answer, before.answer);
      assert.deepEqual(after.answer.manifest, before.answer.manifest);
    },
  );
});
