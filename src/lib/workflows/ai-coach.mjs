import { randomUUID } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";
import { runIdempotentCommand } from "../database/idempotent-command.mjs";
import {
  collectCoachSources,
  contentSource,
  ownerScope,
  sourceRef,
  resolveCoachContext,
  selectRelevantSources,
  getCoachProfile,
  redactCoachDocument,
  requireCoachPlayer,
  coachPages,
} from "./coach-memory.mjs";
import practices from "../content/practices-v2.json" with { type: "json" };
import journeys from "../content/journeys-v1.json" with { type: "json" };
import assessments from "../content/coach-assessments-v1.json" with {
  type: "json",
};

function authoredSources() {
  return [
    ...Object.keys(coachPages).map((page) =>
      contentSource({ kind: "page", page }),
    ),
    ...["all", "energy", "sleep", "focus", "mood", "load"].map((metric) =>
      contentSource({ kind: "metric", metric, id: metric }),
    ),
    ...practices.items.map((p) =>
      contentSource({ kind: "practice", id: p.id }),
    ),
    ...Object.keys(journeys.topics).map((id) =>
      contentSource({ kind: "topic", id }),
    ),
    ...assessments.topics.map((t) =>
      contentSource({ kind: "assessment", id: t.id }),
    ),
  ];
}
export async function verifyCoachSources(
  db,
  principal,
  playerId,
  refs,
  session,
) {
  const { sources } = await collectCoachSources(
    db,
    principal,
    playerId,
    session,
  );
  const available = [...sources, ...authoredSources()];
  for (const ref of refs.filter((r) => r.id.startsWith("profile-snapshot-"))) {
    const turn = await db.collection("habi_coach_turns").findOne(
      {
        ...ownerScope(principal, playerId),
        id: ref.id.slice("profile-snapshot-".length),
      },
      session ? { session } : undefined,
    );
    if (
      turn?.profileSnapshot &&
      turn.profileSources.every((r) =>
        available.some((s) => s.id === r.id && s.revision === r.revision),
      )
    )
      available.push(turn.profileSnapshot);
  }
  return refs.map((r) => {
    const s = available.find(
      (s) => s.id === r.id && s.revision === r.revision && r.span === null,
    );
    if (!s) throw new HabiApiError("NOT_FOUND");
    return s;
  });
}
async function inputFor(request, name) {
  let input;
  try {
    input = await request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (!isValidApiInput(name, input)) throw new HabiApiError("INVALID_INPUT");
  return input;
}
function keyFor(request) {
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
    throw new HabiApiError("INVALID_INPUT");
  return key;
}
const common = (principal, playerId, now) => ({
  ...ownerScope(principal, playerId),
  schemaVersion: 2,
  revision: 1,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  retentionPolicyId: principal.retentionPolicyId,
});
function refEqual(left, right) {
  return (
    JSON.stringify(left.map((x) => [x.id, x.revision, x.span]).sort()) ===
    JSON.stringify(right.map((x) => [x.id, x.revision, x.span]).sort())
  );
}
export async function startCoachTurn({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  await requireCoachPlayer(db, principal, playerId);
  const input = await inputFor(request, "CoachChatInput");
  const scope = ownerScope(principal, playerId);
  const threadId = input.threadId ?? randomUUID(),
    turnId = randomUUID(),
    jobId = randomUUID();
  const { sources, profile } = await getCoachProfile({
    db,
    principal,
    playerId,
    now,
  });
  const existing = input.threadId
    ? await db
        .collection("habi_coach_threads")
        .findOne({ ...scope, id: threadId })
    : null;
  if (input.threadId && !existing) throw new HabiApiError("NOT_FOUND");
  const context = existing?.context ?? input.context;
  const anchor = await resolveCoachContext(
    db,
    principal,
    playerId,
    context,
    sources,
  );
  const question =
    input.question.trim() ||
    (existing
      ? ""
      : `Magyarázd el ezt egyszerűen: ${anchor.title}. Mutasd meg, mi olvasható ki a mentett adatokból, és kérdezz vissza, hogy miben segíthetsz.`);
  if (!question) throw new HabiApiError("INVALID_INPUT");
  const previous = existing
    ? await db
        .collection("habi_coach_turns")
        .find({ ...scope, threadId })
        .sort({ createdAt: -1, id: -1 })
        .limit(1)
        .next()
    : null;
  const profileWords = profile.facts
    .filter((f) => f.category === "known" || f.category === "helped")
    .slice(-5)
    .map((f) => f.text)
    .join(" ");
  const selectedSources = sources.filter((source) => {
    if (
      context.eventKind &&
      context.eventKind !== "all" &&
      source.eventKind !== context.eventKind
    )
      return false;
    if (
      (context.from && source.at < context.from) ||
      (context.to && source.at >= context.to)
    )
      return false;
    if (
      context.days &&
      Date.parse(source.at) < now.getTime() - context.days * 86400000
    )
      return false;
    if (
      context.actorRole &&
      context.actorRole !== "all" &&
      source.role !== context.actorRole
    )
      return false;
    return true;
  });
  const relevant = selectRelevantSources(
    selectedSources,
    `${question} ${previous?.question ?? ""} ${profileWords}`,
    anchor,
    10,
  );
  const memoryFacts = profile.facts
    .filter(
      (f) =>
        f.category === "pattern" ||
        f.category === "known" ||
        f.category === "helped",
    )
    .slice(-8);
  const profileSources = [
    ...new Map(
      memoryFacts
        .flatMap((f) => [...f.sourceRefs, ...f.counterEvidence])
        .map((r) => [`${r.id}:${r.revision}`, r]),
    ).values(),
  ].slice(0, 200);
  const profileSnapshot = memoryFacts.length
    ? {
        id: `profile-snapshot-${turnId}`,
        revision: 1,
        span: null,
        kind: "derived_profile",
        title: "A játékos forrásolt profiljának pillanatképe",
        text: memoryFacts
          .map((f) => `${f.at} · ${f.text}`)
          .join("\n\n")
          .slice(0, 4000),
        at: now.toISOString(),
        role: principal.role,
      }
    : null;
  const refs = relevant
    .map(sourceRef)
    .concat(profileSnapshot ? [sourceRef(profileSnapshot)] : []);
  const windowLabel = context.days
    ? `\nKijelölt időszak: ${context.days} nap.`
    : context.from
      ? `\nKijelölt nap: ${new Date(context.from).toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" })}.`
      : "";
  const opening =
    `${anchor.title}${windowLabel}\n\n${anchor.text}\n\nKérdezhetsz az itt látható tartalomról és a számodra hozzáférhető játékosi előzményekről. A személyes következtetést külön jelöljük; nem készítünk diagnózist.`.slice(
      0,
      4000,
    );
  const result = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    method: request.method,
    path: new URL(request.url).pathname,
    key: keyFor(request),
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      await verifyCoachSources(
        tx,
        principal,
        playerId,
        refs.filter((r) => r.id !== profileSnapshot?.id),
        session,
      );
      await verifyCoachSources(
        tx,
        principal,
        playerId,
        profileSources,
        session,
      );
      if (existing) {
        const changed = await tx.collection("habi_coach_threads").updateOne(
          {
            ...scope,
            id: threadId,
            revision: input.expectedRevision,
            status: "open",
          },
          { $set: { updatedAt: now.toISOString() }, $inc: { revision: 1 } },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new HabiApiError("REVISION_CONFLICT");
        // A user's question takes priority over the legacy automatic opening.
        // Other user questions remain queued; sending never waits on generation.
        const pending = await tx
          .collection("habi_coach_turns")
          .find({ ...scope, threadId, status: "queued" }, { session })
          .toArray();
        for (const previous of pending) {
          const automatic =
            previous.createdAt === existing.createdAt &&
            previous.question.startsWith("Magyarázd el ezt egyszerűen:");
          const pendingJob = await tx
            .collection("jobs")
            .findOne(
              { tenantId: principal.tenantId, id: previous.jobId },
              { session },
            );
          if (automatic) {
            await tx.collection("jobs").updateOne(
              {
                tenantId: principal.tenantId,
                id: previous.jobId,
                status: { $in: ["queued", "leased", "running"] },
              },
              {
                $set: {
                  status: "cancelled",
                  reasonCode: "REPLACED_BY_QUESTION",
                  workerClientId: null,
                  leaseTokenHash: null,
                  leaseUntil: null,
                  updatedAt: now.toISOString(),
                },
                $inc: { revision: 1 },
              },
              { session },
            );
          }
          if (
            automatic ||
            (pendingJob && ["failed", "cancelled"].includes(pendingJob.status))
          )
            await tx.collection("habi_coach_turns").updateOne(
              { ...scope, id: previous.id, revision: previous.revision },
              {
                $set: { status: "failed", updatedAt: now.toISOString() },
                $inc: { revision: 1 },
              },
              { session },
            );
        }
      } else {
        if (input.expectedRevision !== 0)
          throw new HabiApiError("REVISION_CONFLICT");
        const thread = {
          ...common(principal, playerId, now),
          id: threadId,
          context,
          opening,
          status: "open",
        };
        validateContractDocument("habi_coach_threads", thread);
        await tx
          .collection("habi_coach_threads")
          .insertOne(thread, { session });
      }
      // The authored introduction is immediate. Generate only when the user asks.
      if (!existing && !input.question.trim())
        return { status: 201, resultRef: { id: threadId, revision: 1 } };
      const turn = {
        ...common(principal, playerId, now),
        id: turnId,
        threadId,
        question,
        sourceRefs: refs,
        answer: null,
        status: "queued",
        jobId,
        profileSnapshot,
        profileSources,
        reviewState: "none",
        reviewRationale: "",
        reviewerActorId: null,
        context,
      };
      const job = {
        id: jobId,
        tenantId: principal.tenantId,
        schemaVersion: 2,
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        retentionPolicyId: principal.retentionPolicyId,
        playerId,
        kind: "coachConversation",
        requesterActorId: principal.actorId,
        requesterAccessRevision: principal.accessRevision,
        requesterRole: principal.role,
        turnId,
        uploadId: null,
        sourceRefs: refs,
        status: "queued",
        reasonCode: null,
        workerClientId: null,
        fence: 0,
        leaseTokenHash: null,
        leaseUntil: null,
        nextAttemptAt: now.toISOString(),
        claimKeyHash: null,
        claimServiceId: null,
        claimRequestHash: null,
        claimContextRevision: null,
        attempts: 0,
        resultRef: null,
        retryOf: null,
      };
      validateContractDocument("habi_coach_turns", turn);
      validateContractDocument("jobs", job);
      await tx.collection("habi_coach_turns").insertOne(turn, { session });
      await tx.collection("jobs").insertOne(job, { session });
      return { status: 202, resultRef: { id: turnId, revision: 1 } };
    },
  });
  const turn = await db
    .collection("habi_coach_turns")
    .findOne({ ...scope, id: result.resultRef.id });
  if (!turn)
    return { threadId: result.resultRef.id, turnId: null, jobId: null };
  return { threadId: turn.threadId, turnId: turn.id, jobId: turn.jobId };
}
export async function listCoachThreads({
  db,
  principal,
  playerId,
  before = /** @type {string | null} */ (null),
}) {
  await requireCoachPlayer(db, principal, playerId);
  const query = ownerScope(principal, playerId);
  if (before) {
    const prior = await db
      .collection("habi_coach_threads")
      .findOne({ ...query, id: before });
    if (!prior) throw new HabiApiError("NOT_FOUND");
    query.$or = [
      { updatedAt: { $lt: prior.updatedAt } },
      { updatedAt: prior.updatedAt, id: { $lt: prior.id } },
    ];
  }
  const threads = await db
    .collection("habi_coach_threads")
    .find(query)
    .sort({ updatedAt: -1, id: -1 })
    .limit(31)
    .toArray();
  return {
    items: threads.slice(0, 30).map(redactCoachDocument),
    nextCursor: threads.length > 30 ? threads[29].id : null,
  };
}
export async function readCoachThread({
  db,
  principal,
  playerId,
  id,
  before = /** @type {string | null} */ (null),
}) {
  await requireCoachPlayer(db, principal, playerId);
  const scope = ownerScope(principal, playerId);
  const thread = await db
    .collection("habi_coach_threads")
    .findOne({ ...scope, id });
  if (!thread) throw new HabiApiError("NOT_FOUND");
  const { sources } = await collectCoachSources(db, principal, playerId);
  const available = [...sources, ...authoredSources()];
  const query = { ...scope, threadId: id };
  if (before) {
    const prior = await db
      .collection("habi_coach_turns")
      .findOne({ ...query, id: before });
    if (!prior) throw new HabiApiError("NOT_FOUND");
    query.$or = [
      { createdAt: { $lt: prior.createdAt } },
      { createdAt: prior.createdAt, id: { $lt: prior.id } },
    ];
  }
  const turns = await db
    .collection("habi_coach_turns")
    .find(query)
    .sort({ createdAt: -1, id: -1 })
    .limit(31)
    .toArray();
  const items = [];
  for (const turn of turns.slice(0, 30).reverse()) {
    if (
      turn.profileSnapshot &&
      turn.profileSources.every((r) =>
        available.some((s) => s.id === r.id && s.revision === r.revision),
      ) &&
      !available.some((s) => s.id === turn.profileSnapshot.id)
    )
      available.push(turn.profileSnapshot);
    const current = turn.sourceRefs.every((r) =>
      available.some((s) => s.id === r.id && s.revision === r.revision),
    );
    const job = ["queued", "failed"].includes(turn.status)
      ? await db
          .collection("jobs")
          .findOne({ tenantId: principal.tenantId, id: turn.jobId })
      : null;
    const answer =
      turn.answer && current
        ? {
            ...turn.answer,
            claims: turn.answer.claims.filter(
              (c) =>
                c.kind !== "inference" ||
                principal.role === "coach" ||
                turn.reviewState === "approved",
            ),
          }
        : null;
    items.push({
      ...redactCoachDocument(turn),
      answer,
      status:
        job && ["failed", "cancelled"].includes(job.status)
          ? "failed"
          : turn.status,
      sourceState: current ? "current" : "withdrawn",
      failureReason: job?.reasonCode ?? null,
      pendingReview:
        !!turn.answer?.claims.some((c) => c.kind === "inference") &&
        !["approved", "rejected"].includes(turn.reviewState),
      sources: available
        .filter((s) =>
          turn.sourceRefs.some(
            (r) => r.id === s.id && r.revision === s.revision,
          ),
        )
        .map((s) => ({
          id: s.id,
          revision: s.revision,
          title: s.title,
          at: s.at,
          role: s.role,
        })),
    });
  }
  let opening = thread.opening;
  try {
    await resolveCoachContext(db, principal, playerId, thread.context, sources);
  } catch {
    opening =
      "A beszélgetés eredeti forrása már nem érhető el. Válassz új tartalmat az AI-edző megnyitásához.";
  }
  return {
    thread: { ...redactCoachDocument(thread), opening },
    items,
    nextCursor: turns.length > 30 ? turns[29].id : null,
  };
}
export async function coachWorkerContext({
  db,
  principal,
  job,
  manifest,
  now,
}) {
  const scope = ownerScope(principal, job.playerId);
  const turn = await db
    .collection("habi_coach_turns")
    .findOne({ ...scope, id: job.turnId, status: "queued" });
  if (!turn) throw new HabiApiError("REVISION_CONFLICT");
  const thread = await db
    .collection("habi_coach_threads")
    .findOne({ ...scope, id: turn.threadId });
  if (!thread) throw new HabiApiError("NOT_FOUND");
  const snapshots = await verifyCoachSources(
    db,
    principal,
    job.playerId,
    turn.sourceRefs,
  );
  const previous = await db
    .collection("habi_coach_turns")
    .find({
      ...scope,
      threadId: turn.threadId,
      id: { $ne: turn.id },
      $or: [
        { createdAt: { $lt: turn.createdAt } },
        { createdAt: turn.createdAt, id: { $lt: turn.id } },
      ],
      status: "answered",
    })
    .sort({ createdAt: -1, id: -1 })
    .limit(4)
    .toArray();
  const dialogue = [];
  for (const old of previous.reverse()) {
    try {
      await verifyCoachSources(db, principal, job.playerId, old.sourceRefs);
    } catch {
      continue;
    }
    dialogue.push({
      question: old.question.slice(0, 150),
      answer: (
        old.answer?.claims
          .filter(
            (c) =>
              c.kind !== "inference" ||
              principal.role === "coach" ||
              old.reviewState === "approved",
          )
          .map((c) => c.text)
          .join("\n") ?? ""
      ).slice(0, 200),
    });
  }
  return {
    coachMode: true,
    viewerRole: principal.role,
    jobId: job.id,
    turnId: turn.id,
    turnRevision: turn.revision,
    question: turn.question,
    fence: job.fence,
    sourceSnapshots: snapshots.map((s, i) => ({
      ...s,
      title: s.title.slice(0, 60),
      text: s.text.slice(0, i === 0 ? 1200 : 150),
    })),
    sourceManifest: turn.sourceRefs,
    promptManifest: { ...manifest, sourceRefs: turn.sourceRefs },
    dialogue,
    opening: thread.opening.slice(0, 300),
    deadline: new Date(now.getTime() + 240000).toISOString(),
  };
}
export async function completeCoachTurn({
  tx,
  session,
  job,
  principal,
  body,
  now,
}) {
  const scope = ownerScope(principal, job.playerId);
  await verifyCoachSources(
    tx,
    principal,
    job.playerId,
    job.sourceRefs,
    session,
  );
  const turn = await tx
    .collection("habi_coach_turns")
    .findOne({ ...scope, id: job.turnId, status: "queued" }, { session });
  if (
    !turn ||
    turn.revision !== body.result.questionRevision ||
    !refEqual(turn.sourceRefs, job.sourceRefs) ||
    !refEqual(turn.sourceRefs, body.sourceManifest) ||
    !refEqual(turn.sourceRefs, body.result.manifest.sourceRefs)
  )
    throw new HabiApiError("REVISION_CONFLICT");
  const answer = body.result;
  for (const claim of answer.claims)
    if (
      !claim.evidenceRefs.length ||
      claim.evidenceRefs.some(
        (r) =>
          !turn.sourceRefs.some(
            (s) =>
              s.id === r.id && s.revision === r.revision && s.span === r.span,
          ),
      )
    )
      throw new HabiApiError("INVALID_INPUT");
  const hasInference = answer.claims.some((c) => c.kind === "inference");
  const normalized = {
    ...answer,
    status: hasInference
      ? "awaiting_review"
      : answer.claims.length
        ? "ready"
        : answer.status,
    validity: hasInference ? "review_required" : "current",
    suggestedAction: null,
  };
  const updated = {
    ...turn,
    answer: normalized,
    status: "answered",
    updatedAt: now.toISOString(),
    revision: turn.revision + 1,
  };
  delete updated._id;
  validateContractDocument("habi_coach_turns", updated);
  await tx
    .collection("habi_coach_turns")
    .replaceOne({ ...scope, id: turn.id, revision: turn.revision }, updated, {
      session,
    });
  await tx.collection("jobs").updateOne(
    { tenantId: job.tenantId, id: job.id, revision: job.revision },
    {
      $set: {
        status: "succeeded",
        resultRef: { id: turn.id, revision: updated.revision },
        workerClientId: null,
        leaseTokenHash: null,
        leaseUntil: null,
        updatedAt: now.toISOString(),
      },
      $inc: { revision: 1 },
    },
    { session },
  );
  return { id: turn.id, revision: updated.revision };
}
export async function writeCoachEvent({
  request,
  client,
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  await requireCoachPlayer(db, principal, playerId);
  const input = await inputFor(request, "CoachEventInput");
  if (input.kind === "memory" && !input.text.trim())
    throw new HabiApiError("INVALID_INPUT");
  const { profile } = await getCoachProfile({ db, principal, playerId, now });
  await verifyCoachSources(db, principal, playerId, input.sourceRefs);
  const result = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    method: request.method,
    path: new URL(request.url).pathname,
    key: keyFor(request),
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      if (
        input.kind === "correction" &&
        !profile.facts.some((f) => f.id === input.targetId)
      )
        throw new HabiApiError("NOT_FOUND");
      if (
        input.kind === "feedback" &&
        !profile.recommendations.some((r) => r.id === input.targetId)
      )
        throw new HabiApiError("NOT_FOUND");

      const target =
        input.kind === "correction"
          ? profile.facts.find((f) => f.id === input.targetId)
          : input.kind === "feedback"
            ? profile.recommendations.find((r) => r.id === input.targetId)
            : null;
      if (target && !refEqual(target.sourceRefs, input.sourceRefs))
        throw new HabiApiError("REVISION_CONFLICT");
      if (
        (input.kind === "correction" &&
          !["outdated", "incorrect"].includes(input.value)) ||
        (input.kind === "feedback" &&
          ![
            "try",
            "adapt",
            "dismiss",
            "helped",
            "not_helped",
            "not_yet",
          ].includes(input.value)) ||
        (input.kind === "memory" && input.value !== "")
      )
        throw new HabiApiError("INVALID_INPUT");

      await verifyCoachSources(
        tx,
        principal,
        playerId,
        input.sourceRefs,
        session,
      );
      const event = {
        ...common(principal, playerId, now),
        id: randomUUID(),
        ...input,
      };
      validateContractDocument("habi_coach_profile_events", event);
      await tx
        .collection("habi_coach_profile_events")
        .insertOne(event, { session });
      return { status: 201, resultRef: { id: event.id, revision: 1 } };
    },
  });
  return { id: result.resultRef.id };
}
export async function listCoachReviews({ db, principal, playerId }) {
  if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
  await requireCoachPlayer(db, principal, playerId);
  const turns = await db
    .collection("habi_coach_turns")
    .find({ tenantId: principal.tenantId, playerId, reviewState: "requested" })
    .sort({ updatedAt: -1, id: -1 })
    .limit(100)
    .toArray();
  const items = [];
  for (const turn of turns) {
    const actor = await db
      .collection("actors")
      .findOne({ id: turn.actorId, status: "active" });
    if (!actor) continue;
    const owner = {
      ...principal,
      actorId: turn.actorId,
      role: turn.role,
      playerId,
      accessRevision: actor.accessRevision,
    };
    try {
      await verifyCoachSources(db, owner, playerId, turn.sourceRefs);
    } catch {
      continue;
    }
    items.push(redactCoachDocument(turn));
  }
  return { items };
}
export async function reviewCoachTurn({
  request,
  client,
  db,
  principal,
  playerId,
  id,
  now = new Date(),
}) {
  await requireCoachPlayer(db, principal, playerId);
  const input = await inputFor(request, "CoachReviewInput");
  if (input.decision !== "request" && principal.role !== "coach")
    throw new HabiApiError("ACCESS_DENIED");
  const result = await runIdempotentCommand({
    client,
    db,
    tenantId: principal.tenantId,
    retentionPolicyId: principal.retentionPolicyId,
    actorOrClientId: principal.actorId,
    method: request.method,
    path: new URL(request.url).pathname,
    key: keyFor(request),
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      const turn = await tx
        .collection("habi_coach_turns")
        .findOne({ tenantId: principal.tenantId, playerId, id }, { session });
      if (
        !turn ||
        (input.decision === "request" &&
          (turn.actorId !== principal.actorId ||
            turn.role !== principal.role)) ||
        (input.decision !== "request" &&
          turn.reviewState !== "requested" &&
          (turn.actorId !== principal.actorId || turn.role !== "coach"))
      )
        throw new HabiApiError("NOT_FOUND");
      if (
        turn.revision !== input.expectedRevision ||
        !turn.answer ||
        !turn.answer.claims.some((c) => c.kind === "inference")
      )
        throw new HabiApiError("REVISION_CONFLICT");
      if (input.decision !== "request" && !input.rationale.trim())
        throw new HabiApiError("INVALID_INPUT");
      // Explicit review shares this turn and its exact sources, never the remaining dialogue.
      const actor = await tx
        .collection("actors")
        .findOne({ id: turn.actorId, status: "active" }, { session });
      if (!actor) throw new HabiApiError("NOT_FOUND");
      await verifyCoachSources(
        tx,
        {
          ...principal,
          actorId: turn.actorId,
          role: turn.role,
          playerId,
          accessRevision: actor.accessRevision,
        },
        playerId,
        turn.sourceRefs,
        session,
      );

      await tx.collection("habi_coach_turns").updateOne(
        { tenantId: principal.tenantId, id, revision: turn.revision },
        {
          $set: {
            reviewState:
              input.decision === "request" ? "requested" : input.decision,
            reviewRationale: input.rationale,
            reviewerActorId:
              input.decision === "request" ? null : principal.actorId,
            updatedAt: now.toISOString(),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      return { status: 200, resultRef: { id, revision: turn.revision + 1 } };
    },
  });
  return result.resultRef;
}

export async function readCoachReviewSource({
  db,
  principal,
  playerId,
  id,
  revision,
  reviewId,
}) {
  if (principal.role !== "coach") throw new HabiApiError("NOT_FOUND");
  await requireCoachPlayer(db, principal, playerId);
  const turn = await db.collection("habi_coach_turns").findOne({
    tenantId: principal.tenantId,
    playerId,
    id: reviewId,
    reviewState: { $in: ["requested", "approved", "rejected"] },
  });
  if (!turn?.sourceRefs.some((r) => r.id === id && r.revision === revision))
    throw new HabiApiError("NOT_FOUND");
  const actor = await db
    .collection("actors")
    .findOne({ id: turn.actorId, status: "active" });
  if (!actor) throw new HabiApiError("NOT_FOUND");
  const [source] = await verifyCoachSources(
    db,
    {
      ...principal,
      actorId: turn.actorId,
      role: turn.role,
      playerId,
      accessRevision: actor.accessRevision,
    },
    playerId,
    [{ id, revision, span: null }],
  );
  return source;
}
