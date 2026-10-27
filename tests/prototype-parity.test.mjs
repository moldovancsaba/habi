import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import content from "../src/lib/content/coach-assessments-v1.json" with {
  type: "json",
};
import {
  buildCoachAssessment,
  createCoachAssessment,
} from "../src/lib/workflows/coach-assessments.mjs";
import {
  createThread,
  createMessage,
  listMessages,
  setThreadState,
} from "../src/lib/workflows/threads.mjs";
import {
  listKnowledge,
  writeKnowledge,
} from "../src/lib/workflows/knowledge.mjs";
import { readEvidenceSource } from "../src/lib/workflows/evidence-reader.mjs";
import {
  publishCoachResource,
  withdrawPublication,
} from "../src/lib/workflows/publications.mjs";
import { listRecords } from "../src/lib/workflows/records.mjs";
import {
  createCheckinSession,
  saveCheckinAnswer,
  listOpenCheckinSessions,
  completeCheckin,
  readCheckinResult,
  listCheckinResults,
} from "../src/lib/workflows/checkin.mjs";
import {
  readExperienceDraft,
  saveExperienceDraft,
} from "../src/lib/workflows/experience-drafts.mjs";
import { runMigrations } from "../src/lib/database/migrations/runner.mjs";
import { applySyntheticSeed } from "../src/lib/database/seed.mjs";
import { projectDailyCheckins } from "../src/lib/workflows/checkin-chart.mjs";
import { createGoalExport } from "../src/lib/workflows/goal-export.mjs";
import { getInterpretation } from "../src/lib/workflows/interpretations.mjs";
import { listPlanParticipants } from "../src/lib/workflows/participants.mjs";
import {
  createPlan,
  decidePlan,
  transitionPlan,
} from "../src/lib/workflows/plans.mjs";

const topic = content.topics.find((t) =>
  content.items.some((i) => i.construct_id === t.id),
);
const input = {
  topicId: topic.id,
  mode: "questionnaire",
  date: "2026-10-27",
  answers: content.items
    .filter((i) => i.construct_id === topic.id)
    .map(() => 3),
  context: "Szintetikus teszt",
  example: "Saját példa",
  reflection: "Külön edzői megfigyelés",
};
test("all original questionnaire topics preserve their exact item text and version without scoring", () => {
  assert.equal(content.topics.length, 62);
  assert.equal(content.items.length, 136);
  assert.equal(content.scenarios.length, 24);
  for (const t of content.topics) {
    const items = content.items.filter((i) => i.construct_id === t.id);
    if (!items.length) continue;
    const result = buildCoachAssessment({
      ...input,
      topicId: t.id,
      answers: items.map(() => 3),
    });
    for (const item of items) {
      assert.ok(result.includes(item.text));
      assert.ok(result.includes(`${item.id} · v${item.version}`));
    }
    assert.ok(result.length <= 4000);
    assert.match(result, /Nincs pontozás/);
  }
});
test("questionnaire rejects forged answers, omitted items and empty attempts", () => {
  for (const invalid of [
    { ...input, answers: [] },
    { ...input, answers: input.answers.map(() => 9) },
    { ...input, answers: input.answers.map(() => null), example: "" },
    { ...input, topicId: "unknown" },
    { ...input, date: "2026-02-30" },
  ])
    assert.throws(() => buildCoachAssessment(invalid), {
      message: "INVALID_INPUT",
    });
});
test("daily chart selects the latest complete session and never backfills partial answers", () => {
  const full = {
    id: "full",
    completedAt: "2026-10-27T08:00:00Z",
    answerCodes: ["energy", "sleep", "focus", "mood", "load"].map((metric) => ({
      metric,
      code: 1,
    })),
  };
  const partial = {
    id: "partial",
    completedAt: "2026-10-27T09:00:00Z",
    answerCodes: [{ metric: "energy", code: 3 }],
  };
  assert.deepEqual(projectDailyCheckins([partial, full]), [full]);
  assert.deepEqual(projectDailyCheckins([partial]), [partial]);
});
test("goal export includes only practices explicitly linked to that exact goal", () => {
  const text = createGoalExport({
    goal: { id: "goal-1" },
    goalText: "Kis lépés",
    status: "active",
    includeHistory: true,
    records: [
      {
        text: "Gyakorlat: Egy kapaszkodó\nKapcsolódó saját cél · goal-1\nVisszajelzés: Segített",
      },
      { text: "Gyakorlat: Másik gyakorlat\nKapcsolódó saját cél · goal-10" },
      { text: "Gyakorlat: Kapcsolat nélkül" },
    ],
  });
  assert.match(text, /Egy kapaszkodó/);
  assert.doesNotMatch(text, /Másik gyakorlat|Kapcsolat nélkül/);
});

test("prototype parity workflows persist and enforce tenant, role, revision and publication boundaries", {
  skip: !process.env.HABI_TEST_MONGODB_URI,
}, async (t) => {
  const client = new MongoClient(process.env.HABI_TEST_MONGODB_URI);
  await client.connect();
  const db = client.db(`habi_parity_${process.pid}_${Date.now()}_test`);
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  await runMigrations(db);
  await applySyntheticSeed(db);
  const common = {
    tenantId: "seed-tenant-a",
    retentionPolicyId: "synthetic-retention-v1",
    accessRevision: 1,
  };
  const coach = {
    ...common,
    role: "coach",
    actorId: "seed-a-coach-one",
    playerId: null,
  };
  const parent = {
    ...common,
    role: "parent",
    actorId: "seed-a-parent-one",
    playerId: "seed-player-001",
  };
  const player = {
    ...common,
    role: "player",
    actorId: "seed-a-player-actor",
    playerId: "seed-player-001",
  };
  const playerId = player.playerId;
  const request = (path, body, key = crypto.randomUUID(), method = "POST") =>
    new Request(`http://127.0.0.1:3000${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        ...(body?.expectedRevision
          ? { "If-Match": String(body.expectedRevision) }
          : {}),
      },
      body: JSON.stringify(body),
    });
  const now = new Date("2026-10-27T10:00:00Z");
  await t.test(
    "ordinary conversations create one thread and first message atomically, without an AI job",
    async () => {
      const key = crypto.randomUUID(),
        args = { db, client, principal: parent, playerId, now };
      const make = () =>
        request(
          `/api/v1/players/${playerId}/threads`,
          { text: "Szintetikus közös kérdés", replyTo: null },
          key,
        );
      const first = await createThread({ ...args, request: make() });
      const again = await createThread({ ...args, request: make() });
      assert.equal(first.body.id, again.body.id);
      assert.equal(await db.collection("jobs").countDocuments({}), 0);
      assert.equal(
        await db
          .collection("messages")
          .countDocuments({ threadId: first.body.id }),
        1,
      );
      const reply = await createMessage({
        db,
        client,
        principal: coach,
        threadId: first.body.id,
        now,
        request: request(`/api/v1/threads/${first.body.id}/messages`, {
          text: "Edzői válasz",
          replyTo: null,
        }),
      });
      assert.equal(reply.status, 201);
      const messages = await listMessages({
        db,
        principal: parent,
        threadId: first.body.id,
        cursorHmacKey: "x".repeat(40),
        now: new Date("2026-10-28"),
      });
      assert.equal(messages.items.length, 2);
      await assert.rejects(
        createThread({ ...args, principal: player, request: make() }),
        { message: "ACCESS_DENIED" },
      );
      await assert.rejects(
        createThread({
          ...args,
          principal: { ...parent, playerId: "unrelated" },
          request: make(),
        }),
        { message: "NOT_FOUND" },
      );
      const current = await db
        .collection("threads")
        .findOne({ id: first.body.id });
      const close = await setThreadState({
        db,
        client,
        principal: coach,
        id: current.id,
        state: "closed",
        request: request(`/api/v1/threads/${current.id}/close`, {
          expectedRevision: current.revision,
        }),
      });
      assert.equal(close.body.status, "closed");
    },
  );
  let assessment;
  await t.test(
    "coach questionnaire is immutable, versioned, attributed and initially private",
    async () => {
      const args = { db, client, principal: coach, playerId, now };
      assessment = await createCoachAssessment({
        ...args,
        request: request(
          `/api/v1/players/${playerId}/coach-assessments`,
          input,
        ),
      });
      assert.equal(assessment.status, 201);
      assert.equal(assessment.body.source.kind, "proxy");
      assert.equal(assessment.body.sharingClass, "coach");
      assert.match(
        assessment.body.text,
        /Edzői megfigyelés: Külön edzői megfigyelés/,
      );
      const list = await listRecords({
        db,
        principal: parent,
        playerId,
        cursorHmacKey: "x".repeat(40),
        now: new Date("2026-10-28"),
      });
      assert.equal(list.items.length, 0);
      await assert.rejects(
        readEvidenceSource({
          db,
          principal: parent,
          playerId,
          id: assessment.body.id,
          revision: 1,
        }),
        { message: "NOT_FOUND" },
      );
      await assert.rejects(
        createCoachAssessment({
          ...args,
          principal: parent,
          request: request("/x", input),
        }),
        { message: "ACCESS_DENIED" },
      );
    },
  );
  await t.test(
    "publication grants only the exact revision and withdrawal removes parent access",
    async () => {
      const pub = await publishCoachResource({
        db,
        client,
        principal: coach,
        request: request("/api/v1/publications", {
          resourceRef: { id: assessment.body.id, revision: 1 },
        }),
      });
      const source = await readEvidenceSource({
        db,
        principal: parent,
        playerId,
        id: assessment.body.id,
        revision: 1,
      });
      assert.match(source.content.text, /Edzői felmérés/);
      assert.equal(source.content.tenantId, undefined);
      await assert.rejects(
        readEvidenceSource({
          db,
          principal: { ...coach, tenantId: "seed-tenant-b" },
          playerId,
          id: assessment.body.id,
          revision: 1,
        }),
        { message: "NOT_FOUND" },
      );

      const derivedId = crypto.randomUUID(),
        secondId = crypto.randomUUID();
      const derived = (id, ref) => ({
        id,
        tenantId: common.tenantId,
        schemaVersion: 2,
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        retentionPolicyId: common.retentionPolicyId,
        playerId,
        threadId: crypto.randomUUID(),
        turnId: crypto.randomUUID(),
        turnRevision: 1,
        answer: {
          status: "no_evidence",
          questionRevision: 1,
          claims: [],
          attributions: [],
          unknowns: ["Szintetikus forrásellenőrzés"],
          clarifyingQuestions: [],
          suggestedAction: null,
          validity: "current",
          manifest: {
            modelArtifact: "synthetic-only",
            promptHash: "a".repeat(64),
            schemaVersion: 2,
            retrievalVersion: "retrieval-v1",
            policyVersion: "policy-v2",
            sourceRefs: [{ ...ref, span: null }],
          },
        },
      });
      await db
        .collection("interpretations")
        .insertMany([
          derived(derivedId, { id: assessment.body.id, revision: 1 }),
          derived(secondId, { id: derivedId, revision: 1 }),
        ]);
      await withdrawPublication({
        db,
        client,
        principal: coach,
        id: pub.body.id,
        request: request(`/api/v1/publications/${pub.body.id}/withdraw`, {
          expectedRevision: pub.body.revision,
        }),
      });
      await assert.rejects(
        readEvidenceSource({
          db,
          principal: parent,
          playerId,
          id: assessment.body.id,
          revision: 1,
        }),
        { message: "NOT_FOUND" },
      );
      assert.ok(
        await db.collection("records").findOne({ id: assessment.body.id }),
      );
      for (const id of [derivedId, secondId]) {
        assert.equal(
          (await db.collection("interpretations").findOne({ id })).answer
            .validity,
          "withdrawn",
        );
        assert.equal(
          (await getInterpretation({ db, principal: parent, id })).answer,
          null,
        );
      }
    },
  );
  await t.test(
    "knowledge approval requires all three checks and rejects stale revisions",
    async () => {
      const candidate = await writeKnowledge({
        db,
        client,
        principal: coach,
        request: request("/api/v1/knowledge", {
          situation: "Általános helyzet",
          response: "Tisztázó kérdés",
          exclusions: "Más segítség kell",
          evidence: "Szintetikus forráshivatkozás",
        }),
      });
      const payload = {
        expectedRevision: 1,
        decision: "approved",
        evidenceChecked: true,
        privacyChecked: false,
        rightsChecked: true,
        rationale: "Ellenőrzés indoklása",
      };
      await assert.rejects(
        writeKnowledge({
          db,
          client,
          principal: coach,
          id: candidate.body.id,
          request: request("/review", payload),
        }),
        { message: "INVALID_INPUT" },
      );
      const approved = await writeKnowledge({
        db,
        client,
        principal: coach,
        id: candidate.body.id,
        request: request("/review", { ...payload, privacyChecked: true }),
      });
      assert.equal(approved.body.status, "approved");
      assert.equal(approved.body.reviews.length, 1);
      await assert.rejects(
        writeKnowledge({
          db,
          client,
          principal: coach,
          id: candidate.body.id,
          request: request("/review", { ...payload, privacyChecked: true }),
        }),
        { message: "REVISION_CONFLICT" },
      );
      await assert.rejects(listKnowledge({ db, principal: parent }), {
        message: "ACCESS_DENIED",
      });
    },
  );
  await t.test(
    "individual check-in answers persist and an unfinished session is resumable",
    async () => {
      const created = await createCheckinSession({
        db,
        client,
        principal: player,
        playerId,
        now,
        request: request("/api/v1/players/x/checkin-sessions", {
          timeZone: "Europe/Budapest",
          instrumentVersion: "checkin-hu-1",
        }),
      });
      await saveCheckinAnswer({
        db,
        client,
        principal: player,
        id: created.body.id,
        now,
        request: request(
          `/api/v1/checkin-sessions/${created.body.id}/answers`,
          { expectedRevision: 1, metric: "energy", answerCode: 2 },
        ),
      });
      const sessions = await listOpenCheckinSessions({
        db,
        principal: player,
        playerId,
      });
      assert.equal(sessions.items.length, 1);
      assert.equal(sessions.items[0].answers[0].answerCode, 2);
      await assert.rejects(
        listOpenCheckinSessions({ db, principal: parent, playerId }),
        { message: "ACCESS_DENIED" },
      );
      const completed = await completeCheckin({
        db,
        client,
        principal: player,
        id: created.body.id,
        now,
        request: request(
          `/api/v1/checkin-sessions/${created.body.id}/complete`,
          { expectedRevision: sessions.items[0].revision },
        ),
      });
      assert.equal(
        (
          await readCheckinResult({
            db,
            principal: coach,
            id: completed.body.id,
          })
        ).answerCodes[0].code,
        2,
      );
      const original = await db
        .collection("checkin_results")
        .findOne({ id: completed.body.id });
      delete original._id;
      await db.collection("checkin_results").insertMany(
        Array.from({ length: 104 }, (_, i) => ({
          ...original,
          id: crypto.randomUUID(),
          sessionId: crypto.randomUUID(),
          completedAt: new Date(now.getTime() + i * 1000).toISOString(),
          createdAt: new Date(now.getTime() + i * 1000).toISOString(),
        })),
      );
      const first = await listCheckinResults({
        db,
        principal: coach,
        playerId,
        limit: 100,
        cursorHmacKey: "x".repeat(40),
        now: new Date("2026-10-28"),
      });
      assert.equal(first.items.length, 100);
      assert.ok(first.nextCursor);
      const second = await listCheckinResults({
        db,
        principal: coach,
        playerId,
        limit: 100,
        cursor: first.nextCursor,
        cursorHmacKey: "x".repeat(40),
        now: new Date("2026-10-28"),
      });
      assert.equal(second.items.length, 5);
      assert.ok(
        !second.items.some((item) =>
          first.items.some((old) => old.id === item.id),
        ),
      );
    },
  );
  await t.test(
    "continuity drafts round-trip only for their owning player",
    async () => {
      const payload = {
        goal: "Egy kis cél",
        routine: "Egy rutin",
        practice: "Saját jegyzet",
        prepPerson: "Szülő",
        prepSituation: "Beszélgetés",
        prepHelp: "Meghallgatás",
        example: "neutral",
        practiceGoalId: "",
      };
      await saveExperienceDraft({
        db,
        client,
        principal: player,
        playerId,
        draftKey: "player-workspace",
        request: request(
          `/drafts/player-workspace`,
          {
            expectedRevision: 0,
            contentVersion: "player-workspace-v1",
            payload,
          },
          crypto.randomUUID(),
          "PUT",
        ),
      });
      assert.deepEqual(
        (
          await readExperienceDraft({
            db,
            principal: player,
            playerId,
            draftKey: "player-workspace",
          })
        ).draft.payload,
        payload,
      );
      await assert.rejects(
        readExperienceDraft({
          db,
          principal: parent,
          playerId,
          draftKey: "player-workspace",
        }),
        { message: "ACCESS_DENIED" },
      );
    },
  );
  await t.test(
    "plan participants are scoped to the selected child and tenant",
    async () => {
      const participants = await listPlanParticipants({
        db,
        principal: coach,
        playerId,
      });
      assert.ok(
        participants.items.some((item) => item.actorId === player.actorId),
      );
      assert.ok(
        participants.items.some((item) => item.actorId === coach.actorId),
      );
      assert.ok(
        participants.items.every((item) => item.actorId.startsWith("seed-a-")),
      );
      await assert.rejects(
        listPlanParticipants({ db, principal: parent, playerId: "unrelated" }),
        { message: "NOT_FOUND" },
      );
    },
  );
  await t.test(
    "assigned parent plan can be accepted, paused, resumed and completed with revision fencing",
    async () => {
      const created = await createPlan({
        db,
        client,
        principal: coach,
        playerId,
        now,
        request: request("/plans", {
          sourceRefs: [{ id: assessment.body.id, revision: 1, span: null }],
          answerRef: null,
          actions: [
            {
              id: crypto.randomUUID(),
              what: "Szintetikus feladat",
              why: "Közös megbeszélés",
              ownerActorId: parent.actorId,
              dueAt: "2026-10-28T10:00:00Z",
              stopCondition: "Ha nem megfelelő, megállunk.",
            },
          ],
        }),
      });
      let plan = (
        await decidePlan({
          db,
          client,
          principal: parent,
          id: created.body.id,
          request: request("/accept", {
            expectedRevision: 1,
            decision: "accept",
          }),
        })
      ).body;
      for (const status of ["paused", "active", "completed"]) {
        plan = (
          await transitionPlan({
            db,
            client,
            principal: coach,
            id: plan.id,
            request: request("/state", {
              expectedRevision: plan.revision,
              status,
            }),
          })
        ).body;
        assert.equal(plan.status, status);
      }
      await assert.rejects(
        transitionPlan({
          db,
          client,
          principal: coach,
          id: plan.id,
          request: request("/state", { expectedRevision: 1, status: "active" }),
        }),
        { message: "REVISION_CONFLICT" },
      );
    },
  );
});
