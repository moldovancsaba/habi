// Event bounds apply BEFORE each source limit. No Mongo _id participates in ordering.
import { HabiApiError } from "../api/error-response.mjs";
import { timelineCoachMessageKind } from "./timeline-projection.mjs";
export const TIMELINE_QUERY_MAX_MS = 1_500;
export const TIMELINE_SOURCE_CONCURRENCY = 4;
const scope = (principal, playerId) => ({
  tenantId: principal.tenantId,
  playerId,
});
const fallback = (field, other) => ({ $ifNull: [`$${field}`, `$${other}`] });
const prefixed = (prefix) => ({ $concat: [prefix, "$id"] });
const event = (id, at, projection, kind = null) => ({
  id,
  at,
  projection,
  kind,
});

// Simple/binary ordering is shared with Mongo. localeCompare would order case and
// punctuation differently, skipping real IDs at an equal-timestamp boundary.
export function compareTimelineKeys(a, b) {
  for (const key of ["at", "id", "stream"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? 1 : -1;
  }
  return 0;
}

function bounds(at, id, stream, position, from, upper) {
  return {
    [at]: { $type: "string", $lte: upper, ...(from ? { $gte: from } : {}) },
    ...(position
      ? {
          $or: [
            { [at]: { $lt: position.at } },
            { [at]: position.at, [id]: { $lt: position.id } },
            ...(stream < position.stream
              ? [{ [at]: position.at, [id]: position.id }]
              : []),
          ],
        }
      : {}),
  };
}

const fields = {
  records: [
    "submittedAt",
    "kind",
    "sharingClass",
    "source",
    "recordedBy",
    "sessionId",
    "supersedesId",
  ],
  checkin_results: ["completedAt", "sessionId"],
  messages: [
    "submittedAt",
    "threadId",
    "replyTo",
    "privateToCoach",
    "recordedBy",
    "text",
  ],
  plans: ["status", "acceptances"],
  follow_ups: ["recordedBy", "source", "planRef"],
  interpretations: ["threadId", "turnId", "answer"],
  habi_coach_turns: [
    "actorId",
    "role",
    "threadId",
    "question",
    "status",
    "answer",
    "jobId",
    "completedAt",
  ],
  habi_coach_profile_events: [
    "actorId",
    "role",
    "kind",
    "text",
    "value",
    "sourceRefs",
  ],
  checkin_sessions: ["startedAt", "completedAt"],
  publications: ["status", "resourceRef"],
  events: [
    "kind",
    "submittedAt",
    "actorRole",
    "sourceKind",
    "resourceRef",
    "processId",
    "replyTo",
    "relatedId",
  ],
};

function documentProjection(name) {
  return Object.fromEntries(
    [
      "id",
      "revision",
      "createdAt",
      "updatedAt",
      ...(fields[name] ?? ["title", "reportRef", "materialId"]),
    ].map((f) => [f, `$${f}`]),
  );
}

// A current canonical node replaces only the matching revision's ledger row.
// Resolve this globally, not against whichever documents happen to be on a page.
const canonical = {
  records: ["records"],
  "checkin-sessions": ["checkin_results", "checkin_sessions"],
  "ai-coach": ["habi_coach_turns"],
  "ai-reviews": ["habi_coach_turns"],
  "ai-profile": ["habi_coach_profile_events"],
  messages: ["messages"],
  threads: ["messages"],
  plans: ["plans"],
  "follow-ups": ["follow_ups"],
  reports: ["reports", "extractions"],
  extractions: ["extractions"],
  materials: ["coach_materials"],
  interpretations: ["interpretations"],
};
function ledgerDedup(principal, playerId) {
  const byCollection = new Map();
  for (const [domain, names] of Object.entries(canonical))
    for (const name of names)
      byCollection.set(name, [...(byCollection.get(name) ?? []), domain]);
  const stages = [];
  let index = 0;
  for (const [name, domains] of byCollection) {
    const alias = `canonical${index++}`;
    stages.push(
      {
        $lookup: {
          from: name,
          let: {
            resourceId: "$resourceRef.id",
            resourceRevision: "$resourceRef.revision",
            domain: { $arrayElemAt: [{ $split: ["$kind", "."] }, 1] },
          },
          pipeline: [
            {
              $match: {
                ...scope(principal, playerId),
                $expr: {
                  $and: [
                    { $in: ["$$domain", domains] },
                    { $eq: ["$id", "$$resourceId"] },
                    { $eq: ["$revision", "$$resourceRevision"] },
                  ],
                },
              },
            },
            { $project: { _id: 0, id: 1 } },
            { $limit: 1 },
          ],
          as: alias,
        },
      },
      { $match: { [`${alias}.0`]: { $exists: false } } },
    );
  }
  return stages;
}

function definitions(principal, playerOwnsResults) {
  const coach = principal.role === "coach";
  const own = coach ? {} : { actorId: principal.actorId, role: principal.role };
  const sources = [
    { name: "records", time: "submittedAt" },
    ...(principal.role !== "player" || playerOwnsResults
      ? [{ name: "checkin_results", time: "completedAt" }]
      : []),
    {
      name: "messages",
      time: "submittedAt",
      match:
        principal.role === "parent" ? { privateToCoach: { $ne: true } } : {},
    },
    {
      name: "plans",
      events: [
        event("$id", fallback("updatedAt", "createdAt"), "current", {
          $concat: ["plan.", "$status"],
        }),
        ...(coach
          ? [
              {
                $map: {
                  input: {
                    $range: [0, { $size: { $ifNull: ["$acceptances", []] } }],
                  },
                  as: "index",
                  in: {
                    id: {
                      $concat: [
                        "plan-decision-",
                        "$id",
                        "-",
                        { $toString: "$$index" },
                      ],
                    },
                    at: {
                      $let: {
                        vars: {
                          decision: {
                            $arrayElemAt: ["$acceptances", "$$index"],
                          },
                        },
                        in: "$$decision.at",
                      },
                    },
                    projection: "decision",
                    kind: {
                      $let: {
                        vars: {
                          decision: {
                            $arrayElemAt: ["$acceptances", "$$index"],
                          },
                        },
                        in: {
                          $cond: [
                            { $eq: ["$$decision.decision", "accept"] },
                            "plan.accepted",
                            "plan.declined",
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ]
          : []),
      ],
    },
    { name: "follow_ups", time: "createdAt" },
    {
      name: "interpretations",
      time: "updatedAt",
      match: coach
        ? {}
        : {
            $or: [
              { "answer.status": "no_evidence" },
              { "answer.status": "ready", "answer.validity": "current" },
            ],
          },
    },
    { name: "habi_coach_turns", match: own, coachTurns: true },
    { name: "habi_coach_profile_events", time: "createdAt", match: own },
  ];
  if (coach)
    sources.push(
      ...[
        "reports",
        "extractions",
        "assessment_results",
        "coach_materials",
      ].map((name) => ({
        name,
        events: [event("$id", fallback("updatedAt", "createdAt"), "current")],
      })),
      {
        name: "checkin_sessions",
        match: { createdAt: { $type: "string" } },
        events: [
          event(
            prefixed("checkin-start-"),
            fallback("startedAt", "createdAt"),
            "start",
          ),
        ],
      },
      {
        name: "publications",
        events: [event("$id", fallback("updatedAt", "createdAt"), "current")],
      },
      {
        name: "events",
        time: "submittedAt",
        match: { kind: /^activity\./ },
        ledger: true,
      },
    );
  return sources;
}

function filterSource(source, kind) {
  if (!kind) return source;
  const staticKinds = {
    checkin_results: "checkin.completed",
    messages: "thread.message",
    follow_ups: "plan.follow_up",
    publications: "publication.activity",
    checkin_sessions: "checkin.started",
    reports: "report.activity",
    extractions: "extraction.activity",
    assessment_results: "assessment_result.activity",
    coach_materials: "coach_material.activity",
  };
  if (staticKinds[source.name])
    return staticKinds[source.name] === kind ? source : null;
  if (source.name === "records")
    if (
      !["diary", "observation", "checkin_answer", "record.correction"].includes(
        kind,
      )
    )
      return null;
  if (source.name === "records")
    return {
      ...source,
      match:
        kind === "record.correction"
          ? { supersedesId: { $type: "string", $ne: "" } }
          : { kind, supersedesId: null },
    };
  if (source.name === "events")
    return kind.startsWith("activity.") ? { ...source, match: { kind } } : null;
  if (source.name === "habi_coach_profile_events")
    return kind.startsWith("coach.")
      ? {
          ...source,
          match: {
            ...source.match,
            kind: kind === "coach.exclusion" ? "forget" : kind.slice(6),
          },
        }
      : null;
  if (source.name === "interpretations")
    return ["interpretation.no_evidence", "interpretation.ready"].includes(kind)
      ? {
          ...source,
          match: {
            ...source.match,
            ...(kind === "interpretation.no_evidence"
              ? { "answer.status": "no_evidence" }
              : { "answer.status": { $ne: "no_evidence" } }),
          },
        }
      : null;
  if (source.name === "plans")
    return kind.startsWith("plan.") ? { ...source, eventKind: kind } : null;
  if (source.coachTurns) {
    if (
      [
        "coach.message",
        "coach.update",
        "coach.feedback",
        "coach.correction",
      ].includes(kind)
    )
      return { ...source, time: "createdAt", questionKind: kind };
    return ["coach.answer", "coach.failed"].includes(kind)
      ? { ...source, eventKind: kind }
      : null;
  }
  return null;
}

function pipelineFor(source, options) {
  const { principal, playerId, position, from, upper, count, snapshotAt } =
    options;
  const stages = [
    { $match: { ...scope(principal, playerId), ...source.match } },
    { $match: { $nor: [{ createdAt: { $gt: snapshotAt } }] } },
  ];
  if (source.time)
    stages.push({
      $match: bounds(source.time, "id", source.name, position, from, upper),
    });
  if (source.name === "records" && principal.role !== "coach") {
    if (principal.role === "player")
      stages.push({ $match: { sharingClass: "player_direct" } });
    else
      stages.push(
        {
          $lookup: {
            from: "publications",
            let: { resourceId: "$id", resourceRevision: "$revision" },
            pipeline: [
              {
                $match: {
                  ...scope(principal, playerId),
                  status: "active",
                  $expr: {
                    $and: [
                      { $eq: ["$resourceRef.id", "$$resourceId"] },
                      { $eq: ["$resourceRef.revision", "$$resourceRevision"] },
                    ],
                  },
                },
              },
              { $limit: 1 },
              { $project: { _id: 0, id: 1 } },
            ],
            as: "visiblePublication",
          },
        },
        {
          $match: {
            $or: [
              { sharingClass: { $in: ["player_direct", "parent_shared"] } },
              { "visiblePublication.0": { $exists: true } },
            ],
          },
        },
      );
  }
  if (source.ledger) stages.push(...ledgerDedup(principal, playerId));
  if (source.time)
    stages.push({ $sort: { [source.time]: -1, id: -1 } }, { $limit: count });
  if (source.coachTurns) {
    if (!source.questionKind)
      stages.push(
        {
          $lookup: {
            from: "jobs",
            let: { jobId: "$jobId" },
            pipeline: [
              {
                $match: {
                  ...scope(principal, playerId),
                  kind: "coachConversation",
                  $expr: { $eq: ["$id", "$$jobId"] },
                },
              },
              { $project: { _id: 0, status: 1, updatedAt: 1 } },
              { $limit: 1 },
            ],
            as: "outcomeJob",
          },
        },
        { $set: { outcomeJob: { $arrayElemAt: ["$outcomeJob", 0] } } },
      );
    const hasAnswer = { $ne: [{ $ifNull: ["$answer", null] }, null] };
    source = {
      ...source,
      events: [
        ...(source.eventKind ? [] : [event("$id", "$createdAt", "question")]),
        ...(source.questionKind
          ? []
          : [
              {
                $cond: [
                  {
                    $or: [
                      hasAnswer,
                      { $eq: ["$status", "failed"] },
                      { $in: ["$outcomeJob.status", ["failed", "cancelled"]] },
                    ],
                  },
                  [
                    event(
                      prefixed("coach-answer-"),
                      {
                        $cond: [
                          hasAnswer,
                          fallback("completedAt", "updatedAt"),
                          { $ifNull: ["$outcomeJob.updatedAt", "$updatedAt"] },
                        ],
                      },
                      "answer",
                      { $cond: [hasAnswer, "coach.answer", "coach.failed"] },
                    ),
                  ],
                  [],
                ],
              },
            ]),
      ],
    };
  }
  // Entries are singleton events or arrays (plan decisions / optional AI outcome).
  const projectedEvents = source.time
    ? [event("$id", `$${source.time}`, "current")]
    : source.events;
  stages.push(
    {
      $project: {
        _id: 0,
        document: documentProjection(source.name),
        events: {
          $concatArrays: projectedEvents.map((entry) =>
            Array.isArray(entry)
              ? entry
              : entry.$map || entry.$cond
                ? entry
                : [entry],
          ),
        },
      },
    },
    { $unwind: "$events" },
  );
  if (source.eventKind)
    stages.push({ $match: { "events.kind": source.eventKind } });
  if (!source.time)
    stages.push(
      {
        $match: bounds(
          "events.at",
          "events.id",
          source.name,
          position,
          from,
          upper,
        ),
      },
      { $sort: { "events.at": -1, "events.id": -1 } },
      { $limit: count },
    );
  return stages;
}

/** Bounded fanout; every source returns at most page+1 already visible event refs. */
export async function readTimelineSources({
  db,
  principal,
  playerId,
  position,
  from,
  upper,
  count,
  kind,
  snapshotAt,
}) {
  const player =
    principal.role === "player"
      ? await db
          .collection("players")
          .findOne(
            { tenantId: principal.tenantId, id: playerId },
            { projection: { actorId: 1 }, maxTimeMS: TIMELINE_QUERY_MAX_MS },
          )
      : null;
  const playerOwnsResults =
    principal.role !== "player" || player?.actorId === principal.actorId;
  const sources = definitions(principal, playerOwnsResults)
    .map((s) => filterSource(s, kind))
    .filter(Boolean);
  const rows = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: TIMELINE_SOURCE_CONCURRENCY }, async () => {
      while (next < sources.length) {
        const source = sources[next++];
        let after = position,
          accepted = [],
          rounds = 0;
        const deadline = performance.now() + 6_000;
        const batchSize = source.questionKind ? 100 : count;
        do {
          if (++rounds > 128 || performance.now() > deadline)
            throw new HabiApiError("DEPENDENCY_UNAVAILABLE", { retryAfter: 1 });
          const found = await db
            .collection(source.name)
            .aggregate(
              pipelineFor(source, {
                principal,
                playerId,
                position: after,
                from,
                upper,
                count: batchSize,
                snapshotAt,
              }),
              {
                maxTimeMS: TIMELINE_QUERY_MAX_MS,
                allowDiskUse: false,
                collation: { locale: "simple" },
              },
            )
            .toArray();
          accepted.push(
            ...found.filter(
              (row) =>
                !source.questionKind ||
                timelineCoachMessageKind(row.document) === source.questionKind,
            ),
          );
          if (
            !source.questionKind ||
            found.length < batchSize ||
            accepted.length >= count
          )
            break;
          after = { ...found.at(-1).events, stream: source.name };
        } while (accepted.length < count);
        rows.push(
          ...accepted
            .slice(0, count)
            .map((row) => ({ ...row, stream: source.name })),
        );
      }
    }),
  );
  return { rows, playerOwnsResults };
}

export async function hydrateTimelineSources({
  db,
  principal,
  playerId,
  selected,
  playerOwnsResults,
}) {
  const byName = new Map();
  for (const row of selected) {
    if (!byName.has(row.stream)) byName.set(row.stream, new Map());
    byName.get(row.stream).set(row.document.id, row.document);
  }
  const docs = (name) => [...(byName.get(name)?.values() ?? [])];
  const get = async (name, ids, extra = {}) =>
    ids.length
      ? db
          .collection(name)
          .find(
            {
              ...scope(principal, playerId),
              id: { $in: [...new Set(ids)] },
              ...extra,
            },
            { maxTimeMS: TIMELINE_QUERY_MAX_MS },
          )
          .toArray()
      : [];
  const own =
    principal.role === "coach"
      ? {}
      : { actorId: principal.actorId, role: principal.role };
  const interpretations = docs("interpretations"),
    coachEvents = docs("habi_coach_profile_events");
  const extraTurnIds = coachEvents.flatMap(
    (e) =>
      e.sourceRefs
        ?.filter((r) => r.id.startsWith("coach-message-"))
        .map((r) => r.id.slice(14)) ?? [],
  );
  const [turns, relatedCoachTurns] = await Promise.all([
    get(
      "turns",
      interpretations.map((i) => i.turnId),
    ),
    get("habi_coach_turns", extraTurnIds, own),
  ]);
  // This enrichment must not use the page's message sample: an answer can be months newer.
  const questions = turns.length
    ? await db
        .collection("messages")
        .find(
          {
            ...scope(principal, playerId),
            ...(principal.role === "parent"
              ? { privateToCoach: { $ne: true } }
              : {}),
            $or: turns.map((t) => ({
              threadId: t.threadId,
              text: t.question,
              submittedAt: t.createdAt,
            })),
          },
          { maxTimeMS: TIMELINE_QUERY_MAX_MS },
        )
        .limit(turns.length)
        .toArray()
    : [];
  const records = docs("records"),
    results = docs("checkin_results"),
    messages = docs("messages");
  const coachTurns = [
    ...new Map(
      [...docs("habi_coach_turns"), ...relatedCoachTurns].map((t) => [t.id, t]),
    ).values(),
  ];
  const [sessions, threads, coachJobs, activePublications] = await Promise.all([
    get(
      "checkin_sessions",
      [
        ...records.map((r) => r.sessionId),
        ...results.map((r) => r.sessionId),
      ].filter(Boolean),
    ),
    get(
      "threads",
      [...messages, ...interpretations].map((d) => d.threadId).filter(Boolean),
    ),
    get("jobs", coachTurns.map((t) => t.jobId).filter(Boolean), {
      kind: "coachConversation",
    }),
    principal.role === "parent" && records.length
      ? db
          .collection("publications")
          .find(
            {
              ...scope(principal, playerId),
              status: "active",
              $or: records.map((r) => ({
                "resourceRef.id": r.id,
                "resourceRef.revision": r.revision,
              })),
            },
            { maxTimeMS: TIMELINE_QUERY_MAX_MS },
          )
          .toArray()
      : [],
  ]);
  return {
    records,
    results,
    messages: [...messages, ...questions],
    plans: docs("plans"),
    followUps: docs("follow_ups"),
    interpretations,
    publications: [...docs("publications"), ...activePublications],
    sessions: [...docs("checkin_sessions"), ...sessions],
    threads,
    turns,
    coachTurns,
    coachEvents,
    coachJobs,
    savedActivity: docs("events"),
    playerOwnsResults,
    operational: [
      "reports",
      "extractions",
      "assessment_results",
      "coach_materials",
    ].map((name) => ({ name, items: docs(name) })),
  };
}
