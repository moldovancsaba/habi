import { messageUnderstanding } from "./coach-messages.mjs";

export function timelineCoachMessageKind(turn) {
  const acts = messageUnderstanding(
    turn.question,
    turn.role,
    turn.answer?.messageUnderstanding,
  ).acts;
  return acts.includes("correction")
    ? "coach.correction"
    : acts.includes("feedback") || acts.includes("preference")
      ? "coach.feedback"
      : acts.includes("update")
        ? "coach.update"
        : "coach.message";
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

/** Render only authorised source documents supplied by the bounded timeline reader. */
export function projectTimelineNodes({
  principal,
  playerId,
  records = [],
  results = [],
  messages = [],
  plans = [],
  followUps = [],
  interpretations = [],
  publications = [],
  sessions = [],
  threads = [],
  turns = [],
  coachTurns = [],
  coachEvents = [],
  coachJobs = [],
  operational = [],
  savedActivity = [],
  playerOwnsResults = false,
}) {
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
      _stream: "records",
      id: item.id,
      revision: item.revision,
      playerId,
      submittedAt: item.submittedAt,
      actorRole: item.recordedBy.role,
      sourceKind: item.source.kind,
      kind: item.supersedesId ? "record.correction" : item.kind,
      ...(typeof item.text === "string"
        ? { summary: item.text.slice(0, 4000) }
        : {}),
      resourceRef: { id: item.id, revision: item.revision },
      processId: item.sessionId ?? item.id,
      replyTo: null,
      relatedId: item.supersedesId ?? null,
    });
  }
  for (const item of results) {
    if (principal.role === "player" && !playerOwnsResults) continue;
    nodes.push({
      _stream: "checkin_results",
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
      _stream: "messages",
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
      _stream: "plans",
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
      _stream: "follow_ups",
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
      _stream: "interpretations",
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
    nodes.push({
      _stream: "habi_coach_turns",
      id: turn.id,
      revision: turn.revision,
      playerId,
      submittedAt: turn.createdAt,
      actorRole: turn.role,
      sourceKind: turn.role === "player" ? "self" : "observation",
      kind: timelineCoachMessageKind(turn),
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
        _stream: "habi_coach_turns",
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
      _stream: "habi_coach_profile_events",
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
          _stream: name,
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
          _stream: "checkin_sessions",
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
        _stream: "publications",
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
          _stream: "plans",
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
    const [, domain, verb] = event.kind.split(".");
    nodes.push({
      _stream: "events",
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
  return { nodes, processMap };
}
