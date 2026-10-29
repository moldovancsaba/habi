import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { MongoClient } from "mongodb";
import { hashRequestBody } from "../src/lib/database/idempotent-command.mjs";
import { runMigrations } from "../src/lib/database/migrations/runner.mjs";
import { applySyntheticSeed } from "../src/lib/database/seed.mjs";
import {
  listCoachReviews,
  readCoachThread,
  startCoachTurn,
} from "../src/lib/workflows/ai-coach.mjs";
import {
  claimWorkerJob,
  completeWorkerJob,
  getWorkerJobContext,
} from "../src/lib/workflows/worker-jobs.mjs";

// The hosted database is about 95 ms away from the API, so every sequential
// database command costs real time: a worker context that needs more than a
// few seconds is abandoned by the worker, which retries it into the same
// failure. The number of commands must therefore not grow with the thread.
process.env.HG_WORKER_BEARER_SHA256 ??= "a".repeat(64);

const base = Date.parse("2026-10-27T10:00:00.000Z");
const at = (n, extra = 0) => new Date(base + n * 60_000 + extra);

test("coach reads and the worker context do not grow with the length of the thread", {
  skip: !process.env.HABI_TEST_MONGODB_URI,
}, async (t) => {
  const client = new MongoClient(process.env.HABI_TEST_MONGODB_URI, {
    monitorCommands: true,
  });
  let commands = 0;
  let counting = false;
  client.on("commandStarted", (event) => {
    if (
      counting &&
      !["hello", "isMaster", "ismaster"].includes(event.commandName)
    )
      commands += 1;
  });
  await client.connect();
  const db = client.db(`habi_ctxcost_${process.pid}_${Date.now()}_test`);
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
  const coach = {
    ...shared,
    actorId: "seed-a-coach-one",
    role: "coach",
    playerId: null,
  };
  const playerId = player.playerId;
  const worker = { serviceId: "synthetic-coach-worker" };
  const context = { page: "checkin", kind: "page", id: "checkin", revision: 1 };
  const request = (body) =>
    new Request(`http://127.0.0.1:3000/api/v1/players/${playerId}/ai-coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(body),
    });
  const measure = async (fn) => {
    commands = 0;
    counting = true;
    try {
      await fn();
    } finally {
      counting = false;
    }
    return commands;
  };

  let threadId = null;
  let revision = 0;
  let turns = 0;
  // Ask, let the worker build the context (measured) and answer, like production.
  async function askAndAnswer() {
    turns += 1;
    const started = await startCoachTurn({
      client,
      db,
      principal: player,
      playerId,
      now: at(turns),
      request: request({
        threadId,
        question: `Kérdés ${turns}: hogyan tovább?`,
        context,
        expectedRevision: revision,
      }),
    });
    threadId = started.threadId;
    revision = started.revision ?? revision + 1;
    const claimed = await claimWorkerJob({
      db,
      clientId: worker.serviceId,
      now: at(turns, 10_000),
      request: new Request("http://localhost/api/v1/worker/jobs/claim", {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify({ kinds: ["coachConversation"], maxJobs: 1 }),
      }),
    });
    let ctx;
    const contextCommands = await measure(async () => {
      ctx = await getWorkerJobContext({
        db,
        worker,
        id: claimed.jobId,
        now: at(turns, 20_000),
        request: new Request("http://localhost/context", {
          headers: {
            "X-Lease-Token": claimed.leaseToken,
            "X-Job-Fence": String(claimed.fence),
          },
        }),
      });
    });
    const data = {
      result: {
        status: "ready",
        questionRevision: ctx.turnRevision,
        claims: [
          {
            id: "claim-1",
            text: "Az állapotjelzés a saját beszámolódat mutatja.",
            kind: "general",
            evidenceRefs: ctx.sourceManifest,
            review: null,
          },
        ],
        attributions: [],
        unknowns: [],
        clarifyingQuestions: [],
        suggestedAction: null,
        validity: "current",
        manifest: ctx.promptManifest,
      },
      sourceManifest: ctx.sourceManifest,
    };
    await completeWorkerJob({
      client,
      db,
      worker,
      id: claimed.jobId,
      now: at(turns, 30_000),
      request: new Request("http://localhost/complete", {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify({
          fence: claimed.fence,
          leaseToken: claimed.leaseToken,
          resultHash: hashRequestBody(data),
          ...data,
        }),
      }),
    });
    return { contextCommands, turnId: started.turnId };
  }

  let shortThread;
  let longThread;
  await t.test(
    "the worker context costs the same for 2 and for 9 earlier turns",
    async () => {
      await askAndAnswer();
      shortThread = (await askAndAnswer()).contextCommands;
      for (let i = 0; i < 6; i += 1) await askAndAnswer();
      longThread = (await askAndAnswer()).contextCommands;
      assert.equal(turns, 9);
      assert.equal(
        longThread,
        shortThread,
        `context commands grew with the thread: ${shortThread} -> ${longThread}`,
      );
      // Each command is one round trip to the hosted database (about 95 ms).
      assert.ok(longThread <= 40, `context needs ${longThread} commands`);
    },
  );

  // The page holds the newest 31 turns; older answered turns are checked
  // against the viewer's sources. Cloning answered turns reaches that path
  // without driving the worker 40 times.
  const [template] = await db
    .collection("habi_coach_turns")
    .find({ threadId, status: "answered" })
    .sort({ createdAt: 1 })
    .limit(1)
    .toArray();
  const cloneTurns = async (count, extra = {}) => {
    const copies = [];
    for (let i = 0; i < count; i += 1) {
      const { _id, ...rest } = template;
      copies.push({
        ...rest,
        ...extra,
        id: randomUUID(),
        createdAt: new Date(base - (count - i) * 60_000).toISOString(),
        updatedAt: new Date(base - (count - i) * 60_000).toISOString(),
      });
    }
    await db.collection("habi_coach_turns").insertMany(copies);
    return copies;
  };

  await t.test(
    "reading a long thread costs the same for 1 and for 8 earlier turns to check",
    async () => {
      // 2 older turns behind the page of 31 newest: 1 to check is not possible
      // here, so measure with 32 then add more behind the page.
      await cloneTurns(23);
      const newest = (await askAndAnswer()).turnId;
      const read = (principal) =>
        measure(() =>
          readCoachThread({
            db,
            principal,
            playerId,
            id: threadId,
            before: newest,
          }),
        );
      const fewPlayer = await read(player);
      const fewCoach = await read(coach);
      await cloneTurns(7);
      const manyPlayer = await read(player);
      const manyCoach = await read(coach);
      assert.equal(manyPlayer, fewPlayer, "player read grew with older turns");
      assert.equal(manyCoach, fewCoach, "coach read grew with older turns");
      assert.ok(manyPlayer <= 40, `player read needs ${manyPlayer} commands`);
      assert.ok(manyCoach <= 60, `coach read needs ${manyCoach} commands`);
    },
  );

  await t.test(
    "the coach review queue scans once per owner, not once per turn",
    async () => {
      await cloneTurns(1, { reviewState: "requested" });
      const one = await measure(() =>
        listCoachReviews({ db, principal: coach, playerId }),
      );
      await cloneTurns(9, { reviewState: "requested" });
      const ten = await measure(() =>
        listCoachReviews({ db, principal: coach, playerId }),
      );
      // Nine more turns add their own owner lookup only, never another scan.
      assert.ok(
        ten - one <= 9 * 2,
        `review queue grew by ${ten - one} commands for 9 more turns`,
      );
    },
  );
});
