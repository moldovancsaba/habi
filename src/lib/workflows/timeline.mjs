import { messageUnderstanding } from "./coach-messages.mjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";

function sign(payload, key) {
  if (typeof key !== "string" || Buffer.byteLength(key) < 32)
    throw new Error("CURSOR_KEY_INVALID");
  return createHmac("sha256", key)
    .update(`habi-timeline:${payload}`)
    .digest("base64url");
}
function encode(value, key) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}
function decode(token, key, principal, playerId, kind, from, to, now) {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra !== undefined)
    throw new HabiApiError("INVALID_INPUT");
  const a = Buffer.from(supplied),
    b = Buffer.from(sign(payload, key));
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new HabiApiError("INVALID_INPUT");
  let value;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  if (
    value.tenantId !== principal.tenantId ||
    value.playerId !== playerId ||
    value.accessRevision !== principal.accessRevision ||
    value.kind !== kind ||
    value.from !== from ||
    value.to !== to ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= now.getTime() ||
    !Number.isFinite(Date.parse(value.snapshotAt)) ||
    typeof value.at !== "string" ||
    typeof value.id !== "string"
  )
    throw new HabiApiError("CURSOR_EXPIRED");
  return value;
}

function visibleRecord(principal, record, publications) {
  if (principal.role === "coach") return true;
  if (principal.role === "player")
    return record.sharingClass === "player_direct";
  if (["player_direct", "parent_shared"].includes(record.sharingClass))
    return true;
  return publications.some(
    (p) =>
      p.status === "active" &&
      p.resourceRef.id === record.id &&
      p.resourceRef.revision === record.revision,
  );
}

export async function readTimeline({
  db,
  principal,
  playerId = principal.playerId,
  kind = /** @type {string | null} */ (null),
  from = /** @type {string | null} */ (null),
  to = /** @type {string | null} */ (null),
  cursor = /** @type {string | null} */ (null),
  limit = 20,
  cursorHmacKey,
  now = new Date(),
}) {
  if (principal.role !== "coach" && playerId !== principal.playerId)
    throw new HabiApiError("NOT_FOUND");
  if (
    !playerId ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (kind && !/^[A-Za-z0-9_.-]{1,50}$/.test(kind)) ||
    (from !== null && !Number.isFinite(Date.parse(from))) ||
    (to !== null && !Number.isFinite(Date.parse(to))) ||
    (from && to && Date.parse(from) > Date.parse(to))
  )
    throw new HabiApiError("INVALID_INPUT");
  if (from) from = new Date(from).toISOString();
  if (to) to = new Date(to).toISOString();
  const position = cursor
    ? decode(cursor, cursorHmacKey, principal, playerId, kind, from, to, now)
    : null;
  const snapshotAt = position?.snapshotAt ?? now.toISOString();
  const boundedTime = (field) => {
    const upperBound = [to, snapshotAt, position?.at].filter(Boolean).sort()[0];
    return {
      [field]: {
        $lte: upperBound,
        ...(from ? { $gte: from } : {}),
      },
    };
  };
  const [
    records,
    results,
    messages,
    plans,
    followUps,
    interpretations,
    publications,
    sessions,
    threads,
    turns,
    coachTurns,
    coachEvents,
    coachJobs,
    operational,
    savedActivity,
  ] = await Promise.all([
    db
      .collection("records")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("submittedAt"),
      })
      .sort({ submittedAt: -1 })
      .limit(200)
      .toArray(),
    db
      .collection("checkin_results")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("completedAt"),
      })
      .sort({ completedAt: -1 })
      .limit(100)
      .toArray(),
    db
      .collection("messages")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("submittedAt"),
      })
      .sort({ submittedAt: -1 })
      .limit(200)
      .toArray(),
    db
      .collection("plans")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("createdAt"),
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    db
      .collection("follow_ups")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("createdAt"),
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray(),
    db
      .collection("interpretations")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("updatedAt"),
      })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray(),
    db
      .collection("publications")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...(principal.role === "coach" ? {} : { status: "active" }),
      })
      .toArray(),
    db
      .collection("checkin_sessions")
      .find({ tenantId: principal.tenantId, playerId })
      .toArray(),
    db
      .collection("threads")
      .find({ tenantId: principal.tenantId, playerId })
      .toArray(),
    db
      .collection("turns")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...boundedTime("createdAt"),
      })
      .toArray(),
    db
      .collection("habi_coach_turns")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...(principal.role === "coach"
          ? {}
          : { actorId: principal.actorId, role: principal.role }),
        ...boundedTime("createdAt"),
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray(),
    db
      .collection("habi_coach_profile_events")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...(principal.role === "coach"
          ? {}
          : { actorId: principal.actorId, role: principal.role }),
        ...boundedTime("createdAt"),
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray(),
    db
      .collection("jobs")
      .find({
        tenantId: principal.tenantId,
        playerId,
        ...(principal.role === "coach"
          ? {}
          : {
              requesterActorId: principal.actorId,
              requesterRole: principal.role,
            }),
        kind: "coachConversation",
      })
      .toArray(),
    principal.role === "coach"
      ? Promise.all(
          [
            "reports",
            "extractions",
            "assessment_results",
            "coach_materials",
          ].map(async (name) => ({
            name,
            items: await db
              .collection(name)
              .find({
                tenantId: principal.tenantId,
                playerId,
                ...boundedTime("createdAt"),
              })
              .sort({ createdAt: -1 })
              .limit(200)
              .toArray(),
          })),
        )
      : [],
    principal.role === "coach"
      ? db
          .collection("events")
          .find({
            tenantId: principal.tenantId,
            playerId,
            ...boundedTime("submittedAt"),
          })
          .sort({ submittedAt: -1 })
          .limit(200)
          .toArray()
      : [],
  ]);
  const nodes = [];
  const processMap = new Map();
  for (const session of sessions)
    processMap.set(session.id, {
      id: session.id,
      closedAt: session.completedAt ?? null,
    });
  for (const thread of threads)
    processMap.set(thread.id, {
      id: thread.id,
      closedAt: thread.closedAt ?? null,
    });
  const turnsById = new Map(turns.map((turn) => [turn.id, turn]));
  for (const record of records)
    if (!record.sessionId)
      processMap.set(record.id, { id: record.id, closedAt: null });
  for (const item of records) {
    if (!visibleRecord(principal, item, publications)) continue;
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.submittedAt,
      actorRole: item.recordedBy.role,
      sourceKind: item.source.kind,
      kind: item.kind,
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.sessionId ?? item.id,
      replyTo: null,
      relatedId: item.supersedesId ?? null,
    });
  }
  for (const item of results) {
    if (
      principal.role === "player" &&
      principal.actorId !==
        (
          await db
            .collection("players")
            .findOne({ tenantId: principal.tenantId, id: playerId })
        )?.actorId
    )
      continue;
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.completedAt,
      actorRole: "player",
      sourceKind: "self",
      kind: "checkin.completed",
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.sessionId,
      replyTo: null,
      relatedId: null,
    });
  }
  for (const item of messages) {
    const parentCanSee = principal.role !== "parent" || !item.privateToCoach;
    if (!parentCanSee) continue;
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.submittedAt,
      actorRole: item.recordedBy.role,
      sourceKind:
        item.recordedBy.role === "player"
          ? "self"
          : item.recordedBy.role === "parent"
            ? "proxy"
            : "observation",
      kind: "thread.message",
      summary: item.text,
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.threadId,
      replyTo: item.replyTo,
      relatedId: null,
    });
  }
  for (const item of plans) {
    const closed = ["declined", "completed", "withdrawn"].includes(item.status);
    processMap.set(item.id, {
      id: item.id,
      closedAt: closed ? item.updatedAt : null,
    });
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.updatedAt ?? item.createdAt,
      actorRole: "coach",
      sourceKind: "observation",
      kind: `plan.${item.status}`,
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.id,
      replyTo: null,
      relatedId: null,
    });
  }
  for (const item of followUps) {
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.createdAt,
      actorRole: item.recordedBy.role,
      sourceKind: item.source.kind,
      kind: "plan.follow_up",
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.planRef.id,
      replyTo: null,
      relatedId: item.planRef.id,
    });
  }
  for (const item of interpretations) {
    const turn = turnsById.get(item.turnId);
    const questionMessage = turn
      ? messages.find(
          (message) =>
            message.threadId === item.threadId &&
            message.text === turn.question &&
            message.submittedAt === turn.createdAt,
        )
      : null;
    const noEvidence = item.answer?.status === "no_evidence";
    if (
      principal.role !== "coach" &&
      !(["parent", "player"].includes(principal.role) && noEvidence) &&
      !(item.answer?.status === "ready" && item.answer?.validity === "current")
    )
      continue;
    nodes.push({
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.updatedAt,
      actorRole: questionMessage?.recordedBy?.role ?? "parent",
      sourceKind: "proxy",
      kind: noEvidence ? "interpretation.no_evidence" : "interpretation.ready",
      summary: noEvidence
        ? "A Habi nem talált ellenőrizhető, forrásolt választ. Nem vont le következtetést."
        : "A kérdésre forrásolt magyarázat készült.",
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.threadId,
      replyTo: null,
      relatedId: questionMessage?.id ?? null,
    });
  }
  const coachJobsById = new Map(coachJobs.map((job) => [job.id, job]));
  const coachTurnsById = new Map(coachTurns.map((turn) => [turn.id, turn]));
  for (const turn of coachTurns) {
    const job = coachJobsById.get(turn.jobId);
    const acts = messageUnderstanding(
      turn.question,
      turn.role,
      turn.answer?.messageUnderstanding,
    ).acts;
    nodes.push({
      id: turn.id,
      revision: turn.revision,
      playerId,
      submittedAt: turn.createdAt,
      actorRole: turn.role,
      sourceKind: turn.role === "player" ? "self" : "observation",
      kind: acts.includes("correction")
        ? "coach.correction"
        : acts.includes("feedback") || acts.includes("preference")
          ? "coach.feedback"
          : acts.includes("update")
            ? "coach.update"
            : "coach.message",
      summary: turn.question.slice(0, 4000),
      resourceRef: { id: turn.id, revision: turn.revision },
      processId: turn.threadId,
      replyTo: null,
      relatedId: null,
    });
    if (
      turn.answer ||
      turn.status === "failed" ||
      ["failed", "cancelled"].includes(job?.status)
    ) {
      const failed = !turn.answer;
      const text =
        turn.answer?.reply?.text ??
        (turn.answer
          ? [
              ...turn.answer.claims.map((c) => c.text),
              ...turn.answer.unknowns,
              ...turn.answer.clarifyingQuestions,
            ].join("\n")
          : "A feldolgozás megállt. Az eredeti üzenet megmaradt; a beszélgetésben újrapróbálható.");
      nodes.push({
        id: `coach-answer-${turn.id}`,
        revision: turn.revision,
        playerId,
        submittedAt: failed
          ? (job?.updatedAt ?? turn.updatedAt)
          : (turn.completedAt ?? turn.updatedAt),
        actorRole: turn.role,
        sourceKind: "provider",
        kind: failed ? "coach.failed" : "coach.answer",
        summary: text.slice(0, 4000),
        resourceRef: { id: turn.id, revision: turn.revision },
        processId: turn.threadId,
        replyTo: turn.id,
        relatedId: turn.id,
      });
    }
  }
  for (const event of coachEvents) {
    const rawId = event.sourceRefs
      .find((r) => r.id.startsWith("coach-message-"))
      ?.id.slice("coach-message-".length);
    const turn = rawId ? coachTurnsById.get(rawId) : null;
    nodes.push({
      id: event.id,
      revision: event.revision,
      playerId,
      submittedAt: event.createdAt,
      actorRole: event.role,
      sourceKind: "observation",
      kind: `coach.${event.kind === "forget" ? "exclusion" : event.kind}`,
      summary:
        event.text ||
        (event.kind === "forget"
          ? "Az üzenet további AI-felhasználását a közlő kikapcsolta. Az eredeti előzmény megmarad."
          : event.value || "Profil-visszajelzés rögzítve."),
      resourceRef: { id: event.id, revision: event.revision },
      processId: turn?.threadId ?? event.id,
      replyTo: null,
      relatedId: turn?.id ?? null,
    });
  }
  if (principal.role === "coach") {
    const kindByCollection = {
      reports: "report",
      extractions: "extraction",
      assessment_results: "assessment_result",
      coach_materials: "coach_material",
    };
    for (const { name, items } of operational)
      for (const item of items) {
        const kind = kindByCollection[name];
        nodes.push({
          id: item.id,
          revision: item.revision,
          playerId,
          submittedAt: item.updatedAt ?? item.createdAt,
          actorRole: "coach",
          sourceKind: "observation",
          kind: `${kind}.activity`,
          summary:
            item.title ||
            (name === "reports"
              ? "Felmérési dokumentum rögzítve vagy frissítve."
              : name === "extractions"
                ? "Riportadatok rögzítve vagy ellenőrizve."
                : "Felmérés vagy edzői anyag rögzítve."),
          resourceRef: { id: item.id, revision: item.revision },
          processId: item.reportRef?.id ?? item.materialId ?? item.id,
          replyTo: null,
          relatedId: item.reportRef?.id ?? null,
        });
      }
    for (const session of sessions)
      if (session.createdAt)
        nodes.push({
          id: `checkin-start-${session.id}`,
          revision: session.revision,
          playerId,
          submittedAt: session.startedAt ?? session.createdAt,
          actorRole: "player",
          sourceKind: "self",
          kind: "checkin.started",
          summary: session.completedAt
            ? "Az állapotjelzés elkezdődött; később lezárult."
            : "Az állapotjelzés elkezdődött; még nincs lezárva.",
          resourceRef: { id: session.id, revision: session.revision },
          processId: session.id,
          replyTo: null,
          relatedId: null,
        });
    for (const publication of publications)
      nodes.push({
        id: publication.id,
        revision: publication.revision,
        playerId,
        submittedAt: publication.updatedAt ?? publication.createdAt,
        actorRole: "coach",
        sourceKind: "observation",
        kind: "publication.activity",
        summary:
          publication.status === "active"
            ? "Egy eredeti forrás pontos változata megosztva."
            : "Egy korábbi megosztás visszavonva.",
        resourceRef: publication.resourceRef,
        processId: publication.resourceRef.id,
        replyTo: null,
        relatedId: publication.resourceRef.id,
      });
    for (const plan of plans)
      for (const [index, acceptance] of (plan.acceptances ?? []).entries())
        nodes.push({
          id: `plan-decision-${plan.id}-${index}`,
          revision: acceptance.revision,
          playerId,
          submittedAt: acceptance.at,
          actorRole: acceptance.role,
          sourceKind: acceptance.role === "player" ? "self" : "observation",
          kind:
            acceptance.decision === "accept"
              ? "plan.accepted"
              : "plan.declined",
          summary:
            acceptance.decision === "accept"
              ? "A résztvevő elfogadta a közös tervet."
              : "A résztvevő elutasította a közös tervet.",
          resourceRef: { id: plan.id, revision: plan.revision },
          processId: plan.id,
          replyTo: null,
          relatedId: plan.id,
        });
  }
  const activityLabels = {
    "ai-coach": "AI-beszélgetés",
    "ai-profile": "AI-profil visszajelzése",
    "ai-reviews": "AI-válasz ellenőrzése",
    "checkin-sessions": "Állapotjelzés",
    records: "Naplóbejegyzés",
    threads: "Közös beszélgetés",
    messages: "Hozzászólás",
    plans: "Közös terv",
    "follow-ups": "Utánkövetés",
    reports: "Felmérési dokumentum",
    uploads: "Dokumentumfeltöltés",
    extractions: "Riportadatok",
    publications: "Megosztás",
    materials: "Edzői anyag",
    "monthly-reflections": "Havi visszatekintés",
    drafts: "Piszkozat",
    interpretations: "AI-magyarázat",
  };
  const actionLabels = {
    post: "mentve",
    put: "módosítva",
    patch: "módosítva",
    delete: "törölve",
    active: "aktív",
    paused: "szüneteltetve",
    completed: "lezárva",
    withdrawn: "visszavonva",
    declined: "elutasítva",
    accept: "elfogadva",
    decline: "elutasítva",
    approved: "jóváhagyva",
    rejected: "elutasítva",
    request: "ellenőrzésre küldve",
    request_changes: "javításra visszaküldve",
    complete: "befejezve",
    answers: "válasz mentve",
    state: "állapot módosítva",
    review: "ellenőrizve",
    withdraw: "visszavonva",
    reopen: "újranyitva",
    finalize: "feltöltve",
    clear: "törölve",
  };
  for (const event of savedActivity) {
    if (!event.kind.startsWith("activity.")) continue;
    if (
      nodes.some(
        (node) =>
          node.resourceRef.id === event.resourceRef.id &&
          node.revision === event.resourceRef.revision,
      )
    )
      continue;
    const [, domain, verb] = event.kind.split(".");
    nodes.push({
      id: event.id,
      revision: event.revision,
      playerId,
      submittedAt: event.submittedAt,
      actorRole: event.actorRole,
      sourceKind: event.sourceKind,
      kind: event.kind,
      summary: `${activityLabels[domain] ?? "Tevékenység"} · ${actionLabels[verb] ?? "rögzítve"}`,
      resourceRef: event.resourceRef,
      processId: event.processId,
      replyTo: event.replyTo,
      relatedId: event.relatedId,
    });
  }
  const filtered = nodes
    .filter(
      (node) =>
        node.submittedAt <= snapshotAt &&
        (!from || node.submittedAt >= from) &&
        (!to || node.submittedAt <= to) &&
        (!kind || node.kind === kind),
    )
    .sort(
      (a, b) =>
        b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id),
    );
  const afterPosition = position
    ? filtered.filter(
        (n) =>
          n.submittedAt < position.at ||
          (n.submittedAt === position.at && n.id < position.id),
      )
    : filtered;
  const page = afterPosition.slice(0, limit);
  const hasMore = afterPosition.length > limit;
  return {
    nodes: page,
    edges: page.flatMap((node) =>
      node.replyTo
        ? [{ from: node.id, to: node.replyTo, kind: "reply" }]
        : node.relatedId
          ? [{ from: node.id, to: node.relatedId, kind: "derived_from" }]
          : [],
    ),
    processes: [...new Set(page.map((node) => node.processId))].map(
      (id) => processMap.get(id) ?? { id, closedAt: null },
    ),
    continuations: [],
    nextCursor:
      hasMore && page.length
        ? encode(
            {
              tenantId: principal.tenantId,
              playerId,
              accessRevision: principal.accessRevision,
              kind,
              from,
              to,
              snapshotAt,
              at: page.at(-1).submittedAt,
              id: page.at(-1).id,
              expiresAt:
                position?.expiresAt ??
                new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
            },
            cursorHmacKey,
          )
        : null,
    snapshotAt,
    accessRevision: principal.accessRevision,
  };
}
