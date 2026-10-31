import { coachMessageHistory } from "../src/lib/workflows/coach-messages.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  readObservedCoachSource,
  listCoachThreads,
  writeCoachEvent,
  reviewCoachTurn,
  listCoachReviews,
  verifyCoachSources,
  coachJobProgress,
  coachAnswerMode,
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
    providedResult,
  ) {
    const result = providedResult ?? {
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
    "coach oversight can read a participant thread while formal review remains explicit and authorship remains fenced",
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
      const observed = await readCoachThread({
        ...args,
        principal: coach,
        id: first.threadId,
      });
      assert.equal(observed.readOnly, true);
      const history = await coachMessageHistory({ ...args, principal: coach });
      assert.equal(
        history.items.find((item) => item.id === second.turnId).canManage,
        false,
      );
      assert.ok(observed.items.some((item) => item.id === second.turnId));
      const source = await readObservedCoachSource({
        ...args,
        principal: coach,
        threadId: first.threadId,
        id: `coach-message-${second.turnId}`,
        revision: 1,
      });
      assert.equal(source.role, "player");
      assert.equal(source.text, turn.question);
      await assert.rejects(
        startCoachTurn({
          ...args,
          principal: coach,
          request: request("/ai-coach", {
            threadId: first.threadId,
            question: "Nem írhatok a játékos nevében.",
            context,
            expectedRevision: observed.thread.revision,
          }),
        }),
        { message: "NOT_FOUND" },
      );
      await assert.rejects(
        readObservedCoachSource({
          ...args,
          principal: parent,
          threadId: first.threadId,
          id: `coach-message-${second.turnId}`,
          revision: 1,
        }),
        { message: "ACCESS_DENIED" },
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
  await t.test(
    "repeated questions continue across worker, reload and pagination without rewriting saved answers",
    async () => {
      let threadId = null;
      let expectedRevision = 0;
      const replies = [];
      for (let index = 0; index < 3; index++) {
        const started = await startCoachTurn({
          ...args,
          now: new Date(now.getTime() + 6000 + index),
          request: request("/ai-coach", {
            threadId,
            question: "Menjek ma edzésre?",
            context,
            expectedRevision,
          }),
        });
        threadId = started.threadId;
        const job = await claim();
        assert.equal(job.jobId, started.jobId);
        const ctx = await workerContext(job);
        const conversation = ctx.conversation;
        assert.equal(!!conversation, index > 0);
        if (index > 0) {
          assert.equal(conversation.suppressRepeatedAnswer, true);
          assert.equal(conversation.questions.length, 1);
          assert.ok(ctx.dialogue[0].questions.length > 0);
        }
        const result = {
          status: index ? "needs_clarification" : "ready",
          questionRevision: ctx.turnRevision,
          claims: index ? [] : [ctx.guidance.claim],
          attributions: [],
          unknowns: index ? [conversation.lead] : ctx.guidance.unknowns,
          clarifyingQuestions: index
            ? conversation.questions
            : ctx.guidance.questions,
          suggestedAction: null,
          validity: "current",
          manifest: {
            ...ctx.promptManifest,
            modelArtifact: index ? "habi-conversation@1" : "habi-guidance@1",
          },
        };
        await complete(job, ctx, "general", ctx.sourceManifest, result);
        const detail = await readCoachThread({ ...args, id: threadId });
        expectedRevision = detail.thread.revision;
        const item = detail.items.at(-1);
        assert.equal(!!item.conversation, index > 0);
        replies.push(item);
      }
      assert.notDeepEqual(
        replies[1].conversation.questions,
        replies[2].conversation.questions,
      );
      assert.notEqual(
        replies[1].conversation.lead,
        replies[2].conversation.lead,
      );
      const beforeRead = await db
        .collection("habi_coach_turns")
        .findOne({ id: replies[1].id });
      const page = await readCoachThread({
        ...args,
        id: threadId,
        before: replies[2].id,
      });
      assert.equal(page.items.at(-1).conversation.suppressRepeatedAnswer, true);
      const afterRead = await db
        .collection("habi_coach_turns")
        .findOne({ id: replies[1].id });
      assert.deepEqual(beforeRead.answer, afterRead.answer);
      await assert.rejects(
        readCoachThread({ ...args, principal: parent, id: threadId }),
        { message: "NOT_FOUND" },
      );
    },
  );
  await t.test(
    "maintenance preserves messages without consuming the normal retry budget",
    async () => {
      const started = await startCoachTurn({
        ...args,
        request: request("/ai-coach", {
          threadId: null,
          question: "Mi változott?",
          context,
          expectedRevision: 0,
        }),
      });
      await db
        .collection("jobs")
        .updateOne({ id: started.jobId }, { $set: { attempts: 3 } });
      const lease = await claim();
      assert.equal(lease.jobId, started.jobId);
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
            reasonCode: "AI_SERVICE_MAINTENANCE",
          }),
        }),
      });
      const job = await db.collection("jobs").findOne({ id: started.jobId });
      assert.equal(job.status, "queued");
      assert.equal(job.attempts, 3);
      const detail = await readCoachThread({ ...args, id: started.threadId });
      assert.equal(detail.items[0].progress.phase, "maintenance");
      assert.equal(detail.items[0].answer, null);
    },
  );
  await t.test(
    "updates become private history and active memory, corrections supersede notes and forgetting excludes them",
    async () => {
      let time = 7000;
      const sendMessage = async (
        question,
        threadId = null,
        expectedRevision = 0,
      ) =>
        startCoachTurn({
          ...args,
          now: new Date(now.getTime() + time++),
          request: request("/ai-coach", {
            threadId,
            question,
            context,
            expectedRevision,
          }),
        });
      const finishMessage = async (created, text) => {
        const job = await claim();
        assert.equal(job.jobId, created.jobId);
        const ctx = await workerContext(job);
        assert.equal(ctx.dialogueVersion, 2);
        // The Python worker routes this exact shape (worker/tests/test_coach_router.py).
        const contract = JSON.parse(
          readFileSync(
            new URL(
              "../worker/tests/fixtures/coach-worker-context.json",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        const keys = Object.keys(ctx);
        assert.deepEqual(
          keys.filter((k) => !contract.optionalKeys.includes(k)).sort(),
          [...contract.requiredKeys].sort(),
        );
        assert.ok(
          keys.every((k) =>
            [...contract.requiredKeys, ...contract.optionalKeys].includes(k),
          ),
        );
        assert.ok(
          ctx.sourceManifest.some(
            (r) => r.id === `coach-message-${created.turnId}`,
          ),
        );
        const result = {
          status: "ready",
          questionRevision: ctx.turnRevision,
          claims: [],
          reply: { text, sourceRefs: ctx.sourceManifest },
          unknowns: [],
          clarifyingQuestions: [],
          attributions: [],
          suggestedAction: null,
          validity: "current",
          manifest: {
            ...ctx.promptManifest,
            modelArtifact: "synthetic-dialogue-model",
          },
        };
        await complete(job, ctx, "general", ctx.sourceManifest, result);
        return ctx;
      };
      const update = await sendMessage(
        "jobb a közérzete, kiderült, hogy elfelejtett reggelizni",
      );
      await finishMessage(update, "Köszönöm a pontosítást. Evett már azóta?");
      let history = await coachMessageHistory(args);
      assert.equal(
        history.items.find((m) => m.id === update.turnId).understanding.notes
          .length,
        2,
      );
      let profile = await getCoachProfile(args);
      assert.ok(
        profile.profile.facts.some((f) => f.text === "jobb a közérzete"),
      );
      const reopened = await sendMessage("Mit tudunk most?");
      const reopenedCtx = await finishMessage(
        reopened,
        "A legújabb közlésed szerint javult a közérzete.",
      );
      assert.ok(
        reopenedCtx.messageHistory.some((m) =>
          m.text.includes("elfelejtett reggelizni"),
        ),
      );
      assert.ok(
        reopenedCtx.sourceSnapshots.some(
          (m) =>
            m.kind === "conversation_note" && m.text.includes("reggelizni"),
        ),
      );
      const correction = await sendMessage(
        "Pontosítás: nem a reggeli maradt ki, hanem a vacsora.",
      );
      await finishMessage(
        correction,
        "Köszönöm, a vacsorára vonatkozó pontosítást veszem figyelembe.",
      );
      profile = await getCoachProfile(args);
      assert.ok(
        !profile.sources.some(
          (f) =>
            f.kind === "conversation_note" &&
            f.text === "kiderült, hogy elfelejtett reggelizni",
        ),
      );
      assert.ok(
        profile.sources.some(
          (f) =>
            f.kind === "conversation_note" && f.text === "jobb a közérzete",
        ),
      );
      history = await coachMessageHistory(args);
      assert.ok(
        history.items.some((m) => m.text.includes("elfelejtett reggelizni")),
      );
      const feedback = await sendMessage(
        "Rövidebb válaszokat szeretnék, ezt már elmondtam.",
      );
      await finishMessage(feedback, "Rendben, rövidebben válaszolok.");
      profile = await getCoachProfile(args);
      assert.ok(
        profile.sources.some(
          (f) =>
            f.kind === "conversation_note" &&
            f.title.includes("author") &&
            f.text.includes("Rövidebb"),
        ),
      );
      const ref = {
        id: `coach-message-${update.turnId}`,
        revision: 1,
        span: null,
      };
      await writeCoachEvent({
        ...args,
        request: request("/ai-profile", {
          kind: "forget",
          targetId: ref.id,
          text: "",
          value: "",
          sourceRefs: [ref],
        }),
      });
      history = await coachMessageHistory(args);
      assert.equal(
        history.items.find((m) => m.id === update.turnId).ignored,
        true,
      );
      profile = await getCoachProfile(args);
      assert.ok(
        !profile.sources.some(
          (s) =>
            !s.kind.startsWith("ignored_") &&
            (s.id === ref.id ||
              s.id.startsWith(`coach-note-${update.turnId}-`)),
        ),
      );
      const parentHistory = await coachMessageHistory({
        ...args,
        principal: parent,
      });
      assert.ok(!parentHistory.items.some((m) => m.id === update.turnId));
      await assert.rejects(
        writeCoachEvent({
          ...args,
          principal: parent,
          request: request("/ai-profile", {
            kind: "forget",
            targetId: ref.id,
            text: "",
            value: "",
            sourceRefs: [ref],
          }),
        }),
        { message: "NOT_FOUND" },
      );
      // A player's hopeless message carries the authored safety copy to the worker; an ordinary one does not.
      const ordinary = await sendMessage("Hogy állok most?");
      const ordinaryContext = await finishMessage(ordinary, "Rendben.");
      assert.equal(ordinaryContext.safety, undefined);
      const unsafe = await sendMessage("Semmi értelme az egésznek.");
      const unsafeContext = await finishMessage(unsafe, "Fontos.");
      assert.ok(unsafeContext.safety.text.includes("Biztonságban vagy most?"));
      assert.ok(unsafeContext.safety.text.includes("megbízható felnőtthöz"));
      assert.equal(unsafeContext.pain, undefined);
      // Pain or illness gets the authored attendance stance, not the safety copy.
      const pain = await sendMessage(
        "Nagyon fáj a térdem, de ma is edzésre kell mennem.",
      );
      const painContext = await finishMessage(pain, "Értem.");
      assert.equal(painContext.safety, undefined);
      assert.ok(painContext.pain.text.includes("ne erőltesd az edzést"));
      // The coach sees the signal next to the player's message, derived from the one keyword list.
      const coachView = await coachMessageHistory({
        ...args,
        principal: coach,
      });
      const flagged = coachView.items.filter((item) => item.safetySignal);
      assert.deepEqual(
        flagged.map((item) => item.text),
        ["Semmi értelme az egésznek."],
      );
      assert.ok(coachView.items.length > flagged.length);
    },
  );
});

test("the answer mode separates rule answers from the experimental model", () => {
  assert.equal(coachAnswerMode("habi-rules-ack@1"), "rules");
  assert.equal(coachAnswerMode("habi-rules-safety@1"), "rules");
  assert.equal(coachAnswerMode("habi-conversation@1"), "rules");
  assert.equal(coachAnswerMode("habi-plain-checkin@1"), "plain_summary");
  assert.equal(coachAnswerMode("habi-source-summary@1"), "source_summary");
  assert.equal(coachAnswerMode("habi-guidance@1"), "guidance");
  assert.equal(
    coachAnswerMode("hf.co/unsloth/Qwen3-4B-Instruct-2507-GGUF:Q3_K_M"),
    "model",
  );
  assert.equal(coachAnswerMode(undefined), "model");
});
