import { coachContextEligible } from "./coach-memory.mjs";
import { messageUnderstanding, messageSourceId } from "./coach-messages.mjs";
import { coachConversation } from "./coach-conversation.mjs";
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

import {
  guidedConversationSafetyReply,
  isGuidedConversationSafetyInput,
  isPainOrIllnessInput,
} from "./guided-conversations.mjs";
import {
  painGuidanceReply,
  isTrainingAttendanceQuestion,
  trainingGuidanceSource,
  coachQuestionGuidance,
} from "./coach-guidance.mjs";

/** How an answer was produced, from the artifact the worker recorded. "model" is the only experimental one. */
export function coachAnswerMode(artifact) {
  if (artifact === "habi-plain-checkin@1") return "plain_summary";
  if (artifact === "habi-source-summary@1") return "source_summary";
  if (artifact === "habi-guidance@1") return "guidance";
  if (typeof artifact === "string" && artifact.startsWith("habi-"))
    return "rules";
  return "model";
}

function metricFromQuestion(question) {
  const matches = [
    ["sleep", /alv|pihen/i],
    ["energy", /energi/i],
    ["focus", /figyel|koncentr/i],
    ["mood", /hangulat|feszült|lehangolt/i],
    ["load", /edzésterhel|edzés mennyis/i],
  ].filter(([, pattern]) => pattern.test(question));
  return matches.length === 1 ? matches[0][0] : null;
}
function authoredSources() {
  return [
    trainingGuidanceSource(),
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
/**
 * Resolve exact source references against what the principal may cite.
 * Collecting the sources scans every record collection of the player, which is
 * one database round trip per collection. A caller that verifies several
 * reference sets for the same principal, player and session passes the result
 * of one `collectCoachSources` call as `collected` instead of scanning again;
 * the request must not write between the collection and the verifications.
 */
export async function verifyCoachSources(
  db,
  principal,
  playerId,
  refs,
  session,
  collected,
) {
  const { sources } =
    collected ?? (await collectCoachSources(db, principal, playerId, session));
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
    if (!coachContextEligible(source)) return false;
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
  for (const preference of sources
    .filter(
      (source) =>
        source.kind === "conversation_note" &&
        /Felhasználói (feedback|preference) · author/.test(source.title),
    )
    .slice(-3)) {
    if (!relevant.some((source) => source.id === preference.id))
      relevant.push(preference);
  }
  if (isTrainingAttendanceQuestion(question))
    relevant.unshift(trainingGuidanceSource());
  const helpMetric = metricFromQuestion(question);
  if (helpMetric) {
    const help = contentSource({
      kind: "metric",
      id: helpMetric,
      metric: helpMetric,
    });
    if (help && !relevant.some((s) => s.id === help.id)) relevant.push(help);
  }
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
          .map(
            (f) =>
              `${f.at} · ${f.status === "candidate" ? "Megerősítésre váró megjegyzés: " : ""}${f.text}`,
          )
          .join("\n\n")
          .slice(0, 4000),
        at: now.toISOString(),
        role: principal.role,
      }
    : null;
  const currentMessage = {
    id: messageSourceId(turnId),
    revision: 1,
    span: null,
    kind: "conversation_message",
    title: "Mostani saját üzenet",
    text: question,
    at: now.toISOString(),
    role: principal.role,
  };
  relevant.unshift(currentMessage);
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
    actorRole: principal.role,
    activityPlayerId: principal.playerId ?? null,
    method: request.method,
    path: new URL(request.url).pathname,
    key: keyFor(request),
    body: input,
    now: () => now,
    async execute({ db: tx, session }) {
      // Nothing is written between the two checks, so one scan serves both.
      const collected = await collectCoachSources(
        tx,
        principal,
        playerId,
        session,
      );
      await verifyCoachSources(
        tx,
        principal,
        playerId,
        refs.filter(
          (r) => r.id !== profileSnapshot?.id && r.id !== currentMessage.id,
        ),
        session,
        collected,
      );
      await verifyCoachSources(
        tx,
        principal,
        playerId,
        profileSources,
        session,
        collected,
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
  const query =
    principal.role === "coach"
      ? { tenantId: principal.tenantId, playerId }
      : ownerScope(principal, playerId);
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
    items: threads.slice(0, 30).map((thread) => ({
      ...redactCoachDocument(thread),
      readOnly:
        thread.actorId !== principal.actorId || thread.role !== principal.role,
    })),
    nextCursor: threads.length > 30 ? threads[29].id : null,
  };
}
export function coachJobProgress(job, turn, now = new Date(), queuedAhead = 0) {
  const status =
    job?.status ?? (turn.status === "answered" ? "succeeded" : turn.status);
  const codes = {
    AI_RETRIEVING: "retrieving",
    AI_PROVIDER_QUEUED: "provider_wait",
    AI_GENERATING: "generating",
    AI_CHECKING: "checking",
    AI_SAVING: "saving",
    AI_REPAIRING: "repairing",
  };
  let phase =
    status === "succeeded" || turn.status === "answered"
      ? "completed"
      : status === "failed" || status === "cancelled"
        ? "failed"
        : status === "queued"
          ? Date.parse(job?.nextAttemptAt ?? "") > now.getTime()
            ? "retry_wait"
            : "queued"
          : (codes[job?.reasonCode] ?? "retrieving");
  if (
    ["leased", "running"].includes(status) &&
    Date.parse(job?.leaseUntil ?? "") < now.getTime()
  )
    phase = "reconnecting";
  if (job?.reasonCode === "AI_SERVICE_MAINTENANCE" && status === "queued")
    phase = "maintenance";
  return {
    phase,
    submittedAt: turn.createdAt,
    lastActivityAt: job?.updatedAt ?? turn.updatedAt,
    retryAt: phase === "retry_wait" ? job.nextAttemptAt : null,
    attempts: job?.attempts ?? 0,
    queuedAhead,
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
  const lookupScope =
    principal.role === "coach"
      ? { tenantId: principal.tenantId, playerId }
      : ownerScope(principal, playerId);
  const thread = await db
    .collection("habi_coach_threads")
    .findOne({ ...lookupScope, id });
  if (!thread) throw new HabiApiError("NOT_FOUND");
  const scope = ownerScope(
    { ...principal, actorId: thread.actorId, role: thread.role },
    playerId,
  );
  const readOnly =
    thread.actorId !== principal.actorId || thread.role !== principal.role;
  const { sources } = await collectCoachSources(
    db,
    principal,
    playerId,
    undefined,
    readOnly ? thread : null,
  );
  const available = [...sources, ...authoredSources()];
  // Earlier turns are checked against what the viewer may cite. For the owner
  // that is the scan above; an observing coach needs one scan of their own,
  // taken only when an earlier turn has to be checked.
  let viewerSources = readOnly ? null : { sources };
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
  const jobDocs = await db
    .collection("jobs")
    .find({
      tenantId: principal.tenantId,
      requesterActorId: thread.actorId,
      requesterRole: thread.role,
      id: { $in: turns.map((t) => t.jobId) },
    })
    .toArray();
  const jobsById = new Map(jobDocs.map((j) => [j.id, j]));
  const ownQueue = await db
    .collection("jobs")
    .find({
      tenantId: principal.tenantId,
      playerId,
      requesterActorId: thread.actorId,
      requesterRole: thread.role,
      kind: "coachConversation",
      status: { $in: ["queued", "leased", "running"] },
    })
    .project({ id: 1, createdAt: 1 })
    .toArray();
  const items = [];
  const oldest = turns.at(-1);
  const preceding = oldest
    ? await db
        .collection("habi_coach_turns")
        .find({
          ...scope,
          threadId: id,
          status: "answered",
          $or: [
            { createdAt: { $lt: oldest.createdAt } },
            { createdAt: oldest.createdAt, id: { $lt: oldest.id } },
          ],
        })
        .sort({ createdAt: -1, id: -1 })
        .limit(8)
        .toArray()
    : [];
  const conversationHistory = [];
  const prepareConversation = (turn, guidance) =>
    coachConversation({
      question: turn.question,
      answer: turn.answer,
      previous: conversationHistory,
      sources: available,
      sourceRefs: turn.sourceRefs,
      questions: guidance?.questions ?? turn.answer?.clarifyingQuestions ?? [],
    });
  for (const old of [...preceding.reverse(), ...turns.slice(30).reverse()]) {
    try {
      viewerSources ??= await collectCoachSources(db, principal, playerId);
      await verifyCoachSources(
        db,
        principal,
        playerId,
        old.sourceRefs,
        undefined,
        viewerSources,
      );
    } catch {
      continue;
    }
    if (old.status !== "answered") continue;
    const guidance = coachQuestionGuidance({
      question: old.question,
      role: principal.role,
      sources: available,
    });
    conversationHistory.push({
      ...old,
      conversation: prepareConversation(old, guidance),
    });
  }
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
    const job = jobsById.get(turn.jobId);
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
    const guidance =
      current && !turn.answer?.reply && !readOnly
        ? coachQuestionGuidance({
            question: turn.question,
            role: principal.role,
            sources: available,
          })
        : null;
    const conversation =
      current && !turn.answer?.reply && !readOnly
        ? prepareConversation(turn, guidance)
        : null;
    if (current && turn.status === "answered")
      conversationHistory.push({ ...turn, conversation });
    items.push({
      ...redactCoachDocument(turn),
      conversation,
      answer,
      status:
        job && ["failed", "cancelled"].includes(job.status)
          ? "failed"
          : turn.status,
      sourceState: current ? "current" : "withdrawn",
      failureReason: job?.reasonCode ?? null,
      guidance: conversation?.hasNewUserContext ? null : guidance,
      progress: coachJobProgress(
        job,
        turn,
        new Date(),
        ownQueue.filter(
          (j) => j.id !== turn.jobId && j.createdAt < turn.createdAt,
        ).length,
      ),
      answerMode: coachAnswerMode(turn.answer?.manifest.modelArtifact),
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
    readOnly,
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
  const historyEvents = await db
    .collection("habi_coach_profile_events")
    .find(scope)
    .toArray();
  const ignored = new Set(
    historyEvents.filter((e) => e.kind === "forget").map((e) => e.targetId),
  );
  const excludedRef = (id) =>
    ignored.has(id) ||
    (id.startsWith("coach-note-") &&
      ignored.has(
        messageSourceId(id.slice("coach-note-".length, id.lastIndexOf("-"))),
      )) ||
    (id.startsWith("coach-question-") &&
      ignored.has(messageSourceId(id.slice("coach-question-".length))));
  if (
    turn.sourceRefs.some((r) => excludedRef(r.id)) ||
    turn.profileSources.some((r) => excludedRef(r.id))
  )
    throw new HabiApiError("NOT_FOUND");
  // One scan serves the turn and every earlier turn: the build time of this
  // context must not grow with the length of the thread.
  const collected = await collectCoachSources(db, principal, job.playerId);
  const snapshots = await verifyCoachSources(
    db,
    principal,
    job.playerId,
    turn.sourceRefs,
    undefined,
    collected,
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
    })
    .sort({ createdAt: -1, id: -1 })
    .limit(8)
    .toArray();
  const dialogue = [];
  const verifiedPrevious = [];
  for (const old of previous.reverse()) {
    if (excludedRef(messageSourceId(old.id))) continue;
    const answerAllowed = ![...old.sourceRefs, ...old.profileSources].some(
      (r) => excludedRef(r.id),
    );
    try {
      await verifyCoachSources(
        db,
        principal,
        job.playerId,
        [{ id: messageSourceId(old.id), revision: 1, span: null }],
        undefined,
        collected,
      );
    } catch {
      continue;
    }
    const oldGuidance = coachQuestionGuidance({
      question: old.question,
      role: principal.role,
      sources: snapshots,
      now,
    });
    const conversation = coachConversation({
      question: old.question,
      answer: old.answer,
      previous: verifiedPrevious,
      sources: snapshots,
      sourceRefs: old.sourceRefs,
      questions:
        oldGuidance?.questions ?? old.answer?.clarifyingQuestions ?? [],
    });
    verifiedPrevious.push({ ...old, conversation });
    const claims =
      old.answer?.claims.filter(
        (c) =>
          c.kind !== "inference" ||
          principal.role === "coach" ||
          old.reviewState === "approved",
      ) ?? [];
    dialogue.push({
      question: old.question,
      answer: (!answerAllowed
        ? ""
        : (old.answer?.reply?.text ??
          (conversation?.suppressRepeatedAnswer
            ? conversation.lead
            : claims.map((c) => c.text).join("\n")))
      ).slice(0, 1400),
      questions: conversation?.questions.length
        ? conversation.questions
        : (oldGuidance?.questions ?? old.answer?.clarifyingQuestions ?? []),
    });
  }
  const focusMetric =
    metricFromQuestion(turn.question) ??
    (turn.context.metric !== "all" ? turn.context.metric : null);
  const focusLabel = focusMetric
    ? contentSource({ kind: "metric", id: focusMetric, metric: focusMetric })
        ?.title
    : null;
  const guidance = turn.sourceRefs.some(
    (r) => r.id === trainingGuidanceSource().id,
  )
    ? coachQuestionGuidance({
        question: turn.question,
        role: principal.role,
        sources: snapshots,
        now,
      })
    : null;
  const conversation = coachConversation({
    question: turn.question,
    previous: verifiedPrevious,
    sources: snapshots,
    sourceRefs: turn.sourceRefs,
    questions: guidance?.questions ?? [],
  });
  const allMessages = await db
    .collection("habi_coach_turns")
    .find({
      ...scope,
      id: { $ne: turn.id },
      createdAt: { $lte: turn.createdAt },
    })
    .sort({ createdAt: -1, id: -1 })
    .limit(30)
    .toArray();
  const messageHistory = allMessages
    .filter((t) => !ignored.has(messageSourceId(t.id)))
    .slice(0, 12)
    .reverse()
    .map((t) => ({
      id: t.id,
      text: t.question,
      at: t.createdAt,
      acts: messageUnderstanding(
        t.question,
        t.role,
        t.answer?.messageUnderstanding,
      ).acts,
    }));
  const player = await db
    .collection("players")
    .findOne({ tenantId: principal.tenantId, id: job.playerId });
  return {
    playerName: (player?.displayName ?? "A játékos").slice(0, 200),
    dialogueVersion: 2,
    messageUnderstanding: messageUnderstanding(turn.question, principal.role),
    messageHistory,
    ...(conversation ? { conversation } : {}),
    ...(guidance ? { guidance } : {}),
    // The authored safety and pain copy speaks to the player, so only a player's own message gets it.
    ...(principal.role === "player" &&
    isGuidedConversationSafetyInput(turn.question)
      ? { safety: guidedConversationSafetyReply() }
      : principal.role === "player" && isPainOrIllnessInput(turn.question)
        ? { pain: painGuidanceReply() }
        : {}),
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
      text: (s.kind === "checkin_results" && focusLabel
        ? s.text
            .split("\n")
            .filter((line) => line.startsWith(focusLabel))
            .join("\n") || "Ehhez a kérdéshez nincs rögzített válasz."
        : s.text
      ).slice(
        0,
        i === 0
          ? 1200
          : s.kind === "checkin_results" || s.id.startsWith("habi-metric-")
            ? 700
            : 150,
      ),
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
  const authorisedSources = await verifyCoachSources(
    tx,
    principal,
    job.playerId,
    job.sourceRefs,
    session,
  );
  if (authorisedSources.some((source) => source.kind.startsWith("ignored_")))
    throw new HabiApiError("REVISION_CONFLICT");
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
  if (answer.reply || answer.messageUnderstanding)
    answer.messageUnderstanding = messageUnderstanding(
      turn.question,
      principal.role,
      answer.messageUnderstanding,
    );
  if (
    answer.reply?.sourceRefs.some(
      (ref) =>
        !turn.sourceRefs.some(
          (r) =>
            r.id === ref.id &&
            r.revision === ref.revision &&
            r.span === ref.span,
        ),
    )
  )
    throw new HabiApiError("INVALID_INPUT");
  for (const note of answer.messageUnderstanding?.notes ?? []) {
    if (note.kind === "correction" && !note.corrects.length) {
      const words = note.quote
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .split(/[^\p{L}]+/u)
        .filter((w) => w.length >= 5)
        .map((w) => w.slice(0, 5));
      const matches = authorisedSources.filter(
        (source) =>
          source.kind === "conversation_note" &&
          words.some((w) =>
            source.text
              .normalize("NFD")
              .replace(/\p{M}/gu, "")
              .toLowerCase()
              .includes(w),
          ),
      );
      if (matches.length === 1)
        note.corrects = [
          { id: matches[0].id, revision: matches[0].revision, span: null },
        ];
    }
    const allowed = note.corrects.filter(
      (r) =>
        r.id.startsWith("coach-note-") &&
        turn.sourceRefs.some(
          (old) => old.id === r.id && old.revision === r.revision,
        ),
    );
    note.corrects = allowed;
    if (note.kind !== "correction") continue;
    for (const ref of allowed) {
      const event = {
        ...common(principal, job.playerId, now),
        id: randomUUID(),
        kind: "correction",
        targetId: `fact-${ref.id}`,
        text: note.quote,
        value: "incorrect",
        sourceRefs: [ref],
      };
      validateContractDocument("habi_coach_profile_events", event);
      await tx
        .collection("habi_coach_profile_events")
        .insertOne(event, { session });
    }
  }
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
    actorRole: principal.role,
    activityPlayerId: principal.playerId ?? null,
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

      if (
        input.kind === "forget" &&
        (!input.targetId.startsWith("coach-message-") ||
          input.sourceRefs.length !== 1 ||
          input.sourceRefs[0].id !== input.targetId ||
          input.value !== "")
      )
        throw new HabiApiError("INVALID_INPUT");
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
  const scans = new Map();
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
      // The queue can hold up to 100 turns of a few owners: scan once per owner.
      const key = `${owner.actorId}\u0000${owner.role}\u0000${owner.accessRevision}`;
      if (!scans.has(key))
        scans.set(key, collectCoachSources(db, owner, playerId));
      await verifyCoachSources(
        db,
        owner,
        playerId,
        turn.sourceRefs,
        undefined,
        await scans.get(key),
      );
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
    actorRole: principal.role,
    activityPlayerId: principal.playerId ?? null,
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

export async function readObservedCoachSource({
  db,
  principal,
  playerId,
  threadId,
  id,
  revision,
}) {
  if (principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
  await requireCoachPlayer(db, principal, playerId);
  const thread = await db
    .collection("habi_coach_threads")
    .findOne({ tenantId: principal.tenantId, playerId, id: threadId });
  if (!thread) throw new HabiApiError("NOT_FOUND");
  const turn = await db.collection("habi_coach_turns").findOne({
    tenantId: principal.tenantId,
    playerId,
    threadId,
    sourceRefs: { $elemMatch: { id, revision } },
  });
  if (!turn) throw new HabiApiError("NOT_FOUND");
  const { sources } = await collectCoachSources(
    db,
    principal,
    playerId,
    undefined,
    thread,
  );
  const source =
    sources.find((s) => s.id === id && s.revision === revision) ??
    (turn.profileSnapshot?.id === id ? turn.profileSnapshot : null);
  if (!source) throw new HabiApiError("NOT_FOUND");
  return source;
}
