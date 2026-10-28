import {
  messageUnderstanding,
  messageSourceId,
  reportedDay,
} from "./coach-messages.mjs";
import { createHash } from "node:crypto";
import { HabiApiError } from "../api/error-response.mjs";
import practices from "../content/practices-v2.json" with { type: "json" };
import journeys from "../content/journeys-v1.json" with { type: "json" };
import assessments from "../content/coach-assessments-v1.json" with {
  type: "json",
};
import { ownGoalLineageStatus, ownGoalText } from "./goal-lineage.mjs";
import { checkinMetrics } from "./checkin-chart.mjs";
import { validateContractDocument } from "../database/contract-validation.mjs";

export const coachPages = {
  overview: [
    "Áttekintés",
    "Az áttekintés a kiválasztott játékos mentett eseményeit és folytatható feladatait mutatja. A hiányzó adat nem rossz eredmény.",
  ],
  journal: [
    "Napló",
    "A napló dátummal és forrással őrzi a bejegyzéseket. A saját beszámoló, a másnak tulajdonított beszámoló és a külső megfigyelés különbözik.",
  ],
  checkin: [
    "Állapotjelzések",
    "Az öt kérdés a játékos saját energia-, alvás-, figyelem-, hangulat- és edzésterhelés-beszámolója. Válaszkategóriák, nem diagnózisok vagy teljesítménypontszámok. Kihagyás és részleges lezárás is lehetséges.",
  ],
  conversations: [
    "Beszélgetések",
    "Itt a család és az edző közös helyzeteit beszélhetitek meg. Az AI-edző beszélgetése külön, a kérdező saját szerepköréhez kötött beszélgetés.",
  ],
  timeline: [
    "Előzmények",
    "A metró-idővonal a mentett események sorrendjét és kapcsolatait mutatja, a szereplők színével és forrásjelöléssel. A vonalak nem minősítik a játékost.",
  ],
  reports: [
    "Anyagok és közös tervek",
    "A megosztott anyagok pontos verzióját olvashatod. A közös tervben a következő lépés, felelős, határidő, indok és leállási feltétel szerepel; az elfogadás külön döntés.",
  ],
  "tasks-feedback": [
    "Feladatok és visszajelzések",
    "A választott saját kis lépést és az elfogadott terv utánkövetését itt lehet megtekinteni. A kipróbálás eredménye visszajelzés, nem osztályzat.",
  ],
  "player-tools": [
    "Gyakorlatok és saját célok",
    "A saját cél, rutin, szerzői gyakorlat és visszatekintés a játékos által választott kis lépéseket támogatja. A játékos dönthet a kipróbálásról, módosításról és félretételről.",
  ],
  assessments: [
    "Felmérések",
    "A felmérés eredeti kérdéseit, válaszait, dátumát, körülményeit és riportértékeit őrizzük. Egy kérdőív vagy teszt önmagában nem állapít meg diagnózist, személyiséget vagy játékosposztot.",
  ],
  knowledge: [
    "Tudástár",
    "A tudástár általános, ellenőrzött helyzeteket és gyakorlatokat tartalmaz. Alkalmazhatóságukat az adott helyzetben kell ellenőrizni.",
  ],
};
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const ownerScope = (principal, playerId) => ({
  tenantId: principal.tenantId,
  playerId,
  actorId: principal.actorId,
  role: principal.role,
});
export const sourceRef = (source) => ({
  id: source.id,
  revision: source.revision,
  span: null,
});
export async function requireCoachPlayer(db, principal, playerId, session) {
  if (
    !["player", "parent", "coach"].includes(principal.role) ||
    (principal.role !== "coach" && principal.playerId !== playerId)
  )
    throw new HabiApiError("NOT_FOUND");
  const options = session ? { session } : undefined;
  const actor = await db.collection("actors").findOne(
    {
      id: principal.actorId,
      status: "active",
      accessRevision: principal.accessRevision,
    },
    options,
  );
  const membership = await db.collection("memberships").findOne(
    {
      tenantId: principal.tenantId,
      actorId: principal.actorId,
      role: principal.role,
      playerId: principal.role === "coach" ? null : playerId,
      status: "active",
    },
    options,
  );
  if (!actor || !membership) throw new HabiApiError("NOT_FOUND");
  if (
    !(await db
      .collection("players")
      .findOne(
        { tenantId: principal.tenantId, id: playerId },
        session ? { session } : undefined,
      ))
  )
    throw new HabiApiError("NOT_FOUND");
}
export function contentSource(context) {
  let item, id;
  if (context.kind === "practice") {
    item = practices.items.find((p) => p.id === context.id);
    if (item) item = [item.title, `${item.what}\n${item.how}`];
    id = `habi-practice-${context.id}`;
  } else if (context.kind === "topic") {
    const topic = journeys.topics[context.id];
    if (topic)
      item = [
        topic.title,
        [topic.text, topic.sport, topic.everyday, topic.neutral].join("\n"),
      ];
    id = `habi-topic-${context.id}`;
  } else if (context.kind === "assessment") {
    const topic = assessments.topics.find((t) => t.id === context.id);
    if (topic)
      item = [
        topic.title,
        [topic.definition, topic.interview, topic.alternative, topic.boundary]
          .filter(Boolean)
          .join("\n"),
      ];
    id = `habi-assessment-${context.id}`;
  } else if (context.kind === "metric" || context.kind === "chart") {
    const metric = checkinMetrics.find(
      ([key]) => key === (context.metric ?? context.id),
    );
    item = metric
      ? [
          metric[1],
          {
            sleep:
              "Ez a játékos saját visszajelzése az alvásáról. A „Keveset” azt jelzi, hogy saját megítélése szerint kevés volt az alvása. Ez nem ad meg óraszámot vagy okot, és önmagában nem értékeli az edzésteljesítményt.",
            energy:
              "Ez a játékos saját megítélése az aktuális energiájáról. Az energia és az alvás külön válasz; nem következtetünk az egyikből a másikra.",
            focus:
              "Ez a játékos saját visszajelzése arról, mennyire tud most figyelni. A „Nehezen” aktuális tapasztalatot ír le, nem tartós képességet vagy diagnózist.",
            mood: "Ez a játékos saját beszámolója az aktuális hangulatáról. Nem jelent állandó személyiségjellemzőt vagy diagnózist.",
            load: "Ez a játékos saját beszámolója az edzés mennyiségéről. Nem személyre szabott edzéselőírás vagy teljesítményminősítés.",
          }[metric[0]] +
            ` A játékos eredeti válaszlehetőségei: ${metric[2].join("; ")}. A grafikon az időrendben rögzített válaszkategóriákat mutatja. Az üres nap és a kihagyott válasz nem kitöltött adat. Külön alkalmak válaszait nem keverjük össze.`,
        ]
      : [
          "Állapotjelzések grafikonja",
          coachPages.checkin[1] +
            " A különböző színű vonalak az öt területet jelzik. Az eloszlás a rögzített válaszok darabszámát mutatja. A napra kattintva az eredeti válaszok olvashatók.",
        ];
    id = `habi-metric-${metric?.[0] ?? "all"}`;
  } else if (context.kind === "page") {
    item = coachPages[context.page];
    id = `habi-page-${context.page}`;
  }
  if (!item) return null;
  return {
    id,
    revision: id.startsWith("habi-metric-") ? 2 : 1,
    span: null,
    kind: "authored_content",
    title: item[0],
    text: item[1],
    at: "",
    role: "Habi",
  };
}
const collections = [
  "messages",
  "records",
  "checkin_results",
  "assessment_results",
  "monthly_reflections",
  "plans",
  "follow_ups",
  "reports",
  "extractions",
  "interpretations",
  "coach_materials",
];
const permitted = (principal, collection, doc, publications) => {
  if (
    collection === "messages" &&
    principal.role === "parent" &&
    doc.privateToCoach
  )
    return false;
  if (collection === "interpretations")
    return (
      ["ready", "no_evidence", "needs_clarification"].includes(
        doc.answer?.status,
      ) && doc.answer?.validity === "current"
    );
  if (collection === "extractions" && doc.status !== "verified") return false;
  if (collection === "reports" && doc.status !== "ready") return false;
  if (principal.role === "coach") return true;
  if (collection === "records")
    return (
      ["player_direct", "parent_shared"].includes(doc.sharingClass) ||
      publications.some(
        (p) =>
          p.resourceRef.id === doc.id &&
          p.resourceRef.revision === doc.revision,
      )
    );
  if (collection === "coach_materials")
    return publications.some(
      (p) =>
        p.resourceRef.id === doc.id && p.resourceRef.revision === doc.revision,
    );
  return true;
};
function readableText(collection, doc) {
  if (collection === "checkin_results")
    return doc.answerCodes
      .map((a) => {
        const m = checkinMetrics.find(([key]) => key === a.metric);
        return m ? `${m[1]} ${m[2][a.code] ?? "Kihagyva"}` : "";
      })
      .join("\n");
  if (doc.text) return doc.text;
  if (collection === "plans")
    return doc.actions
      .map(
        (a) =>
          `${a.what}\nIndok: ${a.why}\nHatáridő: ${a.dueAt}\nLeállás: ${a.stopCondition}`,
      )
      .join("\n");
  if (collection === "interpretations")
    return [
      ...doc.answer.claims.map((c) => c.text),
      ...doc.answer.unknowns,
      ...doc.answer.clarifyingQuestions,
    ].join("\n");
  // Only named, user-facing fields leave the database boundary.
  return JSON.stringify(
    Object.fromEntries(
      [
        "title",
        "name",
        "answers",
        "fields",
        "summary",
        "outcome",
        "definitionVersion",
        "period",
        "completedAt",
      ]
        .filter((k) => doc[k] !== undefined)
        .map((k) => [k, doc[k]]),
    ),
  );
}
export const coachContextEligible = (source) =>
  !source.kind.startsWith("retired_") && !source.kind.startsWith("ignored_");
export async function collectCoachSources(db, principal, playerId, session) {
  await requireCoachPlayer(db, principal, playerId, session);
  const options = session ? { session } : undefined;
  const publications = await db
    .collection("publications")
    .find({ tenantId: principal.tenantId, playerId, status: "active" }, options)
    .toArray();
  const sources = [];
  for (const collection of collections) {
    for await (const doc of db
      .collection(collection)
      .find({ tenantId: principal.tenantId, playerId }, options)) {
      if (!permitted(principal, collection, doc, publications)) continue;
      const text = readableText(collection, doc).slice(0, 4000);
      if (!text || text === "{}") continue;
      sources.push({
        id: doc.id,
        revision: doc.revision,
        span: null,
        kind: collection,
        eventKind:
          collection === "records"
            ? doc.kind
            : collection === "checkin_results"
              ? "checkin.completed"
              : collection === "messages"
                ? "thread.message"
                : collection === "plans"
                  ? `plan.${doc.status}`
                  : collection === "follow_ups"
                    ? "plan.follow_up"
                    : collection === "interpretations"
                      ? `interpretation.${doc.answer.status}`
                      : collection,
        title: (doc.title ?? text.split("\n")[0]).slice(0, 200),
        text,
        at:
          doc.occurredAt ??
          doc.completedAt ??
          doc.submittedAt ??
          doc.updatedAt ??
          doc.createdAt,
        role:
          doc.recordedBy?.role ??
          ([
            "coach_materials",
            "reports",
            "extractions",
            "plans",
            "assessment_results",
          ].includes(collection)
            ? "coach"
            : collection === "interpretations"
              ? "Habi"
              : "player"),
      });
    }
  }
  const events = await db
    .collection("habi_coach_profile_events")
    .find(ownerScope(principal, playerId), options)
    .sort({ createdAt: 1, id: 1 })
    .toArray();
  const ignored = new Set(
    events.filter((e) => e.kind === "forget").map((e) => e.targetId),
  );
  const corrected = new Set(
    events
      .filter((e) => e.kind === "correction")
      .flatMap((e) => e.sourceRefs.map((r) => r.id)),
  );
  for await (const turn of db
    .collection("habi_coach_turns")
    .find(ownerScope(principal, playerId), options)) {
    const rawId = messageSourceId(turn.id);
    sources.push({
      id: rawId,
      revision: 1,
      span: null,
      kind: ignored.has(rawId)
        ? "ignored_conversation_message"
        : "conversation_message",
      title: ignored.has(rawId)
        ? "Kizárt üzenet · csak az előzményekben"
        : "Saját beszélgetési üzenet · nem ellenőrzött állítás",
      text: turn.question,
      at: turn.createdAt,
      role: principal.role,
    });
    // Keep old source identities readable, without promoting them to new facts.
    if (
      /szeretem|szeretnék|nekem|az a célom|azt vettem észre|bevált/i.test(
        turn.question,
      )
    )
      sources.push({
        id: `coach-question-${turn.id}`,
        revision: 1,
        span: null,
        kind: ignored.has(rawId)
          ? "ignored_conversation_message"
          : "conversation_message",
        title: "Korábbi saját üzenet",
        text: turn.question,
        at: turn.createdAt,
        role: principal.role,
      });
    if (turn.status === "queued") continue;
    const understanding = messageUnderstanding(
      turn.question,
      turn.role,
      turn.answer?.messageUnderstanding,
    );
    understanding.notes.forEach((note, index) => {
      const id = `coach-note-${turn.id}-${index}`;
      const day = reportedDay(turn.createdAt, note.timeText);
      sources.push({
        id,
        revision: 1,
        span: null,
        kind:
          ignored.has(rawId) || ignored.has(id)
            ? "ignored_conversation_note"
            : corrected.has(id)
              ? "retired_conversation_note"
              : note.kind === "hypothesis"
                ? "conversation_hypothesis"
                : "conversation_note",
        title: `${corrected.has(id) ? "Korábbi, pontosított közlés · " : ""}Felhasználói ${note.kind} · ${understanding.subject} · ${day ?? "eseményidő nincs megadva"}`,
        text: note.quote,
        at: turn.createdAt,
        role: principal.role,
      });
    });
  }
  for (const e of events)
    if (e.kind === "memory" || (e.kind === "correction" && e.text.trim()))
      sources.push({
        id: e.id,
        revision: e.revision,
        span: null,
        kind: "personal_memory",
        title: e.kind === "memory" ? "Saját kiegészítés" : "Saját pontosítás",
        text:
          e.kind === "correction"
            ? `Saját pontosítás (${e.targetId}): ${e.text}`
            : e.text,
        at: e.createdAt,
        role: principal.role,
      });
  return {
    sources: sources.sort(
      (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
    ),
    events,
  };
}
export async function resolveCoachContext(
  _db,
  _principal,
  _playerId,
  context,
  sources,
) {
  const content = contentSource(context);
  if (content) {
    if (context.revision !== 1) throw new HabiApiError("REVISION_CONFLICT");
    return content;
  }
  const collection = {
    record: "records",
    message: "messages",
    checkin_result: "checkin_results",
    plan: "plans",
    coach_material: "coach_materials",
    monthly_reflection: "monthly_reflections",
    assessment_result: "assessment_results",
    report: "reports",
    extraction: "extractions",
    interpretation: "interpretations",
  }[context.kind];
  const found = sources.find(
    (s) =>
      s.id === context.id &&
      s.revision === context.revision &&
      (s.kind === collection ||
        (context.kind === "record" && s.kind === "follow_ups")),
  );
  if (!found) throw new HabiApiError("NOT_FOUND");
  return found;
}
export function selectRelevantSources(sources, question, anchor, limit = 18) {
  const words = [
    ...new Set(
      question
        .toLocaleLowerCase("hu-HU")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 2),
    ),
  ];
  const recentFacts = [
    ...sources
      .filter((s) => ["conversation_note", "personal_memory"].includes(s.kind))
      .slice(-5),
    ...sources.filter((s) => s.kind === "checkin_results").slice(-1),
    ...sources
      .filter((s) =>
        [
          "records",
          "assessment_results",
          "monthly_reflections",
          "extractions",
        ].includes(s.kind),
      )
      .slice(-2),
  ];
  const latest = sources.slice(-5),
    oldRelevant = sources
      .map((s) => ({
        s,
        score: words.reduce(
          (n, w) => n + (s.text.toLocaleLowerCase("hu-HU").includes(w) ? 1 : 0),
          0,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.s.at.localeCompare(a.s.at))
      .slice(0, limit);
  return [
    ...new Map(
      [anchor, ...recentFacts, ...oldRelevant.map((x) => x.s), ...latest]
        .filter(Boolean)
        .map((s) => [s.id, s]),
    ).values(),
  ].slice(0, limit);
}
export function buildCoachProfile(sources, events, now = new Date()) {
  const corrections = new Map(
    events.filter((e) => e.kind === "correction").map((e) => [e.targetId, e]),
  );
  const correctedSources = new Set(
    events
      .filter(
        (e) => e.kind === "correction" && /^(fact|recent)-/.test(e.targetId),
      )
      .flatMap((e) => e.sourceRefs ?? [])
      .map((r) => r.id),
  );
  const confirmedCandidates = new Set(
    events.filter((e) => e.kind === "memory").map((e) => e.targetId),
  );
  const facts = [];
  const add = (
    id,
    category,
    text,
    refs,
    at,
    status = "recorded",
    counterEvidence = [],
  ) => {
    if (
      !corrections.has(id) &&
      !(category !== "pattern" && refs.some((r) => correctedSources.has(r.id)))
    )
      facts.push({
        id,
        category,
        text,
        sourceRefs: refs.slice(-20),
        at,
        status,
        counterEvidence: counterEvidence.slice(-20),
      });
  };
  for (const s of sources) {
    if (s.kind === "conversation_note" && s.title?.startsWith("Felhasználói"))
      add(`fact-${s.id}`, "known", s.text, [sourceRef(s)], s.at);
    else if (
      s.kind === "conversation_note" &&
      !confirmedCandidates.has(`fact-${s.id}`)
    )
      add(`fact-${s.id}`, "known", s.text, [sourceRef(s)], s.at, "candidate");
    else if (s.kind === "personal_memory")
      add(`fact-${s.id}`, "known", s.text, [sourceRef(s)], s.at, "corrected");
    else if (
      s.text.startsWith("Saját cél:") ||
      s.text.startsWith("Saját rutin:") ||
      s.text.startsWith("Edzői felmérés")
    )
      add(`fact-${s.id}`, "known", s.text.slice(0, 1800), [sourceRef(s)], s.at);
    else if (
      /Gyakorlat:/.test(s.text) &&
      /Segített|segített|hasznos|Hasznos/.test(s.text) &&
      !/nem segített|Nem segített|Nem volt hasznos/.test(s.text)
    )
      add(
        `fact-${s.id}`,
        "helped",
        s.text.slice(0, 1800),
        [sourceRef(s)],
        s.at,
      );
  }
  for (const s of sources
    .filter(
      (s) =>
        !["conversation_message", "conversation_hypothesis"].includes(s.kind),
    )
    .slice(-8))
    add(
      `recent-${s.id}`,
      "recent",
      s.text.slice(0, 1500),
      [sourceRef(s)],
      s.at,
    );
  const recommendationCandidates = [];
  for (const [key, label, options] of checkinMetrics) {
    const values = sources
      .filter((s) => s.kind === "checkin_results")
      .map((s) => ({
        s,
        line: s.text.split("\n").find((l) => l.startsWith(label)),
      }))
      .filter((x) => x.line);
    for (const days of [7, 28, 90]) {
      const window = values.filter(
        (x) => Date.parse(x.s.at) >= now.getTime() - days * 86400000,
      );
      if (window.length < 2) continue;
      const counts = options
        .map((answer) => ({
          answer,
          items: window.filter((x) => x.line === `${label} ${answer}`),
        }))
        .filter((x) => x.items.length);
      for (const c of counts)
        add(
          `pattern-${key}-${days}-${options.indexOf(c.answer)}`,
          "pattern",
          `${label} Az elmúlt ${days} nap ${window.length} rögzített válaszából ${c.items.length} alkalommal: „${c.answer}”. Ez a mentett alkalmak leírása; nem jelent tartós tulajdonságot vagy okot.`,
          c.items.map((x) => sourceRef(x.s)),
          c.items.at(-1).s.at,
          "recorded",
          window.filter((x) => !c.items.includes(x)).map((x) => sourceRef(x.s)),
        );
    }
    const recent = values.filter(
      (x) => Date.parse(x.s.at) >= now.getTime() - 28 * 86400000,
    );
    const relevant = recent.filter((x) =>
      options.slice(2).some((o) => x.line === `${label} ${o}`),
    );
    if (relevant.length && key !== "load")
      recommendationCandidates.push({
        key,
        practiceId: {
          energy: "sleep",
          sleep: "sleep",
          focus: "focus",
          mood: "pause",
        }[key],
        refs: relevant.map((x) => sourceRef(x.s)),
        why: `Az elmúlt 28 napban ${relevant.length} mentett alkalommal a játékos saját válasza: ${[...new Set(relevant.map((x) => x.line))].join("; ")}.`,
        priority: relevant.length,
      });
  }
  const goalRecords = sources
    .filter((s) => s.kind === "records")
    .map((s) => ({ ...s, kind: "diary", occurredAt: s.at }));
  const goals = goalRecords.filter(
    (s) =>
      s.text.startsWith("Saját cél:") || s.text.startsWith("Saját célcsere · "),
  );
  for (const goal of goals) {
    if (
      ownGoalLineageStatus(goal, goals, goalRecords) !== "active" ||
      correctedSources.has(goal.id)
    )
      continue;
    const text = ownGoalText(goal);
    const practiceId = /alv|pihen|este/i.test(text)
      ? "sleep"
      : /hiba|újra/i.test(text)
        ? "restart"
        : /beszél|segítség|elmond/i.test(text)
          ? "communication"
          : /figyel|koncentr|tanul/i.test(text)
            ? "focus"
            : null;
    if (practiceId)
      recommendationCandidates.push({
        key: `goal-${goal.id}`,
        practiceId,
        refs: [sourceRef(goal)],
        why: `Ehhez a saját, aktív célhoz kapcsolódó szerzői gyakorlat: „${text.slice(0, 500)}”.`,
        priority: 4,
      });
  }
  for (const e of events.filter(
    (e) => e.kind === "feedback" && e.value === "helped",
  )) {
    const refs = e.sourceRefs.filter((r) =>
      sources.some((s) => s.id === r.id && s.revision === r.revision),
    );
    add(
      `feedback-${e.id}`,
      "helped",
      `Saját visszajelzés: segített. ${e.text}`,
      refs,
      e.createdAt,
    );
  }
  if (!sources.length)
    add(
      "question-first",
      "question",
      "Mivel szeretnél most foglalkozni? Még nincs hozzá mentett beszámoló.",
      [],
      now.toISOString(),
    );
  const recommendations = [];
  for (const candidate of recommendationCandidates.sort(
    (a, b) => b.priority - a.priority,
  )) {
    const practice =
      practices.items.find((p) => p.id === candidate.practiceId) ??
      practices.items.find((p) => p.id === "focus");
    const id = `recommend-${candidate.key}-${practice.id}`;
    if (recommendations.some((r) => r.practiceId === practice.id)) continue;
    const feedback = events
      .filter((e) => e.kind === "feedback" && e.targetId === id)
      .at(-1);
    const latestPracticeFeedback = sources
      .filter(
        (source) =>
          source.kind === "conversation_note" &&
          source.title.includes("feedback") &&
          source.text
            .toLocaleLowerCase("hu-HU")
            .includes(practice.title.toLocaleLowerCase("hu-HU")),
      )
      .at(-1);
    if (
      latestPracticeFeedback &&
      /nem segített|nem vált be/i.test(latestPracticeFeedback.text) &&
      (!feedback || latestPracticeFeedback.at >= feedback.createdAt)
    )
      continue;
    recommendations.push({
      id,
      practiceId: practice.id,
      title: practice.title,
      what: practice.how,
      why: candidate.why,
      uncertainty:
        "Önkéntesen választható, általános gyakorlat. A beszámolók nem bizonyítanak okot, és nem tudjuk előre, hogy ez most segít-e.",
      reviewAt: new Date(
        Date.parse(
          feedback?.createdAt ??
            sources.find((s) => s.id === candidate.refs.at(-1)?.id)?.at ??
            now.toISOString(),
        ) +
          7 * 86400000,
      ).toISOString(),
      sourceRefs: candidate.refs.slice(-19).concat({
        id: `habi-practice-${practice.id}`,
        revision: 1,
        span: null,
      }),
      feedback: feedback?.value ?? "",
    });
  }
  return {
    facts: facts.slice(-2000),
    recommendations: recommendations
      .sort(
        (a, b) =>
          Number(["dismiss", "not_helped"].includes(a.feedback)) -
            Number(["dismiss", "not_helped"].includes(b.feedback)) ||
          Number(b.feedback === "helped") - Number(a.feedback === "helped"),
      )
      .slice(0, 3),
  };
}
export async function getCoachProfile({
  db,
  principal,
  playerId,
  now = new Date(),
}) {
  const { sources, events } = await collectCoachSources(
    db,
    principal,
    playerId,
  );
  const activeSources = sources.filter(coachContextEligible);
  const scope = ownerScope(principal, playerId),
    id = `profile-${hash(scope).slice(0, 40)}`;
  const fingerprint = hash({
    sources,
    events: events.map((e) => [e.id, e.revision]),
    day: now.toISOString().slice(0, 10),
  });
  const prior = await db
    .collection("habi_coach_profiles")
    .findOne({ ...scope, id });
  if (prior?.fingerprint === fingerprint) return { profile: prior, sources };
  const profile = {
    ...scope,
    id,
    schemaVersion: 2,
    revision: (prior?.revision ?? 0) + 1,
    createdAt: prior?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    retentionPolicyId: principal.retentionPolicyId,
    fingerprint,
    ...buildCoachProfile(activeSources, events, now),
    sourceCount: activeSources.length,
    coverageFrom: activeSources[0]?.at ?? null,
    coverageTo: activeSources.at(-1)?.at ?? null,
  };
  validateContractDocument("habi_coach_profiles", profile);
  if (prior) {
    await db
      .collection("habi_coach_profiles")
      .replaceOne({ ...scope, id, revision: prior.revision }, profile);
  } else {
    try {
      await db.collection("habi_coach_profiles").insertOne(profile);
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  return { profile, sources };
}
export function redactCoachDocument(doc) {
  const {
    _id,
    tenantId,
    retentionPolicyId,
    actorId,
    fingerprint,
    profileSnapshot,
    profileSources,
    ...safe
  } = doc;
  return safe;
}
