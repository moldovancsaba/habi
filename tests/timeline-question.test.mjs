import assert from "node:assert/strict";
import test from "node:test";
import { readTimeline } from "../src/lib/workflows/timeline.mjs";

import { MongoClient } from "mongodb";
import { randomUUID, createHmac } from "node:crypto";

async function fixture(t, data) {
  const uri = process.env.HABI_TEST_MONGODB_URI;
  assert.match(uri, /^mongodb:\/\/(localhost|127\.0\.0\.1):/);
  const client = await new MongoClient(uri).connect();
  const db = client.db(
    `habi_timeline_${randomUUID().replaceAll("-", "")}_test`,
  );
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  for (const [name, items] of Object.entries(data)) {
    if (items.length)
      await db.collection(name).insertMany(structuredClone(items));
  }
  return db;
}
const localOnly = { skip: !process.env.HABI_TEST_MONGODB_URI };

test(
  "timeline keeps the question and its no-evidence outcome for the parent and player",
  localOnly,
  async (t) => {
    const askedAt = "2026-10-26T10:15:00.000Z";
    const answeredAt = "2026-10-26T10:16:30.000Z";
    const question = "Miért volt ma nehéz az edzés?";
    const db = await fixture(t, {
      messages: [
        {
          tenantId: "habi",
          playerId: "player-1",
          id: "message-1",
          revision: 1,
          threadId: "thread-1",
          replyTo: null,
          recordedBy: { actorId: "parent-1", role: "parent" },
          text: question,
          submittedAt: askedAt,
        },
      ],
      turns: [
        {
          tenantId: "habi",
          playerId: "player-1",
          id: "turn-1",
          threadId: "thread-1",
          question,
          createdAt: askedAt,
        },
      ],
      interpretations: [
        {
          tenantId: "habi",
          playerId: "player-1",
          id: "interpretation-1",
          revision: 1,
          turnId: "turn-1",
          threadId: "thread-1",
          createdAt: answeredAt,
          updatedAt: answeredAt,
          answer: { status: "no_evidence", validity: "current" },
        },
        {
          tenantId: "habi",
          playerId: "player-1",
          id: "interpretation-stale",
          revision: 1,
          turnId: "turn-stale",
          threadId: "thread-1",
          createdAt: answeredAt,
          updatedAt: answeredAt,
          answer: { status: "ready", validity: "stale" },
        },
      ],
      threads: [
        {
          tenantId: "habi",
          playerId: "player-1",
          id: "thread-1",
          closedAt: null,
        },
      ],
    });
    for (const role of ["parent", "player"]) {
      const result = await readTimeline({
        db,
        principal: {
          tenantId: "habi",
          playerId: "player-1",
          role,
          actorId: role === "parent" ? "parent-1" : "player-1",
          accessRevision: 1,
        },
        cursorHmacKey: "0123456789abcdef0123456789abcdef",
        now: new Date("2026-10-26T10:20:00.000Z"),
      });
      assert.equal(result.nodes.length, 2);
      const answer = result.nodes.find(
        (node) => node.kind === "interpretation.no_evidence",
      );
      const prompt = result.nodes.find(
        (node) => node.kind === "thread.message",
      );
      assert.equal(prompt.summary, question);
      assert.equal(
        answer.summary,
        "A Habi nem talált ellenőrizhető, forrásolt választ. Nem vont le következtetést.",
      );
      assert.equal(answer.relatedId, prompt.id);
      assert.equal(answer.submittedAt, answeredAt);
    }
  },
);

test(
  "timeline can be filtered to a time window and its cursor is bound to that window",
  localOnly,
  async (t) => {
    const principal = {
      tenantId: "habi",
      playerId: "player-1",
      role: "parent",
      actorId: "parent-1",
      accessRevision: 1,
    };
    const events = [
      {
        tenantId: "habi",
        playerId: "player-1",
        id: "old",
        revision: 1,
        threadId: "thread-1",
        replyTo: null,
        recordedBy: { actorId: "parent-1", role: "parent" },
        text: "outside",
        submittedAt: "2026-10-25T23:59:59.000Z",
      },
      {
        tenantId: "habi",
        playerId: "player-1",
        id: "inside-1",
        revision: 1,
        threadId: "thread-1",
        replyTo: null,
        recordedBy: { actorId: "parent-1", role: "parent" },
        text: "inside one",
        submittedAt: "2026-10-26T10:15:00.000Z",
      },
      {
        tenantId: "habi",
        playerId: "player-1",
        id: "inside-2",
        revision: 1,
        threadId: "thread-1",
        replyTo: null,
        recordedBy: { actorId: "parent-1", role: "parent" },
        text: "inside two",
        submittedAt: "2026-10-26T10:16:30.000Z",
      },
    ];
    const db = await fixture(t, {
      messages: events,
      threads: [{ id: "thread-1", closedAt: null }],
    });
    const options = {
      db,
      principal,
      cursorHmacKey: "0123456789abcdef0123456789abcdef",
      now: new Date("2026-10-26T10:20:00.000Z"),
      from: "2026-10-26T00:00:00.000Z",
      to: "2026-10-26T23:59:59.999Z",
      limit: 1,
    };
    const first = await readTimeline(options);
    assert.equal(first.nodes.length, 1);
    assert.equal(first.nodes[0].id, "inside-2");
    assert.ok(first.nextCursor);
    const second = await readTimeline({ ...options, cursor: first.nextCursor });
    assert.equal(second.nodes.length, 1);
    assert.equal(second.nodes[0].id, "inside-1");
    await assert.doesNotReject(
      readTimeline({
        ...options,
        from: "2026-10-26T02:00:00+02:00",
        to: "2026-10-27T01:59:59.999+02:00",
      }),
    );
    await assert.rejects(
      readTimeline({
        ...options,
        cursor: first.nextCursor,
        from: "2026-10-25T00:00:00.000Z",
      }),
      { message: "CURSOR_EXPIRED" },
    );
  },
);

test(
  "coaches see every role's AI messages, feedback and outcomes while other viewers retain their own scope",
  localOnly,
  async (t) => {
    const base = {
      tenantId: "habi",
      playerId: "player-1",
      revision: 1,
      createdAt: "2026-10-29T09:00:00.000Z",
      updatedAt: "2026-10-29T09:01:00.000Z",
    };
    const turns = [
      {
        ...base,
        id: "player-turn",
        threadId: "player-thread",
        actorId: "player-actor",
        role: "player",
        question: "Jobban érzem magam.",
        status: "answered",
        answer: {
          reply: { text: "Mi segített?" },
          claims: [],
          unknowns: [],
          clarifyingQuestions: [],
        },
      },
      {
        ...base,
        id: "parent-turn",
        threadId: "parent-thread",
        actorId: "parent-actor",
        role: "parent",
        question: "Rövidebb válaszokat szeretnék.",
        status: "failed",
        jobId: "parent-job",
      },
      {
        ...base,
        id: "coach-turn",
        threadId: "coach-thread",
        actorId: "coach-actor",
        role: "coach",
        question: "Hogy van ma?",
        status: "queued",
      },
      {
        ...base,
        id: "foreign-turn",
        tenantId: "other",
        threadId: "foreign-thread",
        actorId: "foreign",
        role: "player",
        question: "Másik család",
        status: "queued",
      },
    ];
    const events = [
      {
        ...base,
        id: "exclusion-event",
        actorId: "parent-actor",
        role: "parent",
        kind: "forget",
        text: "",
        sourceRefs: [{ id: "coach-message-parent-turn", revision: 1 }],
      },
    ];
    const db = await fixture(t, {
      habi_coach_turns: turns,
      habi_coach_profile_events: events,
      jobs: [
        {
          ...base,
          id: "parent-job",
          requesterActorId: "parent-actor",
          requesterRole: "parent",
          kind: "coachConversation",
          status: "failed",
        },
      ],
    });
    const args = {
      db,
      playerId: "player-1",
      cursorHmacKey: "x".repeat(40),
      now: new Date("2026-10-30"),
      limit: 50,
    };
    const coach = await readTimeline({
      ...args,
      principal: {
        tenantId: "habi",
        actorId: "coach-actor",
        role: "coach",
        accessRevision: 1,
      },
    });
    assert.ok(
      coach.nodes.some(
        (n) => n.id === "player-turn" && n.kind === "coach.update",
      ),
    );
    assert.ok(
      coach.nodes.some(
        (n) => n.id === "parent-turn" && n.kind === "coach.feedback",
      ),
    );
    assert.ok(
      coach.nodes.some(
        (n) => n.kind === "coach.answer" && n.replyTo === "player-turn",
      ),
    );
    assert.ok(
      coach.nodes.some(
        (n) => n.kind === "coach.failed" && n.processId === "parent-thread",
      ),
    );
    assert.ok(
      coach.nodes.some(
        (n) => n.kind === "coach.exclusion" && n.processId === "parent-thread",
      ),
    );
    assert.ok(!coach.nodes.some((n) => n.id === "foreign-turn"));
    const parent = await readTimeline({
      ...args,
      principal: {
        tenantId: "habi",
        playerId: "player-1",
        actorId: "parent-actor",
        role: "parent",
        accessRevision: 1,
      },
    });
    assert.ok(
      !parent.nodes.some(
        (n) => n.id === "player-turn" || n.id === "coach-turn",
      ),
    );
    assert.ok(parent.nodes.some((n) => n.id === "parent-turn"));
  },
);

test(
  "timeline pagination reaches records older than the per-query sample size",
  localOnly,
  async (t) => {
    const records = Array.from({ length: 245 }, (_, i) => ({
      id: `record-${String(i).padStart(3, "0")}`,
      tenantId: "habi",
      playerId: "player-1",
      revision: 1,
      kind: "diary",
      sharingClass: "player_direct",
      source: { kind: "self" },
      recordedBy: { actorId: "player-actor", role: "player" },
      submittedAt: new Date(
        Date.parse("2026-10-28T09:00:00Z") + i * 1000,
      ).toISOString(),
    }));
    const db = await fixture(t, { records });
    const args = {
      db,
      principal: {
        tenantId: "habi",
        playerId: "player-1",
        actorId: "player-actor",
        role: "player",
        accessRevision: 1,
      },
      cursorHmacKey: "x".repeat(40),
      now: new Date("2026-10-30"),
      limit: 20,
    };
    let cursor = null;
    const seen = new Set();
    do {
      const page = await readTimeline({ ...args, cursor });
      for (const node of page.nodes) {
        assert.ok(!seen.has(node.id));
        seen.add(node.id);
      }
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(seen.size, 245);
  },
);

test(
  "coach activity includes operational documents, unpublished versions and recorded plan decisions",
  localOnly,
  async (t) => {
    const base = {
      tenantId: "habi",
      playerId: "player-1",
      revision: 1,
      createdAt: "2026-10-29T08:00:00.000Z",
      updatedAt: "2026-10-29T09:00:00.000Z",
    };
    const data = {
      reports: [{ ...base, id: "report-one", status: "restricted" }],
      extractions: [
        {
          ...base,
          id: "extraction-one",
          reportRef: { id: "report-one", revision: 1 },
          status: "awaiting_review",
        },
      ],
      assessment_results: [{ ...base, id: "assessment-one" }],
      coach_materials: [
        {
          ...base,
          id: "material-one",
          materialId: "material-root",
          title: "Edzői piszkozat",
          status: "draft",
        },
      ],
      publications: [
        {
          ...base,
          id: "publication-one",
          status: "withdrawn",
          resourceRef: { id: "material-one", revision: 1 },
        },
      ],
      plans: [
        {
          ...base,
          id: "plan-one",
          status: "active",
          acceptances: [
            {
              actorId: "parent-one",
              role: "parent",
              revision: 1,
              decision: "accept",
              at: "2026-10-29T08:30:00.000Z",
            },
          ],
        },
      ],
      checkin_sessions: [
        {
          ...base,
          id: "checkin-one",
          startedAt: base.createdAt,
          completedAt: null,
        },
      ],
    };
    const args = {
      db: await fixture(t, data),
      playerId: "player-1",
      cursorHmacKey: "x".repeat(40),
      now: new Date("2026-10-30"),
      limit: 50,
    };
    const page = await readTimeline({
      ...args,
      principal: {
        tenantId: "habi",
        actorId: "coach-one",
        role: "coach",
        accessRevision: 1,
      },
    });
    for (const kind of [
      "report.activity",
      "extraction.activity",
      "assessment_result.activity",
      "coach_material.activity",
      "publication.activity",
      "plan.accepted",
      "checkin.started",
    ])
      assert.ok(
        page.nodes.some((n) => n.kind === kind),
        kind,
      );
    const decision = page.nodes.find((n) => n.kind === "plan.accepted");
    assert.equal(decision.actorRole, "parent");
    assert.equal(decision.submittedAt, "2026-10-29T08:30:00.000Z");
    const parent = await readTimeline({
      ...args,
      principal: {
        tenantId: "habi",
        playerId: "player-1",
        actorId: "parent-one",
        role: "parent",
        accessRevision: 1,
      },
    });
    assert.ok(
      !parent.nodes.some(
        (n) => n.kind.endsWith(".activity") || n.kind === "checkin.started",
      ),
    );
  },
);

test(
  "coach activity keeps prior plan transitions and draft-save metadata without duplicating current source rows",
  localOnly,
  async (t) => {
    const base = {
      tenantId: "habi",
      playerId: "player-1",
      revision: 1,
      createdAt: "2026-10-29T08:00:00.000Z",
      updatedAt: "2026-10-29T08:00:00.000Z",
      actorRole: "player",
      sourceKind: "self",
      replyTo: null,
      relatedId: null,
    };
    const events = [
      {
        ...base,
        id: "draft-saved",
        kind: "activity.drafts.put",
        submittedAt: base.createdAt,
        resourceRef: { id: "draft-one", revision: 1 },
        processId: "draft-one",
      },
      {
        ...base,
        id: "plan-paused",
        kind: "activity.plans.paused",
        submittedAt: "2026-10-29T08:15:00.000Z",
        actorRole: "coach",
        resourceRef: { id: "plan-one", revision: 2 },
        processId: "plan-one",
      },
      {
        ...base,
        id: "plan-resumed",
        kind: "activity.plans.active",
        submittedAt: "2026-10-29T08:20:00.000Z",
        actorRole: "coach",
        resourceRef: { id: "plan-one", revision: 3 },
        processId: "plan-one",
      },
    ];
    const plans = [
      {
        ...base,
        id: "plan-one",
        revision: 3,
        status: "active",
        updatedAt: "2026-10-29T08:20:00.000Z",
        acceptances: [],
      },
    ];
    const args = {
      db: await fixture(t, { events, plans }),
      principal: {
        tenantId: "habi",
        actorId: "coach-one",
        role: "coach",
        accessRevision: 1,
      },
      playerId: "player-1",
      cursorHmacKey: "x".repeat(40),
      now: new Date("2026-10-30"),
      limit: 50,
    };
    const page = await readTimeline(args);
    assert.ok(
      page.nodes.some(
        (n) => n.id === "draft-saved" && n.summary.includes("Piszkozat"),
      ),
    );
    assert.ok(
      page.nodes.some(
        (n) => n.id === "plan-paused" && n.summary.includes("szüneteltetve"),
      ),
    );
    assert.ok(!page.nodes.some((n) => n.id === "plan-resumed"));
    assert.ok(
      page.nodes.some((n) => n.id === "plan-one" && n.kind === "plan.active"),
    );
  },
);

const tiedAt = "2026-11-01T10:00:00.000Z";
const envelope = {
  tenantId: "habi",
  playerId: "player-1",
  revision: 1,
  createdAt: tiedAt,
  updatedAt: tiedAt,
};
const coachPrincipal = {
  tenantId: "habi",
  actorId: "coach-one",
  role: "coach",
  accessRevision: 1,
};
function options(db, more = {}) {
  return {
    db,
    principal: coachPrincipal,
    playerId: "player-1",
    cursorHmacKey: "x".repeat(40),
    now: new Date("2026-11-02T00:00:00.000Z"),
    limit: 17,
    ...more,
  };
}
function diary(id, submittedAt = tiedAt) {
  return {
    ...envelope,
    id,
    kind: "diary",
    submittedAt,
    text: `Szintetikus bejegyzés ${id}`,
    sharingClass: "player_direct",
    source: { kind: "self" },
    recordedBy: { actorId: "player-actor", role: "player" },
  };
}
async function traverse(args) {
  let cursor = null;
  const nodes = [],
    pages = [];
  do {
    assert.ok(pages.length < 200, "continuation must make progress");
    const page = await readTimeline({ ...args, cursor });
    assert.ok(
      !page.nextCursor || page.nodes.length > 0,
      "no unexplained empty continuation page",
    );
    pages.push(page);
    nodes.push(...page.nodes);
    cursor = page.nextCursor;
  } while (cursor);
  const keys = nodes.map((n) => `${n.kind}:${n.id}`);
  assert.equal(
    new Set(keys).size,
    keys.length,
    "no duplicate event across pages",
  );
  return { nodes, pages };
}

test(
  "650 identical-timestamp records traverse with binary IDs independent of Mongo _id",
  localOnly,
  async (t) => {
    const records = Array.from({ length: 650 }, (_, i) =>
      diary(`${i % 2 ? "Z" : "a"}-record-${String(i).padStart(4, "0")}`),
    );
    const db = await fixture(t, {
      records: [
        ...records,
        { ...diary("foreign-tenant"), tenantId: "other" },
        { ...diary("foreign-player"), playerId: "other-player" },
      ],
    });
    const { nodes } = await traverse(options(db));
    assert.deepEqual(
      nodes.map((n) => n.id),
      records
        .map((r) => r.id)
        .sort()
        .reverse(),
    );
    assert.ok(nodes.every((n) => !n.id.includes("foreign")));
    assert.ok(
      nodes.every((n) => n.summary === `Szintetikus bejegyzés ${n.id}`),
    );
  },
);

test(
  "mixed projected events retain delayed answers, old decisions and global ledger dedup across small pages",
  localOnly,
  async (t) => {
    const coachTurns = Array.from({ length: 125 }, (_, i) => ({
      ...envelope,
      id: `turn-${i}`,
      actorId: "player-actor",
      role: "player",
      threadId: `thread-${i}`,
      question: "Jobban érzem magam.",
      createdAt: "2026-10-01T09:00:00.000Z",
      completedAt: tiedAt,
      status: "answered",
      answer: {
        reply: { text: "Szintetikus válasz" },
        claims: [],
        unknowns: [],
        clarifyingQuestions: [],
      },
    }));
    const plans = Array.from({ length: 75 }, (_, i) => ({
      ...envelope,
      id: `plan-${i}`,
      createdAt: "2026-10-01T09:00:00.000Z",
      status: "active",
      acceptances: [
        {
          role: "parent",
          actorId: "parent-one",
          revision: 1,
          decision: "accept",
          at: tiedAt,
        },
        {
          role: "player",
          actorId: "player-actor",
          revision: 2,
          decision: "accept",
          at: "2026-11-01T09:30:00.000Z",
        },
      ],
    }));
    const events = plans.map((p) => ({
      ...envelope,
      id: `ledger-${p.id}`,
      kind: "activity.plans.active",
      actorRole: "coach",
      sourceKind: "observation",
      submittedAt: tiedAt,
      resourceRef: { id: p.id, revision: 1 },
      processId: p.id,
      replyTo: null,
      relatedId: null,
    }));
    const reports = Array.from({ length: 30 }, (_, i) => ({
      ...envelope,
      id: `report-${i}`,
      createdAt: "2026-10-01T09:00:00.000Z",
    }));
    const db = await fixture(t, {
      habi_coach_turns: coachTurns,
      plans,
      events,
      reports,
    });
    const args = options(db, { from: "2026-11-01T00:00:00.000Z", limit: 9 });
    const { nodes } = await traverse(args);
    assert.equal(nodes.length, 125 + 75 * 3 + 30);
    assert.equal(nodes.filter((n) => n.kind === "coach.answer").length, 125);
    assert.equal(nodes.filter((n) => n.kind === "plan.accepted").length, 150);
    assert.ok(!nodes.some((n) => n.id.startsWith("ledger-")));
    assert.ok(
      nodes
        .filter((n) => n.kind === "coach.answer")
        .every((n) => n.replyTo && n.processId.startsWith("thread-")),
    );
    const answers = await traverse({ ...args, kind: "coach.answer" });
    assert.equal(answers.nodes.length, 125);
    const decisions = await traverse({ ...args, kind: "plan.accepted" });
    assert.equal(decisions.nodes.length, 150);
  },
);

test(
  "kind filtering fills pages before source limits, including sparse Hungarian message classifications",
  localOnly,
  async (t) => {
    const turns = Array.from({ length: 340 }, (_, i) => ({
      ...envelope,
      id: `turn-${String(i).padStart(4, "0")}`,
      actorId: "coach-one",
      role: "coach",
      threadId: "thread-one",
      question: i < 35 ? "Rövidebb választ szeretnék." : "Szia!",
      status: "queued",
    }));
    const records = Array.from({ length: 230 }, (_, i) => ({
      ...diary(`record-${i}`),
      ...(i < 30 ? { supersedesId: `original-${i}` } : {}),
    }));
    const db = await fixture(t, { habi_coach_turns: turns, records });
    assert.equal(
      (await traverse(options(db, { kind: "coach.feedback", limit: 8 }))).nodes
        .length,
      35,
    );
    assert.equal(
      (await traverse(options(db, { kind: "record.correction", limit: 8 })))
        .nodes.length,
      30,
    );
    assert.equal(
      (await traverse(options(db, { kind: "diary", limit: 8 }))).nodes.length,
      200,
    );
    assert.equal(
      (await readTimeline(options(db, { kind: "nonexistent.kind" }))).nodes
        .length,
      0,
    );
  },
);

test(
  "v2 cursor is actor, role, access, player, tenant, kind, date and expiry bound; v1 restarts",
  localOnly,
  async (t) => {
    const db = await fixture(t, {
      records: [diary("record-a"), diary("record-b")],
    });
    const args = options(db, { limit: 1 });
    const first = await readTimeline(args);
    assert.ok(first.nextCursor);
    const alterations = [
      { principal: { ...coachPrincipal, actorId: "coach-two" } },
      {
        principal: { ...coachPrincipal, role: "parent", playerId: "player-1" },
      },
      { principal: { ...coachPrincipal, accessRevision: 2 } },
      { principal: { ...coachPrincipal, tenantId: "other" } },
      { playerId: "other-player" },
      { kind: "diary" },
      { from: tiedAt },
      { to: tiedAt },
      { now: new Date("2026-11-02T00:31:00.000Z") },
    ];
    for (const change of alterations)
      await assert.rejects(
        readTimeline({ ...args, cursor: first.nextCursor, ...change }),
        { message: "CURSOR_EXPIRED" },
      );
    const value = JSON.parse(
      Buffer.from(first.nextCursor.split(".")[0], "base64url"),
    );
    delete value.version;
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    const signature = createHmac("sha256", args.cursorHmacKey)
      .update(`habi-timeline:${payload}`)
      .digest("base64url");
    await assert.rejects(
      readTimeline({ ...args, cursor: `${payload}.${signature}` }),
      { message: "CURSOR_EXPIRED" },
    );
    await assert.rejects(
      readTimeline({ ...args, cursor: `${first.nextCursor}tampered` }),
      { message: "INVALID_INPUT" },
    );
    await assert.rejects(readTimeline({ ...args, cursor: "x".repeat(4097) }), {
      message: "INVALID_INPUT",
    });
  },
);

test(
  "later writes and revoked publications are not returned as snapshot events",
  localOnly,
  async (t) => {
    const records = [
      diary("record-z"),
      { ...diary("record-y"), sharingClass: "coach" },
      diary("record-x"),
    ];
    const db = await fixture(t, {
      records,
      publications: [
        {
          ...envelope,
          id: "publication",
          status: "active",
          resourceRef: { id: "record-y", revision: 1 },
        },
      ],
    });
    const args = options(db, {
      limit: 1,
      principal: {
        ...coachPrincipal,
        role: "parent",
        actorId: "parent-one",
        playerId: "player-1",
      },
    });
    const first = await readTimeline(args);
    assert.equal(first.nodes[0].id, "record-z");
    await db
      .collection("records")
      .insertOne(diary("later", "2026-11-02T00:01:00.000Z"));
    await db
      .collection("publications")
      .updateOne(
        { id: "publication" },
        { $set: { status: "withdrawn", revision: 2 } },
      );
    const second = await readTimeline({ ...args, cursor: first.nextCursor });
    assert.deepEqual(
      second.nodes.map((n) => n.id),
      ["record-x"],
    );
    assert.equal(second.nextCursor, null);
    const empty = await readTimeline(options(await fixture(t, {})));
    assert.deepEqual(empty.nodes, []);
    assert.equal(empty.nextCursor, null);
  },
);

test(
  "source query fanout and returned rows stay bounded while native record cursor uses its index",
  localOnly,
  async (t) => {
    const db = await fixture(t, {
      records: Array.from({ length: 700 }, (_, i) =>
        diary(`record-${String(i).padStart(4, "0")}`),
      ),
    });
    await db
      .collection("records")
      .createIndex(
        { tenantId: 1, playerId: 1, submittedAt: -1, id: -1 },
        { name: "record_timeline" },
      );
    const calls = [];
    const observed = {
      collection(name) {
        const c = db.collection(name);
        return new Proxy(c, {
          get(target, key) {
            if (key === "aggregate")
              return (pipeline, opts) => {
                const cursor = target.aggregate(pipeline, opts);
                return {
                  async toArray() {
                    const rows = await cursor.toArray();
                    calls.push({ name, pipeline, opts, returned: rows.length });
                    return rows;
                  },
                };
              };
            return typeof target[key] === "function"
              ? target[key].bind(target)
              : target[key];
          },
        });
      },
    };
    const args = options(observed, { limit: 13 });
    const first = await readTimeline(args);
    assert.equal(first.nodes.length, 13);
    const firstCalls = calls.splice(0);
    const started = performance.now();
    const second = await readTimeline({ ...args, cursor: first.nextCursor });
    const duration = performance.now() - started;
    assert.equal(second.nodes.length, 13);
    assert.ok(
      calls.length <= 15,
      "fixed source fanout independent of record count",
    );
    assert.ok(
      calls.every(
        (c) =>
          c.returned <= 14 &&
          c.opts.maxTimeMS === 1500 &&
          c.opts.allowDiskUse === false,
      ),
    );
    const recordQuery = calls.find((c) => c.name === "records");
    const explain = await db
      .collection("records")
      .aggregate(recordQuery.pipeline)
      .explain("executionStats");
    const stats =
      explain.executionStats ??
      explain.stages?.find((s) => s.$cursor)?.$cursor.executionStats;
    assert.ok(stats, "Mongo execution statistics available");
    assert.ok(stats.totalDocsExamined <= 28, JSON.stringify(stats));
    t.diagnostic(
      JSON.stringify({
        nativePageMs: Math.round(duration),
        sourceQueries: calls.length,
        maxRowsPerSource: Math.max(...calls.map((c) => c.returned)),
        recordDocsExamined: stats.totalDocsExamined,
        initialSourceQueries: firstCalls.length,
      }),
    );
  },
);

test("database query time budget failures become explicit retryable dependency errors", async () => {
  const db = {
    collection() {
      return {
        aggregate() {
          return {
            async toArray() {
              throw Object.assign(new Error("private database details"), {
                code: 50,
              });
            },
          };
        },
      };
    },
  };
  await assert.rejects(readTimeline(options(db)), {
    message: "DEPENDENCY_UNAVAILABLE",
    retryAfter: 1,
  });
});

test(
  "the source tie-breaker survives the same public ID in different collections",
  localOnly,
  async (t) => {
    const db = await fixture(t, {
      records: [diary("same-id")],
      messages: [
        {
          ...envelope,
          id: "same-id",
          submittedAt: tiedAt,
          recordedBy: { role: "parent", actorId: "parent-one" },
          text: "Szintetikus",
          threadId: "thread-one",
          replyTo: null,
        },
      ],
    });
    const { nodes } = await traverse(options(db, { limit: 1 }));
    assert.deepEqual(
      nodes.map((n) => n.kind),
      ["diary", "thread.message"],
    );
  },
);

test(
  "a failed job outcome uses its own time even when its question predates the window",
  localOnly,
  async (t) => {
    const db = await fixture(t, {
      habi_coach_turns: [
        {
          ...envelope,
          id: "failed-turn",
          createdAt: "2026-10-01T09:00:00.000Z",
          updatedAt: "2026-10-01T09:00:00.000Z",
          status: "queued",
          actorId: "coach-one",
          role: "coach",
          threadId: "thread-one",
          question: "Szintetikus kérdés?",
          jobId: "failed-job",
        },
      ],
      jobs: [
        {
          ...envelope,
          id: "failed-job",
          kind: "coachConversation",
          status: "cancelled",
          updatedAt: tiedAt,
        },
      ],
    });
    const page = await readTimeline(
      options(db, { from: "2026-11-01T00:00:00.000Z", kind: "coach.failed" }),
    );
    assert.equal(page.nodes.length, 1);
    assert.equal(page.nodes[0].submittedAt, tiedAt);
    assert.equal(page.nodes[0].relatedId, "failed-turn");
  },
);

test(
  "a source inserted after the snapshot cannot enter through a backdated event time",
  localOnly,
  async (t) => {
    const db = await fixture(t, {
      records: [diary("record-z"), diary("record-x")],
    });
    const args = options(db, { limit: 1 });
    const first = await readTimeline(args);
    await db.collection("records").insertOne({
      ...diary("record-y"),
      createdAt: "2026-11-02T00:01:00.000Z",
    });
    const second = await readTimeline({ ...args, cursor: first.nextCursor });
    assert.deepEqual(
      second.nodes.map((n) => n.id),
      ["record-x"],
    );
  },
);

test(
  "a plan updated after the snapshot retains old decisions without inventing its later state",
  localOnly,
  async (t) => {
    const db = await fixture(t, {
      records: [
        diary("record-first", "2026-11-01T12:00:00.000Z"),
        diary("record-later"),
      ],
      plans: [
        {
          ...envelope,
          id: "plan-updated",
          status: "active",
          acceptances: [
            {
              actorId: "parent-one",
              role: "parent",
              revision: 1,
              decision: "accept",
              at: "2026-11-01T09:00:00.000Z",
            },
          ],
        },
      ],
    });
    const args = options(db, { limit: 1 });
    const first = await readTimeline(args);
    assert.equal(first.nodes[0].id, "record-first");
    await db.collection("plans").updateOne(
      { id: "plan-updated" },
      {
        $set: {
          status: "withdrawn",
          revision: 2,
          updatedAt: "2026-11-02T00:01:00.000Z",
        },
        $push: {
          acceptances: {
            actorId: "parent-one",
            role: "parent",
            revision: 2,
            decision: "decline",
            at: "2026-11-02T00:01:00.000Z",
          },
        },
      },
    );
    const second = await readTimeline({
      ...args,
      limit: 50,
      cursor: first.nextCursor,
    });
    assert.deepEqual(
      second.nodes.map((n) => n.kind),
      ["diary", "plan.accepted"],
    );
    assert.equal(second.nodes[1].id, "plan-decision-plan-updated-0");
    assert.equal(second.nextCursor, null);
  },
);
