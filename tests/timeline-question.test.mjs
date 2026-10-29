import assert from "node:assert/strict";
import test from "node:test";
import { readTimeline } from "../src/lib/workflows/timeline.mjs";

function collection(items = []) {
  return {
    find(filter = {}) {
      let found = items.filter((item) => {
        for (const [key, value] of Object.entries(filter)) {
          if (
            value &&
            typeof value === "object" &&
            ("$lte" in value || "$gte" in value)
          ) {
            if (value.$lte && item[key] > value.$lte) return false;
            if (value.$gte && item[key] < value.$gte) return false;
          } else if (item[key] !== value) return false;
        }
        return true;
      });
      const cursor = {
        sort(order) {
          const [[key, direction]] = Object.entries(order);
          found = [...found].sort(
            (a, b) => direction * a[key].localeCompare(b[key]),
          );
          return cursor;
        },
        limit(count) {
          found = found.slice(0, count);
          return cursor;
        },
        toArray: async () => found,
      };
      return cursor;
    },
    async findOne() {
      return null;
    },
  };
}

test("timeline keeps the question and its no-evidence outcome for the parent and player", async () => {
  const askedAt = "2026-10-26T10:15:00.000Z";
  const answeredAt = "2026-10-26T10:16:30.000Z";
  const question = "Miért volt ma nehéz az edzés?";
  const db = {
    collection(name) {
      const entries = {
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
      };
      return collection(entries[name] ?? []);
    },
  };
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
    const prompt = result.nodes.find((node) => node.kind === "thread.message");
    assert.equal(prompt.summary, question);
    assert.equal(
      answer.summary,
      "A Habi nem talált ellenőrizhető, forrásolt választ. Nem vont le következtetést.",
    );
    assert.equal(answer.relatedId, prompt.id);
    assert.equal(answer.submittedAt, answeredAt);
  }
});

test("timeline can be filtered to a time window and its cursor is bound to that window", async () => {
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
  const db = {
    collection(name) {
      const entries = {
        messages: events,
        threads: [{ id: "thread-1", closedAt: null }],
      };
      return collection(entries[name] ?? []);
    },
  };
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
});

test("coaches see every role's AI messages, feedback and outcomes while other viewers retain their own scope", async () => {
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
  const db = {
    collection: (name) =>
      collection(
        {
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
        }[name] ?? [],
      ),
  };
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
    !parent.nodes.some((n) => n.id === "player-turn" || n.id === "coach-turn"),
  );
  assert.ok(parent.nodes.some((n) => n.id === "parent-turn"));
});

test("timeline pagination reaches records older than the per-query sample size", async () => {
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
  const db = {
    collection: (name) => collection(name === "records" ? records : []),
  };
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
});

test("coach activity includes operational documents, unpublished versions and recorded plan decisions", async () => {
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
    db: { collection: (name) => collection(data[name] ?? []) },
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
});

test("coach activity keeps prior plan transitions and draft-save metadata without duplicating current source rows", async () => {
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
    db: { collection: (name) => collection({ events, plans }[name] ?? []) },
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
});
