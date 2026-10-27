"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./workspace.module.css";
import MetroTimeline, { ActorBadge, type TimelinePage } from "./metro-timeline";
import CoachReportWorkspace from "./coach-report-workspace";
import practices from "../lib/content/practices-v1.json";
import journeyContent from "../lib/content/journeys-v1.json";
import monthlyReflectionContent from "../lib/content/monthly-reflection-v1.json";
import guidedConversationContent from "../lib/content/guided-conversations-v2.json";
import {
  advanceGuidedConversation,
  createGuidedConversationSummary,
  isGuidedConversationSafetyInput,
  rankGuidedCategories,
  resolveGuidedConversation,
  startGuidedConversation,
} from "../lib/workflows/guided-conversations.mjs";
import {
  createGoalExport,
  summarizeRecordedAnswers,
} from "../lib/workflows/goal-export.mjs";
import {
  isGoalReviewDue,
  latestGoalReviewDate,
  nextGoalReviewDate,
} from "../lib/workflows/goal-review.mjs";
import {
  isOwnGoalRecord,
  ownGoalLineageStatus,
  ownGoalText as goalTextForRecord,
} from "../lib/workflows/goal-lineage.mjs";
import { createCheckinConversationOpening } from "../lib/workflows/checkin-conversation-opening.mjs";
import { getDailySituationOptions } from "../lib/workflows/daily-situation-context.mjs";
import { createTrustedAdultMessage } from "../lib/workflows/trusted-adult-message.mjs";

type Role = "player" | "parent" | "coach";
type OwnRole = {
  id: string;
  role: Role;
  playerId: string | null;
  playerDisplayName: string | null;
};
type Me = {
  actorId: string;
  activeRole: Role;
  activeMembershipId: string | null;
  allowedRoles: Role[];
  playerIds: string[];
  memberships: Array<{
    id: string;
    role: Role;
    playerId: string | null;
    playerDisplayName: string | null;
  }>;
  csrfToken: string;
};
type PlayerProfile = {
  id: string;
  displayName: string | null;
  profileState: "named" | "name_missing";
};
type RecordItem = {
  id: string;
  kind?: string;
  text?: string | null;
  occurredAt?: string;
  completedAt?: string;
  revision?: number;
  answerCodes?: Array<{ metric: string; code: number }>;
  recordedBy?: { role: Role };
};
type PlayerData = PlayerProfile & {
  checkins: RecordItem[];
  records: RecordItem[];
};
type HistoryItem = RecordItem & { label: string; sourceRole: Role };
type WorkspaceView =
  | "overview"
  | "journal"
  | "checkin"
  | "conversations"
  | "timeline"
  | "reports"
  | "tasks-feedback"
  | "player-tools"
  | "assessments"
  | "knowledge";
type ThreadSummary = {
  id: string;
  revision: number;
  status: string;
  latestActivityAt: string;
};
type ThreadMessage = {
  id: string;
  revision: number;
  text: string;
  submittedAt: string;
  recordedBy: { role: Role; displayName?: string | null };
};
type PlanSummary = {
  id: string;
  revision: number;
  status: string;
  actions: Array<{
    id: string;
    what: string;
    why: string;
    ownerActorId: string;
    dueAt: string;
    stopCondition: string;
  }>;
  sourceRefs: Array<{ id: string; revision: number }>;
  acceptances: Array<{ role: Role; decision: string }>;
};
type FollowUpSummary = {
  id: string;
  revision: number;
  playerId: string;
  planRef: { id: string; revision: number };
  actionId: string;
  recordedBy: { role: Role };
  source: { kind: string };
  occurredAt: string;
  outcome: "helped" | "not_helped" | "unknown" | "adjust";
  text: string;
};
type MaterialSummary = {
  id: string;
  revision: number;
  title: string;
  text: string;
  version: number;
  status: string;
};
type TimelineResponse = TimelinePage & { snapshotAt?: string };
type QuestionJob = {
  jobId: string;
  status: "queued" | "processing" | "review" | "ready" | "failed" | "cancelled";
  reasonCode: string | null;
  resultRef: { id: string; revision: number } | null;
};
type InterpretationView = {
  answerState: string;
  reviewState: string;
  answer: {
    status: string;
    unknowns: string[];
    claims: Array<{ id: string; text: string }>;
  } | null;
};
type AppState =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "no-role" }
  | { state: "admin"; memberships: OwnRole[] }
  | { state: "ready"; me: Me };
type RoleRequest = {
  id: string;
  role: Role;
  displayName: string;
  status: "pending" | "invitation-issued" | "declined" | "active";
  createdAt: string;
};
type ExperienceDraftKey =
  | "daily-reflection"
  | "weekly-reflection"
  | "monthly-reflection"
  | "guided-conversation"
  | "guided-topic-conversation";
type GuidedTreeDraft = {
  categoryId: string;
  turns: string[];
  opening?: string;
};
type ExperienceDraftPayload = Record<
  string,
  string | number | null | Array<string | number | null>
>;

const metrics = [
  [
    "energy",
    "Mennyi energiád van?",
    ["Sok", "Megfelelő", "Kevés", "Kimerültem"],
  ],
  ["sleep", "Hogyan aludtál?", ["Kiválóan", "Jól", "Keveset", "Rosszul"]],
  [
    "focus",
    "Mennyire tudsz figyelni?",
    ["Nagyon jól", "Jól", "Nehezen", "Alig"],
  ],
  [
    "mood",
    "Hogy érzed magad?",
    ["Nagyon jól", "Jól", "Lehangoltan", "Feszült"],
  ],
  [
    "load",
    "Mennyit edzettél?",
    ["Nem edzettem", "Keveset", "Közepesen", "Sokat"],
  ],
] as const;

const metricGlyphs: Record<string, string> = {
  energy:
    "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  sleep: "M19 15.5A8 8 0 0 1 8.5 5 8 8 0 1 0 19 15.5Z",
  focus:
    "M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Zm9.5-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  mood: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14s1.2 2 3.5 2 3.5-2 3.5-2M9 9h.01M15 9h.01",
  load: "M3 12h3l2-6 4 12 2-6h7",
};

function MetricIcon({ metric }: { metric: string }) {
  return (
    <span className={`metric-icon metric-${metric}`} aria-hidden="true">
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d={metricGlyphs[metric] ?? metricGlyphs.focus} />
      </svg>
    </span>
  );
}

function roleLabel(role: Role) {
  return role === "player" ? "Játékos" : role === "parent" ? "Szülő" : "Edző";
}

function localDayKey(value: string | number) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validClock(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function localDayBounds(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(year, month - 1, date);
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== date
  )
    return null;
  const end = new Date(year, month - 1, date + 1);
  return {
    from: start.toISOString(),
    to: new Date(end.getTime() - 1).toISOString(),
  };
}

function messageFor(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "AUTHENTICATION_REQUIRED")
    return "Jelentkezz be a folytatáshoz.";
  if (code === "ACCESS_DENIED") return "Ehhez a művelethez nincs hozzáférésed.";
  if (code === "DEPENDENCY_UNAVAILABLE")
    return "A Habi szolgáltatás még nincs teljesen bekapcsolva.";
  if (code === "REVISION_CONFLICT")
    return "A hozzáférés közben megváltozott. Töltsd újra az oldalt, majd próbáld újra.";
  if (code === "NOT_FOUND")
    return "Ehhez a szerepkörhöz már nincs aktív Habi-hozzáférés.";
  return "A művelet most nem sikerült. Próbáld újra.";
}

export default function HabiWorkspace() {
  const [app, setApp] = useState<AppState>({ state: "loading" });
  const [signInFailure, setSignInFailure] = useState<string | null>(null);
  const [data, setData] = useState<PlayerData[]>([]);
  const [recordCursor, setRecordCursor] = useState<string | null>(null);
  const [loadingOlderRecords, setLoadingOlderRecords] = useState(false);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [timelineDayFilter, setTimelineDayFilter] = useState("");
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checkinIndex, setCheckinIndex] = useState<number | null>(null);
  const [observation, setObservation] = useState("");
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [observationFeedback, setObservationFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [questionFeedback, setQuestionFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [questionJob, setQuestionJob] = useState<QuestionJob | null>(null);
  const [questionAnswer, setQuestionAnswer] =
    useState<InterpretationView | null>(null);
  const [questionStatusUnavailable, setQuestionStatusUnavailable] =
    useState(false);
  const observationFeedbackRef = useRef<HTMLParagraphElement>(null);
  const questionFeedbackRef = useRef<HTMLParagraphElement>(null);
  const questionResultRef = useRef<HTMLElement>(null);
  const [notice, setNoticeText] = useState("");
  const goalReplacementCommand = useRef<{
    fingerprint: string;
    idempotencyKey: string;
    occurredAt: string;
    timeZone: string;
  } | null>(null);
  const monthlyReflectionCommand = useRef<{
    fingerprint: string;
    idempotencyKey: string;
    body: {
      period: string;
      contentVersion: string;
      answers: {
        questionIndex: number;
        value: number | "skip" | "not-applicable";
      }[];
      nextFocus: string | null;
      note: string | null;
      expectedDraftRevision: number;
      occurredAt: string;
      timeZone: string;
    };
  } | null>(null);
  const [noticeKind, setNoticeKind] = useState<"info" | "success" | "error">(
    "info",
  );
  const setNotice = useCallback(
    (message: string, kind: "info" | "success" | "error" = "error") => {
      setNoticeText(message);
      if (message) setNoticeKind(kind);
    },
    [],
  );
  const [busy, setBusy] = useState(false);
  const [enteringRoleId, setEnteringRoleId] = useState<string | null>(null);
  const [roleEntryError, setRoleEntryError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [tab, setTab] = useState<WorkspaceView>("overview");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadDraft, setThreadDraft] = useState("");
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpSummary[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [planDraft, setPlanDraft] = useState("");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialText, setMaterialText] = useState("");
  const [followupText, setFollowupText] = useState("");
  const [followupOutcome, setFollowupOutcome] = useState<
    "helped" | "not_helped" | "unknown" | "adjust"
  >("unknown");
  const [practiceSearch, setPracticeSearch] = useState("");
  const [playerGoalDraft, setPlayerGoalDraft] = useState("");
  const [goalReviewDays, setGoalReviewDays] = useState("7");
  const [editingGoalId, setEditingGoalId] = useState("");
  const [editingGoalText, setEditingGoalText] = useState("");
  const [replacingGoalId, setReplacingGoalId] = useState("");
  const [replacementGoalText, setReplacementGoalText] = useState("");
  const [reviewingGoalId, setReviewingGoalId] = useState("");
  const [exportingGoalId, setExportingGoalId] = useState("");
  const [includeGoalHistory, setIncludeGoalHistory] = useState(false);
  const [goalReviewNote, setGoalReviewNote] = useState("");
  const [routineDraft, setRoutineDraft] = useState("");
  const [practiceFeedback, setPracticeFeedback] = useState("");
  const [monthlyAnswers, setMonthlyAnswers] = useState<
    Array<number | "skip" | "not-applicable" | null>
  >(Array(monthlyReflectionContent.questions.length).fill(null));
  const [monthlyReflectionStep, setMonthlyReflectionStep] = useState(0);
  const [monthlyNextStep, setMonthlyNextStep] = useState("");
  const [monthlyNote, setMonthlyNote] = useState("");
  const [draftsLoadedFor, setDraftsLoadedFor] = useState("");
  const [draftNotice, setDraftNotice] = useState("");
  const draftRevisions = useRef<Record<ExperienceDraftKey, number>>({
    "daily-reflection": 0,
    "weekly-reflection": 0,
    "monthly-reflection": 0,
    "guided-conversation": 0,
    "guided-topic-conversation": 0,
  });
  const draftWriteQueues = useRef<
    Partial<Record<ExperienceDraftKey, Promise<boolean>>>
  >({});
  const [reflectionType, setReflectionType] = useState<"daily" | "weekly">(
    "daily",
  );
  const [reflectionAnswers, setReflectionAnswers] = useState<{
    daily: Record<string, string>;
    weekly: Record<string, string>;
  }>({
    daily: { moment: "", helped: "" },
    weekly: { helped: "", hard: "", next: "" },
  });
  const [trendPeriod, setTrendPeriod] = useState<14 | 28 | 42>(14);
  const [clientNow, setClientNow] = useState<number | null>(null);
  const [reminderPrefs, setReminderPrefs] = useState({
    enabled: false,
    morning: "08:00",
    evening: "20:00",
  });
  const [guidedSituationId, setGuidedSituationId] = useState("");
  const [guidedAnswers, setGuidedAnswers] = useState<number[]>([]);
  const [guidedSourceCheckinId, setGuidedSourceCheckinId] = useState("");
  const [guidedPaused, setGuidedPaused] = useState(false);
  const [guidedTreeDraft, setGuidedTreeDraft] =
    useState<GuidedTreeDraft | null>(null);
  const [guidedTreePaused, setGuidedTreePaused] = useState(false);
  const [guidedTopicInput, setGuidedTopicInput] = useState("");
  const [guidedTopicSuggestions, setGuidedTopicSuggestions] = useState<
    string[] | null
  >(null);
  const [completedGuidedTreeSummary, setCompletedGuidedTreeSummary] =
    useState("");
  const [painStep, setPainStep] = useState<number | null>(null);
  const [painAnswers, setPainAnswers] = useState<number[]>([]);
  const [painPlaceDetail, setPainPlaceDetail] = useState("");
  const [trustedAdultPrep, setTrustedAdultPrep] = useState({
    person: "",
    topic: "",
    ask: "",
  });
  const [trustedAdultPreview, setTrustedAdultPreview] = useState(false);
  const [requestedRole, setRequestedRole] = useState<Role>("player");
  const [requesterName, setRequesterName] = useState("");
  const [roleRequest, setRoleRequest] = useState<RoleRequest | null>(null);
  const [roleRequestMessage, setRoleRequestMessage] = useState("");
  const [roleRequestBusy, setRoleRequestBusy] = useState(false);

  useEffect(() => {
    if (
      app.state !== "ready" ||
      app.me.activeRole !== "player" ||
      !selectedPlayerId
    ) {
      setDraftsLoadedFor("");
      return;
    }
    const owner = `${app.me.actorId}:${selectedPlayerId}`;
    const controller = new AbortController();
    setDraftsLoadedFor("");
    setGuidedSituationId("");
    setGuidedAnswers([]);
    setGuidedSourceCheckinId("");
    setGuidedPaused(false);
    setGuidedTreeDraft(null);
    setGuidedTreePaused(false);
    setGuidedTopicInput("");
    setGuidedTopicSuggestions(null);
    draftRevisions.current = {
      "daily-reflection": 0,
      "weekly-reflection": 0,
      "monthly-reflection": 0,
      "guided-conversation": 0,
      "guided-topic-conversation": 0,
    };
    void Promise.all(
      (
        [
          "daily-reflection",
          "weekly-reflection",
          "monthly-reflection",
          "guided-conversation",
          "guided-topic-conversation",
        ] as const
      ).map(async (draftKey) => {
        const response = await fetch(
          `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/drafts/${draftKey}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.code ?? "LOAD_FAILED");
        return { draftKey, draft: body?.draft ?? null };
      }),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        for (const { draftKey, draft } of results) {
          if (!draft) continue;
          draftRevisions.current[draftKey] = draft.revision;
          if (
            draftKey === "daily-reflection" &&
            draft.contentVersion === "daily-reflection-v1"
          ) {
            setReflectionAnswers((current) => ({
              ...current,
              daily: {
                moment: draft.payload.moment ?? "",
                helped: draft.payload.helped ?? "",
              },
            }));
          }
          if (
            draftKey === "weekly-reflection" &&
            draft.contentVersion === "weekly-reflection-v1"
          ) {
            setReflectionAnswers((current) => ({
              ...current,
              weekly: {
                helped: draft.payload.helped ?? "",
                hard: draft.payload.hard ?? "",
                next: draft.payload.next ?? "",
              },
            }));
          }
          if (
            draftKey === "monthly-reflection" &&
            draft.contentVersion ===
              `monthly-reflection-v${monthlyReflectionContent.version}` &&
            Array.isArray(draft.payload.answers) &&
            draft.payload.answers.length ===
              monthlyReflectionContent.questions.length
          ) {
            setMonthlyAnswers(draft.payload.answers);
            setMonthlyReflectionStep(draft.payload.step);
            setMonthlyNextStep(draft.payload.nextFocus ?? "");
            setMonthlyNote(draft.payload.note ?? "");
          }
          if (
            draftKey === "guided-conversation" &&
            ["guided-situation-v1", "guided-situation-v2"].includes(
              draft.contentVersion,
            ) &&
            typeof draft.payload.situationId === "string" &&
            Array.isArray(draft.payload.answers)
          ) {
            setGuidedSituationId(draft.payload.situationId);
            setGuidedAnswers(draft.payload.answers);
            setGuidedSourceCheckinId(draft.payload.sourceCheckinId ?? "");
            setGuidedPaused(true);
          }
          if (
            draftKey === "guided-topic-conversation" &&
            ["guided-chat-v2", "guided-chat-v3"].includes(
              draft.contentVersion,
            ) &&
            typeof draft.payload.categoryId === "string" &&
            Array.isArray(draft.payload.turns)
          ) {
            setGuidedTreeDraft({
              categoryId: draft.payload.categoryId,
              turns: draft.payload.turns,
              ...(typeof draft.payload.opening === "string"
                ? { opening: draft.payload.opening }
                : {}),
            });
            setGuidedTopicInput(draft.payload.opening ?? "");
            setGuidedTreePaused(true);
          }
        }
        const incompatibleDraft = results.some(
          ({ draftKey, draft }) =>
            draft &&
            draft.contentVersion !==
              (draftKey === "monthly-reflection"
                ? `monthly-reflection-v${monthlyReflectionContent.version}`
                : draftKey === "guided-conversation"
                  ? ["guided-situation-v1", "guided-situation-v2"].includes(
                      draft.contentVersion,
                    )
                    ? draft.contentVersion
                    : "guided-situation-v2"
                  : draftKey === "guided-topic-conversation"
                    ? ["guided-chat-v2", "guided-chat-v3"].includes(
                        draft.contentVersion,
                      )
                      ? draft.contentVersion
                      : "guided-chat-v3"
                    : `${draftKey}-v1`),
        );
        setDraftNotice(
          incompatibleDraft
            ? "Egy korábbi kérdéssor piszkozatát nem lehet automatikusan megnyitni. Az új válaszaid mentése lecseréli."
            : results.some(({ draft }) => draft)
              ? "A korábbi piszkozatod folytatható."
              : "",
        );
        setDraftsLoadedFor(owner);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDraftNotice(messageFor(error));
      });
    return () => controller.abort();
  }, [app, selectedPlayerId]);

  useEffect(() => {
    const updateClock = () => setClientNow(Date.now());
    updateClock();
    const interval = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (app.state !== "ready") return;
    const requestedView = new URLSearchParams(window.location.search).get(
      "view",
    );
    if (requestedView === "tasks-feedback") setTab("tasks-feedback");
    if (requestedView === "legacy")
      setTab(
        app.me.activeRole === "player" ? "player-tools" : "tasks-feedback",
      );
  }, [app]);

  useEffect(() => {
    if (app.state !== "no-role") return;
    const controller = new AbortController();
    void fetch("/api/identity/role-requests", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.code ?? "LOAD_FAILED");
        if (body?.request) {
          setRoleRequest(body.request as RoleRequest);
          setRequestedRole(body.request.role);
          setRequesterName(body.request.displayName ?? "");
        } else if (typeof body?.identity?.displayName === "string")
          setRequesterName(body.identity.displayName);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setRoleRequestMessage(
            "A kérelmi állapot most nem tölthető be. Próbáld újra.",
          );
      });
    return () => controller.abort();
  }, [app.state]);

  async function submitRoleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoleRequestBusy(true);
    setRoleRequestMessage("");
    try {
      const response = await fetch("/api/identity/role-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: requestedRole,
          displayName: requesterName.trim(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.code === "CONFLICT")
          throw new Error("Ehhez a szerepkörhöz már van aktív hozzáférésed.");
        if (body?.code === "AUTHENTICATION_REQUIRED")
          throw new Error(
            "A bejelentkezés lejárt. Jelentkezz be újra, majd küldd el a kérelmet.",
          );
        throw new Error("A kérelem most nem küldhető el. Próbáld újra.");
      }
      setRoleRequest(body.request as RoleRequest);
      setRoleRequestMessage(
        "A kérelmedet elküldtük a Habi adminisztrátorának. A hozzáférés csak a meghívó elfogadása után aktiválódik.",
      );
    } catch (error) {
      setRoleRequestMessage(
        error instanceof Error
          ? error.message
          : "A kérelem most nem küldhető el. Próbáld újra.",
      );
    } finally {
      setRoleRequestBusy(false);
    }
  }

  useEffect(() => {
    if (app.state !== "ready" || !selectedPlayerId) return;
    const controller = new AbortController();
    const fetchList = async (url: string) => {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code ?? "LOAD_FAILED");
      return body;
    };
    if (tab === "conversations") {
      void fetchList(
        `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/threads`,
      )
        .then((body) => {
          const items = Array.isArray(body.items) ? body.items : [];
          setThreads(items);
          setSelectedThreadId((current) =>
            items.some((item: ThreadSummary) => item.id === current)
              ? current
              : (items[0]?.id ?? ""),
          );
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === "AbortError"))
            setNotice(messageFor(error));
        });
    }
    if (tab === "reports") {
      void fetchList(
        `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/plans`,
      )
        .then((body) => setPlans(Array.isArray(body.items) ? body.items : []))
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === "AbortError"))
            setNotice(messageFor(error));
        });
      if (app.state === "ready" && app.me.activeRole === "coach") {
        void fetchList(
          `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/materials`,
        )
          .then((body) =>
            setMaterials(Array.isArray(body.items) ? body.items : []),
          )
          .catch((error: unknown) => {
            if (!(error instanceof Error && error.name === "AbortError"))
              setNotice(messageFor(error));
          });
      }
    }
    if (tab === "tasks-feedback" || tab === "reports") {
      setTasksLoading(true);
      void Promise.all([
        fetchList(
          `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/plans`,
        ),
        fetchList(
          `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/follow-ups`,
        ),
      ])
        .then(([planBody, followUpBody]) => {
          setPlans(Array.isArray(planBody.items) ? planBody.items : []);
          setFollowUps(
            Array.isArray(followUpBody.items) ? followUpBody.items : [],
          );
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === "AbortError"))
            setNotice(messageFor(error));
        })
        .finally(() => setTasksLoading(false));
    }
    return () => controller.abort();
  }, [app, selectedPlayerId, setNotice, tab]);

  useEffect(() => {
    if (tab !== "conversations" || !selectedThreadId) {
      setThreadMessages([]);
      return;
    }
    const controller = new AbortController();
    void fetch(
      `/api/v1/threads/${encodeURIComponent(selectedThreadId)}/messages`,
      {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.code ?? "LOAD_FAILED");
        setThreadMessages(
          Array.isArray(body.items) ? [...body.items].reverse() : [],
        );
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError"))
          setNotice(messageFor(error));
      });
    return () => controller.abort();
  }, [selectedThreadId, setNotice, tab]);

  async function logOutFromHabi() {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
    window.location.replace("/");
  }

  async function enterRole(membershipId: string) {
    if (enteringRoleId) return;
    setEnteringRoleId(membershipId);
    setRoleEntryError("");
    try {
      const response = await fetch("/api/identity/activate-role", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.code ?? "ROLE_ENTRY_FAILED");
      window.location.replace("/");
    } catch (error) {
      setRoleEntryError(messageFor(error));
      setEnteringRoleId(null);
    }
  }

  const load = useCallback(async () => {
    setApp({ state: "loading" });
    try {
      const response = await fetch("/api/v1/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        const params = new URLSearchParams(window.location.search);
        setSignInFailure(
          params.get("signin") === "failed" ? params.get("reason") : null,
        );
        const adminResponse = await fetch("/api/admin/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (adminResponse.ok) {
          const admin = await adminResponse.json().catch(() => null);
          setApp({
            state: "admin",
            memberships: Array.isArray(admin?.memberships)
              ? admin.memberships
              : [],
          });
        } else if (adminResponse.status === 403) setApp({ state: "no-role" });
        else setApp({ state: "signed-out" });
        return;
      }
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.code ?? "LOAD_FAILED",
        );
      const me = (await response.json()) as Me;
      const playerResponse = await fetch("/api/v1/players", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const playerResult = await playerResponse.json().catch(() => null);
      if (!playerResponse.ok)
        throw new Error(playerResult?.code ?? "PLAYER_LIST_FAILED");
      const roster = (playerResult?.items ?? []) as PlayerProfile[];
      setPlayers(roster);
      setSelectedPlayerId((current) =>
        roster.some((player) => player.id === current)
          ? current
          : (roster[0]?.id ?? ""),
      );
      setData([]);
      setApp({ state: "ready", me });
    } catch (error) {
      setNotice(messageFor(error));
      setApp({ state: "signed-out" });
    }
  }, [setNotice]);

  useEffect(() => {
    if (app.state !== "ready" || !selectedPlayerId) {
      setData([]);
      setTimeline(null);
      setRecordCursor(null);
      return;
    }
    setData([]);
    setTimeline(null);
    setRecordCursor(null);
    const player = players.find((item) => item.id === selectedPlayerId);
    if (!player) return;
    const dayBounds = localDayBounds(timelineDayFilter);
    const checkinQuery = new URLSearchParams({
      limit: "100",
      ...(dayBounds ?? {}),
    });
    const recordQuery = new URLSearchParams({
      limit: "50",
      ...(dayBounds ?? {}),
    });
    const timelineQuery = new URLSearchParams({
      playerId: selectedPlayerId,
      limit: "50",
      ...(dayBounds ?? {}),
    });
    const controller = new AbortController();
    void Promise.all([
      fetch(
        `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/checkin-results?${checkinQuery}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        },
      ),
      fetch(
        `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/records?${recordQuery}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        },
      ),
      fetch(`/api/v1/timeline?${timelineQuery}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      }),
    ])
      .then(async ([checkinResponse, recordResponse, timelineResponse]) => {
        const [checkins, records, timelinePage] = await Promise.all([
          checkinResponse.json().catch(() => null),
          recordResponse.json().catch(() => null),
          timelineResponse.json().catch(() => null),
        ]);
        if (!checkinResponse.ok)
          throw new Error(checkins?.code ?? "LOAD_FAILED");
        if (!recordResponse.ok) throw new Error(records?.code ?? "LOAD_FAILED");
        if (!timelineResponse.ok)
          throw new Error(timelinePage?.code ?? "LOAD_FAILED");
        setTimeline(timelinePage as TimelineResponse);
        setRecordCursor(records.nextCursor ?? null);
        setData([
          {
            ...player,
            checkins: checkins.items ?? [],
            records: records.items ?? [],
          },
        ]);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setNotice(messageFor(error));
        setData([]);
        setTimeline(null);
      });
    return () => controller.abort();
  }, [app, players, selectedPlayerId, setNotice, timelineDayFilter]);

  async function loadOlderRecords() {
    if (
      !recordCursor ||
      !selectedPlayerId ||
      busy ||
      loadingOlderRecords ||
      app.state !== "ready"
    )
      return;

    setBusy(true);
    setNotice("");
    setLoadingOlderRecords(true);
    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/records?limit=50&cursor=${encodeURIComponent(recordCursor)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code ?? "LOAD_FAILED");
      setData((current) =>
        current.map((item) =>
          item.id === selectedPlayerId
            ? {
                ...item,
                records: [
                  ...item.records,
                  ...(body.items ?? []).filter(
                    (next: RecordItem) =>
                      !item.records.some((existing) => existing.id === next.id),
                  ),
                ],
              }
            : item,
        ),
      );
      setRecordCursor(body.nextCursor ?? null);
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setLoadingOlderRecords(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const active = app.state === "ready" ? app.me : null;
  const playerId = selectedPlayerId;
  const selectedPlayer =
    players.find((player) => player.id === playerId) ?? null;
  const experienceDraftsReady = Boolean(
    active?.activeRole === "player" &&
      draftsLoadedFor === `${active.actorId}:${selectedPlayerId}`,
  );
  const ownPlayerData = selectedPlayer
    ? data.find((person) => person.id === selectedPlayer.id)
    : null;
  useEffect(() => {
    if (!ownPlayerData) return;
    const settings = ownPlayerData.records.find((record) =>
      record.text?.startsWith("Habi emlékeztető-beállítások · "),
    );
    if (!settings?.text) {
      setReminderPrefs({ enabled: false, morning: "08:00", evening: "20:00" });
      return;
    }
    try {
      const saved = JSON.parse(
        settings.text.slice("Habi emlékeztető-beállítások · ".length),
      );
      if (
        typeof saved.enabled === "boolean" &&
        typeof saved.morning === "string" &&
        validClock(saved.morning) &&
        typeof saved.evening === "string" &&
        validClock(saved.evening)
      )
        setReminderPrefs(saved);
    } catch {
      setNotice("Az emlékeztető-beállításokat nem sikerült beolvasni.");
    }
  }, [ownPlayerData, setNotice]);
  const localToday = clientNow ? localDayKey(clientNow) : "";
  const reminderType = (() => {
    if (
      !reminderPrefs.enabled ||
      !validClock(reminderPrefs.morning) ||
      !validClock(reminderPrefs.evening) ||
      !clientNow ||
      !ownPlayerData
    )
      return null;
    const localTime = new Date(clientNow).toTimeString().slice(0, 5);
    const checkedInToday = ownPlayerData.checkins.some(
      (item) =>
        item.completedAt && localDayKey(item.completedAt) === localToday,
    );
    const reflectedToday = ownPlayerData.records.some(
      (item) =>
        item.text?.startsWith("Napi visszatekintés ·") &&
        item.occurredAt &&
        localDayKey(item.occurredAt) === localToday,
    );
    const dismissedToday = (type: "morning" | "evening") =>
      ownPlayerData.records.some(
        (item) =>
          item.text === `Emlékeztető elhalasztva · ${localToday} · ${type}`,
      );
    if (
      !checkedInToday &&
      localTime >= reminderPrefs.morning &&
      localTime < reminderPrefs.evening &&
      !dismissedToday("morning")
    )
      return "morning" as const;
    if (
      !reflectedToday &&
      localTime >= reminderPrefs.evening &&
      !dismissedToday("evening")
    )
      return "evening" as const;
    return null;
  })();
  const trendCutoff =
    clientNow === null
      ? Number.POSITIVE_INFINITY
      : clientNow - trendPeriod * 24 * 60 * 60 * 1000;
  const trendCheckins = (ownPlayerData?.checkins ?? [])
    .filter(
      (item) => item.completedAt && Date.parse(item.completedAt) >= trendCutoff,
    )
    .sort((a, b) =>
      String(a.completedAt ?? "").localeCompare(String(b.completedAt ?? "")),
    );
  const latestPlayerCheckin = (ownPlayerData?.checkins ?? [])
    .filter((item) => item.completedAt)
    .slice()
    .sort((a, b) =>
      String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")),
    )[0];
  const latestCheckinConversationOpening = latestPlayerCheckin
    ? createCheckinConversationOpening(latestPlayerCheckin, metrics)
    : "";
  const latestDailySituationOptions = getDailySituationOptions(
    latestPlayerCheckin,
    metrics,
  );
  const latestPlayerTask = latestPlayerCheckin
    ? ownPlayerData?.records.find((record) =>
        record.text?.startsWith(
          `Mai saját lépés · ${latestPlayerCheckin.id} ·`,
        ),
      )
    : null;
  const latestPlayerTaskDone = latestPlayerCheckin
    ? ownPlayerData?.records.some(
        (record) =>
          record.text === `Mai saját lépés kész · ${latestPlayerCheckin.id}`,
      )
    : false;
  function ownGoalText(goal: RecordItem) {
    const latestEdit = (ownPlayerData?.records ?? [])
      .filter((record) =>
        record.text?.startsWith(`Saját cél módosítva · ${goal.id} ·`),
      )
      .sort((a, b) =>
        String(b.occurredAt ?? "").localeCompare(String(a.occurredAt ?? "")),
      )[0];
    return (
      latestEdit?.text
        ?.slice(`Saját cél módosítva · ${goal.id} ·`.length)
        .trim() ??
      goalTextForRecord(goal) ??
      ""
    );
  }
  function ownGoalStatus(goal: RecordItem) {
    return ownGoalLineageStatus(goal, ownGoals, ownPlayerData?.records ?? []);
  }
  const ownGoals = (ownPlayerData?.records ?? []).filter(isOwnGoalRecord);
  const dueOwnGoals = ownGoals.filter((goal) => {
    const status = ownGoalStatus(goal);
    const reviewDate = latestGoalReviewDate(
      ownPlayerData?.records ?? [],
      goal.id,
    );
    return (
      status === "active" &&
      Boolean(reviewDate && isGoalReviewDue(reviewDate, localToday))
    );
  });
  const questionSource = data[0]?.checkins[0] ?? null;
  const historyItems: HistoryItem[] = data
    .flatMap((person) => [
      ...person.checkins.map((item) => ({
        ...item,
        occurredAt: item.completedAt,
        label: "Állapotjelzés",
        sourceRole: "player" as const,
      })),
      ...person.records.map((item) => ({
        ...item,
        label: item.kind === "observation" ? "Megfigyelés" : "Bejegyzés",
        sourceRole: item.recordedBy?.role ?? ("player" as const),
      })),
    ])
    .sort((a, b) =>
      String(b.occurredAt ?? "").localeCompare(String(a.occurredAt ?? "")),
    );
  const workspaceViews: Array<{ id: WorkspaceView; label: string }> =
    active?.activeRole === "player"
      ? [
          { id: "overview", label: "Áttekintés" },
          { id: "journal", label: "Napló" },
          { id: "checkin", label: "Állapotjelzés" },
          { id: "timeline", label: "Idővonal" },
          { id: "tasks-feedback", label: "Feladatok és visszajelzések" },
          { id: "player-tools", label: "Gyakorlatok és saját célok" },
        ]
      : active?.activeRole === "parent"
        ? [
            { id: "overview", label: "Áttekintés" },
            { id: "journal", label: "Napló" },
            { id: "conversations", label: "Beszélgetések" },
            { id: "timeline", label: "Idővonal" },
            { id: "reports", label: "Tervek" },
            { id: "tasks-feedback", label: "Feladatok és visszajelzések" },
          ]
        : [
            { id: "overview", label: "Áttekintés" },
            { id: "journal", label: "Napló" },
            { id: "checkin", label: "Állapotjelzés" },
            { id: "conversations", label: "Beszélgetések" },
            { id: "timeline", label: "Idővonal" },
            { id: "reports", label: "Riportok és tervek" },
            { id: "assessments", label: "Felmérések" },
            { id: "knowledge", label: "Tudástár" },
            { id: "tasks-feedback", label: "Feladatok és visszajelzések" },
          ];

  useEffect(() => {
    if (observationFeedback) {
      observationFeedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [observationFeedback]);

  useEffect(() => {
    if (questionFeedback) {
      questionFeedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [questionFeedback]);

  useEffect(() => {
    if (questionJob?.jobId) {
      questionResultRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [questionJob]);

  useEffect(() => {
    if (
      !questionJob?.jobId ||
      !["queued", "processing", "review"].includes(questionJob.status)
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/v1/jobs/${encodeURIComponent(questionJob.jobId)}`,
          { cache: "no-store", credentials: "same-origin" },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) {
            if (cancelled) return;
            const code = body?.code ?? "STATUS_UNAVAILABLE";
            setQuestionStatusUnavailable(false);
            setQuestionJob((current) =>
              current?.jobId === questionJob.jobId
                ? { ...current, status: "failed", reasonCode: code }
                : current,
            );
            setQuestionFeedback({
              kind: "error",
              message:
                response.status === 401
                  ? "Lejárt a bejelentkezésed. Jelentkezz be újra a kérés állapotának megtekintéséhez."
                  : "Ehhez a kéréshez már nincs hozzáférésed. Frissítsd az oldalt, vagy kérj segítséget az edzőtől.",
            });
            return;
          }
          throw new Error(body?.code ?? "STATUS_UNAVAILABLE");
        }
        if (cancelled) return;
        let next = body as QuestionJob;
        if (
          !next ||
          typeof next.status !== "string" ||
          ![
            "queued",
            "processing",
            "review",
            "ready",
            "failed",
            "cancelled",
          ].includes(next.status)
        ) {
          throw new Error("STATUS_UNAVAILABLE");
        }
        if (next.status === "ready" && next.resultRef?.id) {
          const answerResponse = await fetch(
            `/api/v1/interpretations/${encodeURIComponent(next.resultRef.id)}`,
            { cache: "no-store", credentials: "same-origin" },
          );
          const answer = await answerResponse.json().catch(() => null);
          if (
            !answerResponse.ok &&
            [401, 403, 404].includes(answerResponse.status)
          ) {
            if (cancelled) return;
            const code = answer?.code ?? "ANSWER_UNAVAILABLE";
            setQuestionStatusUnavailable(false);
            setQuestionJob((current) =>
              current?.jobId === next.jobId
                ? { ...current, status: "failed", reasonCode: code }
                : current,
            );
            setQuestionFeedback({
              kind: "error",
              message:
                answerResponse.status === 401
                  ? "Lejárt a bejelentkezésed. Jelentkezz be újra a válasz megtekintéséhez."
                  : "A válasz most már nem érhető el ezzel a hozzáféréssel. Kérj segítséget az edzőtől.",
            });
            return;
          }
          if (!answerResponse.ok)
            throw new Error(answer?.code ?? "ANSWER_UNAVAILABLE");
          if (cancelled) return;
          const view = answer as InterpretationView;
          setQuestionAnswer(view);
          if (view.answerState === "awaiting_review") {
            next = { ...next, status: "review" };
          }
        }
        setQuestionStatusUnavailable(false);
        setQuestionJob(next);
        if (["queued", "processing", "review"].includes(next.status)) {
          timer = setTimeout(() => void refresh(), 5000);
        }
      } catch {
        if (cancelled) return;
        setQuestionStatusUnavailable(true);
        timer = setTimeout(() => void refresh(), 8000);
      }
    };
    timer = setTimeout(() => void refresh(), 1800);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [questionJob?.jobId, questionJob?.status]);

  useEffect(() => {
    if (
      !questionJob?.jobId ||
      !playerId ||
      !["queued", "ready"].includes(questionJob.status)
    )
      return;
    const controller = new AbortController();
    const dayBounds = localDayBounds(timelineDayFilter);
    const timelineQuery = new URLSearchParams({
      playerId,
      limit: "50",
      ...(dayBounds ?? {}),
    });
    void fetch(`/api/v1/timeline?${timelineQuery}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.code ?? "TIMELINE_LOAD_FAILED");
        if (!controller.signal.aborted) setTimeline(body as TimelineResponse);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [playerId, questionJob?.jobId, questionJob?.status, timelineDayFilter]);

  async function switchMembership(membershipId: string) {
    if (!active || membershipId === active.activeMembershipId || busy) return;
    const membership = active.memberships.find(
      (item) => item.id === membershipId,
    );
    if (!membership) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/me/scope", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-habi-csrf": active.csrfToken,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          membershipId: membership.id,
          playerId: membership.playerId,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.code ?? "ROLE_SWITCH_FAILED");
      window.location.replace("/");
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadOlderTimeline() {
    if (!timeline?.nextCursor || !playerId || loadingOlder) return;
    setLoadingOlder(true);
    setNotice("");
    try {
      const query = new URLSearchParams({
        playerId,
        limit: "50",
        cursor: timeline.nextCursor,
        ...(localDayBounds(timelineDayFilter) ?? {}),
      });
      const response = await fetch(`/api/v1/timeline?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const nextPage = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextPage?.code ?? "LOAD_FAILED");
      setTimeline((current) =>
        current
          ? {
              ...current,
              nodes: [...current.nodes, ...nextPage.nodes],
              edges: [...current.edges, ...nextPage.edges],
              processes: [...current.processes, ...nextPage.processes],
              continuations: [
                ...current.continuations,
                ...nextPage.continuations,
              ],
              nextCursor: nextPage.nextCursor,
            }
          : current,
      );
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function submitCheckin(finalAnswers = answers) {
    if (!active || !playerId || Object.keys(finalAnswers).length === 0) {
      setNotice("Legalább egy választ adj meg az állapotjelzés mentéséhez.");
      setCheckinIndex(null);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const start = await fetch(
        `/api/v1/players/${encodeURIComponent(playerId)}/checkin-sessions`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            instrumentVersion: "checkin-hu-1",
          }),
        },
      );
      const session = await start.json();
      if (!start.ok) throw new Error(session.code ?? "SAVE_FAILED");
      let revision = 1;
      for (const [metric] of metrics) {
        if (finalAnswers[metric] === undefined) continue;
        const saved = await fetch(
          `/api/v1/checkin-sessions/${encodeURIComponent(session.id)}/answers`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "x-habi-csrf": active.csrfToken,
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify({
              expectedRevision: revision,
              metric,
              answerCode: finalAnswers[metric],
            }),
          },
        );
        const result = await saved.json();
        if (!saved.ok) throw new Error(result.code ?? "SAVE_FAILED");
        // The answer DTO revision belongs to the record. The session revision
        // advances once on each successful answer write.
        revision += 1;
      }
      const complete = await fetch(
        `/api/v1/checkin-sessions/${encodeURIComponent(session.id)}/complete`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ expectedRevision: revision }),
        },
      );
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.code ?? "SAVE_FAILED");
      setAnswers({});
      setCheckinIndex(null);
      setNotice("A mai állapotjelzésed elmentve.", "success");
      await load();
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  function answerCurrent(answer: number | null) {
    if (checkinIndex === null) return;
    const [metric] = metrics[checkinIndex] ?? [];
    if (!metric) return;
    const nextAnswers = { ...answers };
    if (answer === null) delete nextAnswers[metric];
    else nextAnswers[metric] = answer;
    setAnswers(nextAnswers);
    setNotice("");
    if (checkinIndex + 1 < metrics.length) {
      setCheckinIndex(checkinIndex + 1);
      return;
    }
    void submitCheckin(nextAnswers);
  }

  async function submitObservation() {
    if (!active || !playerId || !observation.trim()) return;
    setBusy(true);
    setNotice("");
    setObservationFeedback(null);
    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(playerId)}/records`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            kind: active.activeRole === "coach" ? "observation" : "diary",
            text: observation.trim(),
            occurredAt: new Date().toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            sourceKind:
              active.activeRole === "player"
                ? "self"
                : active.activeRole === "parent"
                  ? "proxy"
                  : "observation",
            sessionId: null,
            metric: null,
            answerCode: null,
            context: {
              setting: active.activeRole === "parent" ? "home" : "training",
              activity: null,
              durationMinutes: null,
            },
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.code ?? "SAVE_FAILED");
      setObservation("");
      setObservationFeedback({
        kind: "success",
        message: "A megfigyelés elmentve.",
      });
      await load();
    } catch (error) {
      setObservationFeedback({ kind: "error", message: messageFor(error) });
    } finally {
      setBusy(false);
    }
  }

  async function savePlayerDiary(
    text: string,
    command: {
      idempotencyKey: string;
      occurredAt: string;
      timeZone: string;
    } = {
      idempotencyKey: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  ) {
    if (active?.activeRole !== "player" || !playerId || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(playerId)}/records`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": command.idempotencyKey,
          },
          body: JSON.stringify({
            kind: "diary",
            text,
            occurredAt: command.occurredAt,
            timeZone: command.timeZone,
            sourceKind: "self",
            sessionId: null,
            metric: null,
            answerCode: null,
            context: {
              setting: "training",
              activity: null,
              durationMinutes: null,
            },
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code ?? "SAVE_FAILED");
      await load();
      return body as RecordItem;
    } catch (error) {
      setNotice(messageFor(error));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveReminderSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !validClock(reminderPrefs.morning) ||
      !validClock(reminderPrefs.evening)
    )
      return;
    await savePlayerDiary(
      `Habi emlékeztető-beállítások · ${JSON.stringify(reminderPrefs)}`,
    );
  }

  async function dismissReminder(type: "morning" | "evening") {
    if (!localToday) return;
    await savePlayerDiary(`Emlékeztető elhalasztva · ${localToday} · ${type}`);
  }

  async function chooseDailyPlayerTask(checkinId: string, action: string) {
    if (!checkinId || !action) return;
    const alreadyChosen = ownPlayerData?.records.some((record) =>
      record.text?.startsWith(`Mai saját lépés · ${checkinId} ·`),
    );
    if (alreadyChosen) return;
    await savePlayerDiary(`Mai saját lépés · ${checkinId} · ${action}`);
  }

  async function completeDailyPlayerTask(checkinId: string) {
    if (!checkinId) return;
    const alreadyCompleted = ownPlayerData?.records.some(
      (record) => record.text === `Mai saját lépés kész · ${checkinId}`,
    );
    if (!alreadyCompleted)
      await savePlayerDiary(`Mai saját lépés kész · ${checkinId}`);
  }

  async function saveOwnGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goal = playerGoalDraft.trim();
    if (!goal || goal.length > 500) return;
    const saved = await savePlayerDiary(`Saját cél: ${goal}`);
    if (!saved?.id) return;
    setPlayerGoalDraft("");
    const reviewDate = nextGoalReviewDate(localToday, Number(goalReviewDays));
    await savePlayerDiary(
      `Saját cél újranézés · ${saved.id} · ${reviewDate ?? "kikapcsolva"}`,
    );
  }

  async function replaceOwnGoal(goalId: string, text: string) {
    const nextText = text.trim();
    if (!goalId || !nextText || nextText.length > 500) return;
    const fingerprint = `${goalId}\u0000${nextText}`;
    if (goalReplacementCommand.current?.fingerprint !== fingerprint) {
      goalReplacementCommand.current = {
        fingerprint,
        idempotencyKey: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }
    const saved = await savePlayerDiary(
      `Saját célcsere · ${goalId} · ${nextText}`,
      goalReplacementCommand.current,
    );
    if (!saved) return;
    goalReplacementCommand.current = null;
    setReplacingGoalId("");
    setReplacementGoalText("");
    const reviewDate = nextGoalReviewDate(localToday, Number(goalReviewDays));
    await savePlayerDiary(
      `Saját cél újranézés · ${saved.id} · ${reviewDate ?? "kikapcsolva"}`,
    );
  }

  async function saveOwnGoalReplacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await replaceOwnGoal(replacingGoalId, replacementGoalText);
  }

  async function setOwnGoalState(
    goalId: string,
    state: "active" | "paused" | "closed" | "habit",
  ) {
    await savePlayerDiary(`Saját cél állapot · ${goalId} · ${state}`);
  }

  async function saveOwnGoalEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = editingGoalText.trim();
    if (!editingGoalId || !text || text.length > 500) return;
    if (
      await savePlayerDiary(`Saját cél módosítva · ${editingGoalId} · ${text}`)
    ) {
      setEditingGoalId("");
      setEditingGoalText("");
    }
  }

  async function saveOwnGoalReview(goalId: string) {
    const note = goalReviewNote.trim();
    if (!goalId || !note) return;
    const saved = await savePlayerDiary(
      `Saját cél visszatekintés · ${goalId} · ${note}`,
    );
    if (saved) {
      const reviewDate = nextGoalReviewDate(localToday, Number(goalReviewDays));
      await savePlayerDiary(
        `Saját cél újranézés · ${goalId} · ${reviewDate ?? "kikapcsolva"}`,
      );
      setReviewingGoalId("");
      setGoalReviewNote("");
    }
  }

  function downloadOwnGoal(goal: RecordItem) {
    const text = createGoalExport({
      goal,
      goalText: ownGoalText(goal),
      status: ownGoalStatus(goal),
      records: ownPlayerData?.records ?? [],
      includeHistory: includeGoalHistory,
    });
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "HABI-sajat-vallalasom.txt";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportingGoalId("");
    setIncludeGoalHistory(false);
  }

  async function saveRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const routine = routineDraft.trim();
    if (!routine || routine.length > 300) return;
    if (await savePlayerDiary(`Saját rutin: ${routine}`)) setRoutineDraft("");
  }

  async function logRoutine(routine: string) {
    const today = new Date().toLocaleDateString("hu-HU");
    const alreadyLogged = ownPlayerData?.records.some(
      (record) =>
        record.text === `Rutin elvégezve: ${routine}` &&
        record.occurredAt &&
        new Date(record.occurredAt).toLocaleDateString("hu-HU") === today,
    );
    if (!alreadyLogged) await savePlayerDiary(`Rutin elvégezve: ${routine}`);
  }

  async function savePracticeFeedback(
    practice: { id: string; title: string },
    rating: string,
  ) {
    const feedback = practiceFeedback.trim();
    const text = `Gyakorlat: ${practice.title}\nVisszajelzés: ${rating}${feedback ? `\nSaját megjegyzés: ${feedback}` : ""}`;
    if (await savePlayerDiary(text)) setPracticeFeedback("");
  }

  function saveExperienceDraft(
    draftKey: ExperienceDraftKey,
    payload: ExperienceDraftPayload,
  ) {
    const previous =
      draftWriteQueues.current[draftKey] ?? Promise.resolve(true);
    const operation = previous
      .catch(() => false)
      .then(async () => {
        if (
          app.state !== "ready" ||
          app.me.activeRole !== "player" ||
          !selectedPlayerId ||
          draftsLoadedFor !== `${app.me.actorId}:${selectedPlayerId}`
        ) {
          setDraftNotice("A piszkozat még töltődik. Próbáld újra.");
          return false;
        }
        try {
          const contentVersion =
            draftKey === "monthly-reflection"
              ? `monthly-reflection-v${monthlyReflectionContent.version}`
              : draftKey === "guided-conversation"
                ? typeof payload.sourceCheckinId === "string"
                  ? "guided-situation-v2"
                  : "guided-situation-v1"
                : draftKey === "guided-topic-conversation"
                  ? "guided-chat-v3"
                  : `${draftKey}-v1`;
          const response = await fetch(
            `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/drafts/${draftKey}`,
            {
              method: "PUT",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                "x-habi-csrf": app.me.csrfToken,
                "Idempotency-Key": crypto.randomUUID(),
              },
              body: JSON.stringify({
                expectedRevision: draftRevisions.current[draftKey],
                contentVersion,
                payload,
              }),
            },
          );
          const body = await response.json().catch(() => null);
          if (!response.ok) throw new Error(body?.code ?? "SAVE_FAILED");
          draftRevisions.current[draftKey] = body.draft.revision;
          setDraftNotice("A piszkozat elmentve.");
          return true;
        } catch (error) {
          setDraftNotice(messageFor(error));
          return false;
        }
      });
    draftWriteQueues.current[draftKey] = operation;
    void operation.then(() => {
      if (draftWriteQueues.current[draftKey] === operation)
        delete draftWriteQueues.current[draftKey];
    });
    return operation;
  }

  async function clearExperienceDraft(draftKey: ExperienceDraftKey) {
    if (app.state !== "ready" || !selectedPlayerId) return false;
    await draftWriteQueues.current[draftKey];
    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/drafts/${draftKey}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": app.state === "ready" ? app.me.csrfToken : "",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            expectedRevision: draftRevisions.current[draftKey],
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code ?? "DELETE_FAILED");
      draftRevisions.current[draftKey] = 0;
      return true;
    } catch (error) {
      setDraftNotice(messageFor(error));
      return false;
    }
  }

  async function saveMonthlyReflection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      app.state !== "ready" ||
      app.me.activeRole !== "player" ||
      !selectedPlayerId ||
      monthlyReflectionStep !== monthlyReflectionContent.questions.length ||
      monthlyAnswers.some((answer) => answer === null)
    )
      return;

    const answers = monthlyAnswers.map((value, questionIndex) => ({
      questionIndex,
      value: value as number | "skip" | "not-applicable",
    }));
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const period = `${dateParts.find((part) => part.type === "year")?.value}-${dateParts.find((part) => part.type === "month")?.value}`;
    const fingerprint = JSON.stringify({
      playerId: selectedPlayerId,
      period,
      answers,
      nextFocus: monthlyNextStep.trim() || null,
      note: monthlyNote.trim() || null,
    });
    let command = monthlyReflectionCommand.current;
    if (!command || command.fingerprint !== fingerprint) {
      const draftSaved = await saveExperienceDraft("monthly-reflection", {
        step: monthlyReflectionStep,
        answers: monthlyAnswers,
        nextFocus: monthlyNextStep,
        note: monthlyNote,
      });
      if (!draftSaved) {
        setBusy(false);
        return;
      }
      const occurredAt = new Date().toISOString();
      command = {
        fingerprint,
        idempotencyKey: crypto.randomUUID(),
        body: {
          period,
          contentVersion: `monthly-reflection-v${monthlyReflectionContent.version}`,
          answers,
          nextFocus: monthlyNextStep.trim() || null,
          note: monthlyNote.trim() || null,
          expectedDraftRevision: draftRevisions.current["monthly-reflection"],
          occurredAt,
          timeZone,
        },
      };
      monthlyReflectionCommand.current = command;
    }

    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/monthly-reflections`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": app.me.csrfToken,
            "Idempotency-Key": command.idempotencyKey,
          },
          body: JSON.stringify(command.body),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.code ?? "SAVE_FAILED");
      draftRevisions.current["monthly-reflection"] = 0;
      monthlyReflectionCommand.current = null;
      setMonthlyAnswers(
        Array(monthlyReflectionContent.questions.length).fill(null),
      );
      setMonthlyReflectionStep(0);
      setMonthlyNextStep("");
      setMonthlyNote("");
      setNotice(
        "A havi visszatekintésed elmentve az előzmények közé.",
        "success",
      );
      await load();
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  function answerMonthlyReflection(value: number | "skip" | "not-applicable") {
    const index = monthlyReflectionStep;
    if (index < 0 || index >= monthlyReflectionContent.questions.length) return;
    const next = [...monthlyAnswers];
    next[index] = value;
    const nextStep = index + 1;
    setMonthlyAnswers(next);
    setMonthlyReflectionStep(nextStep);
    void saveExperienceDraft("monthly-reflection", {
      step: nextStep,
      answers: next,
      nextFocus: monthlyNextStep,
      note: monthlyNote,
    });
  }

  async function saveReflection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answers = reflectionAnswers[reflectionType];
    if (!Object.values(answers).some((value) => value.trim())) return;
    const date = new Date().toLocaleDateString("hu-HU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const questions =
      reflectionType === "daily"
        ? [
            ["A napodból mi maradt meg?", reflectionAnswers.daily.moment],
            ["Mi segített ma?", reflectionAnswers.daily.helped],
          ]
        : [
            ["Mi segített ezen a héten?", reflectionAnswers.weekly.helped],
            ["Mi volt sok vagy nehéz?", reflectionAnswers.weekly.hard],
            ["Mit próbálnál ki jövő héten?", reflectionAnswers.weekly.next],
          ];
    const text = `${reflectionType === "daily" ? "Napi visszatekintés" : "Heti visszatekintés"} · ${date}\n${questions.map(([questionText, answer]) => `${questionText} ${answer.trim() || "Kihagyva"}`).join("\n")}`;
    if (await savePlayerDiary(text)) {
      await clearExperienceDraft(
        reflectionType === "daily" ? "daily-reflection" : "weekly-reflection",
      );
      setReflectionAnswers((current) => ({
        ...current,
        [reflectionType]:
          reflectionType === "daily"
            ? { moment: "", helped: "" }
            : { helped: "", hard: "", next: "" },
      }));
    }
  }

  async function saveTrustedAdultPrep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createTrustedAdultMessage(trustedAdultPrep))
      setTrustedAdultPreview(true);
  }

  async function saveTrustedAdultPrepToDiary() {
    const text = createTrustedAdultMessage(trustedAdultPrep);
    if (text && (await savePlayerDiary(text))) {
      setTrustedAdultPrep({ person: "", topic: "", ask: "" });
      setTrustedAdultPreview(false);
    }
  }

  function downloadTrustedAdultPrep() {
    const text = createTrustedAdultMessage(trustedAdultPrep);
    if (!text) return;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "Habi-beszelgetes-elokeszito.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function startPainSupport() {
    setPainAnswers([]);
    setPainPlaceDetail("");
    setPainStep(0);
  }

  function answerPainSupport(answer: number) {
    if (painStep === null || painStep < 0 || painStep > 2) return;
    const choices = [
      [
        "A lábamban vagy a lábfejemben.",
        "A karomban vagy a vállamban.",
        "Máshol, vagy nehéz megmondanom.",
      ],
      [
        "Most kezdődött.",
        "Ma már korábban is éreztem.",
        "Több napja visszatér.",
      ],
      [
        "Egy bizonyos mozdulatnál.",
        "Mozgás közben többféle helyzetben.",
        "Pihenés közben is, vagy nehéz megmondanom.",
      ],
    ][painStep];
    if (
      !choices ||
      !Number.isInteger(answer) ||
      answer < 0 ||
      answer >= choices.length
    )
      return;
    setPainAnswers((current) => {
      const next = [...current];
      next[painStep] = answer;
      return next;
    });
    setPainStep(painStep === 2 ? 3 : painStep + 1);
  }

  async function startGuidedSituation(id: string, sourceCheckinId = "") {
    if (!id) {
      setBusy(true);
      const cleared = await clearExperienceDraft("guided-conversation");
      setBusy(false);
      if (!cleared) return;
      setGuidedSituationId("");
      setGuidedAnswers([]);
      setGuidedSourceCheckinId("");
      setGuidedPaused(false);
      return;
    }
    setBusy(true);
    setNotice("");
    const saved = await saveExperienceDraft("guided-conversation", {
      situationId: id,
      answers: [],
      ...(sourceCheckinId ? { sourceCheckinId } : {}),
    });
    setBusy(false);
    if (!saved) return;
    setGuidedSituationId(id);
    setGuidedAnswers([]);
    setGuidedSourceCheckinId(sourceCheckinId);
    setGuidedPaused(false);
  }

  async function answerGuidedSituation(answer: number) {
    if (
      !Number.isInteger(answer) ||
      answer < 0 ||
      answer > 2 ||
      guidedAnswers.length >= 3 ||
      busy
    )
      return;
    const answers = [...guidedAnswers, answer];
    setBusy(true);
    const saved = await saveExperienceDraft("guided-conversation", {
      situationId: guidedSituationId,
      answers,
      ...(guidedSourceCheckinId
        ? { sourceCheckinId: guidedSourceCheckinId }
        : {}),
    });
    setBusy(false);
    if (saved) {
      setGuidedAnswers(answers);
      setGuidedPaused(false);
    }
  }

  function suggestGuidedTopics() {
    const opening = guidedTopicInput.trim().slice(0, 1000);
    if (!opening) return;
    if (isGuidedConversationSafetyInput(opening)) {
      void startGuidedTopic("support");
      return;
    }
    const categories = rankGuidedCategories(opening);
    setGuidedTopicSuggestions(categories);
  }

  async function startGuidedTopic(categoryId: string) {
    const opening = guidedTopicInput.trim().slice(0, 1000);
    const payload = startGuidedConversation(categoryId, opening);
    if (!payload || busy) return;
    setCompletedGuidedTreeSummary("");
    setBusy(true);
    const saved = await saveExperienceDraft(
      "guided-topic-conversation",
      payload,
    );
    setBusy(false);
    if (saved) {
      setGuidedTreeDraft(payload);
      setGuidedTreePaused(false);
    }
  }

  async function answerGuidedTopic(optionId: string) {
    if (!guidedTreeDraft || busy) return;
    const payload = advanceGuidedConversation(guidedTreeDraft, optionId);
    if (!payload) return;
    setBusy(true);
    const saved = await saveExperienceDraft(
      "guided-topic-conversation",
      payload,
    );
    setBusy(false);
    if (saved) {
      setGuidedTreeDraft(payload);
      setGuidedTreePaused(false);
    }
  }

  async function discardGuidedTopic() {
    if (busy) return;
    setBusy(true);
    const cleared = await clearExperienceDraft("guided-topic-conversation");
    setBusy(false);
    if (cleared) {
      setGuidedTreeDraft(null);
      setGuidedTreePaused(false);
      setGuidedTopicInput("");
      setGuidedTopicSuggestions(null);
    }
  }

  function downloadGuidedTopicSummary(summary: string) {
    if (!summary) return;
    const url = URL.createObjectURL(
      new Blob([summary], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "Habi-vezetett-beszelgetes.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function saveGuidedTopic() {
    if (!guidedTreeDraft || busy) return;
    const state = resolveGuidedConversation(guidedTreeDraft);
    if (!state?.outcome) return;
    const summary = createGuidedConversationSummary(guidedTreeDraft);
    if (!summary) return;
    const transcript = [
      `${guidedConversationContent.labels.title}: ${state.category.label}`,
      ...(guidedTreeDraft.opening
        ? [`Te mondtad\n${guidedTreeDraft.opening}`]
        : []),
      ...state.turns.flatMap(({ node, option }) => [
        node.response,
        `${node.question}\n${option.label}`,
      ]),
      `Habi válasza\n${state.outcome.text}`,
    ].join("\n\n");
    if (
      await savePlayerDiary(
        `Vezetett beszélgetés · ${state.category.label}\n${transcript}`,
      )
    ) {
      await clearExperienceDraft("guided-topic-conversation");
      setCompletedGuidedTreeSummary(summary);
      setGuidedTreeDraft(null);
      setGuidedTreePaused(false);
      setGuidedTopicInput("");
      setGuidedTopicSuggestions(null);
    }
  }

  async function saveGuidedConversation() {
    const situation = journeyContent.situations.find(
      (item) => item.id === guidedSituationId,
    );
    if (!situation || guidedAnswers.length !== 3) return;
    const finalChoices = [
      situation.action,
      journeyContent.chat.askChoice,
      journeyContent.chat.reflectChoice,
    ];
    const dialogue = [
      `Helyzet: ${situation.opening}`,
      ...(guidedSourceCheckinId
        ? [
            `Kapcsolódó állapotjelzés: ${guidedSourceCheckinId}`,
            (() => {
              const checkin = ownPlayerData?.checkins.find(
                (item) => item.id === guidedSourceCheckinId,
              );
              const sourceMetric =
                guidedSituationId === "too-fast" ? "focus" : "mood";
              const source = checkin?.answerCodes?.find(
                (item) => item.metric === sourceMetric,
              );
              const definition = source
                ? metrics.find(([key]) => key === source.metric)
                : null;
              return source && definition
                ? `Kapcsolódó kérdés és válasz: ${definition[1]} — ${definition[2][source.code] ?? "Nincs válasz"}`
                : "A kapcsolódó válasz részlete jelenleg nem érhető el.";
            })(),
          ]
        : []),
      `${situation.question}\n${situation.options[guidedAnswers[0] ?? 0]}`,
      `${journeyContent.chat.question}\n${journeyContent.chat.options[guidedAnswers[1] ?? 0]}`,
      `${journeyContent.chat.lastQuestion}\n${finalChoices[guidedAnswers[2] ?? 0]}`,
      `Habi válasza: ${guidedAnswers[2] === 0 ? situation.action : guidedAnswers[2] === 1 ? journeyContent.chat.goalAsk : journeyContent.labels.endReflect}`,
    ].join("\n\n");
    if (
      await savePlayerDiary(
        `Vezetett beszélgetés · ${situation.opening}\n${dialogue}`,
      )
    ) {
      await clearExperienceDraft("guided-conversation");
      setGuidedSituationId("");
      setGuidedAnswers([]);
      setGuidedSourceCheckinId("");
      setGuidedPaused(false);
    }
  }

  async function sendThreadMessage() {
    if (!active || !selectedThreadId || !threadDraft.trim() || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/threads/${encodeURIComponent(selectedThreadId)}/messages`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ text: threadDraft.trim(), replyTo: null }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.code ?? "MESSAGE_FAILED");
      setThreadDraft("");
      const refreshed = await fetch(
        `/api/v1/threads/${encodeURIComponent(selectedThreadId)}/messages`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await refreshed.json().catch(() => null);
      if (!refreshed.ok) throw new Error(body?.code ?? "LOAD_FAILED");
      setThreadMessages(
        Array.isArray(body.items) ? [...body.items].reverse() : [],
      );
      setNotice("Az üzenet bekerült a beszélgetésbe.", "success");
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function createSharedPlan() {
    if (
      active?.activeRole !== "coach" ||
      !playerId ||
      !planDraft.trim() ||
      busy
    )
      return;
    const source = questionSource;
    const isCoachQuestion = active.activeRole === "coach";
    if (!isCoachQuestion && !source) {
      setNotice(
        "Terv készítéséhez előbb válassz egy forrásolt játékos-beszámolót.",
      );
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(playerId)}/plans`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            sourceRefs:
              isCoachQuestion || !source
                ? []
                : [{ id: source.id, revision: source.revision, span: null }],
            answerRef: null,
            actions: [
              {
                id: crypto.randomUUID(),
                what: planDraft.trim(),
                why: "A játékossal egyeztetett, kipróbálható következő lépés.",
                ownerActorId: active.actorId,
                dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
                stopCondition:
                  "A játékos vagy az edző jelzi, ha a lépés nem megfelelő vagy módosítani kell.",
              },
            ],
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code ?? "PLAN_FAILED");
      setPlans((items) => [body, ...items]);
      setPlanDraft("");
      setNotice(
        "A közös terv mentve. A játékos és a kapcsolt szülő a jóváhagyás után látja.",
        "success",
      );
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveCoachMaterial() {
    if (
      active?.activeRole !== "coach" ||
      !playerId ||
      !materialTitle.trim() ||
      !materialText.trim() ||
      busy
    )
      return;
    const source = questionSource;
    if (!source) {
      setNotice("Edzői anyaghoz előbb kapcsolj egy ellenőrizhető forrást.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(playerId)}/materials`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            title: materialTitle.trim(),
            text: materialText.trim(),
            sourceRefs: [{ id: source.id, revision: source.revision }],
            supersedesRef: null,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code ?? "MATERIAL_SAVE_FAILED");
      setMaterials((items) => [body, ...items]);
      setMaterialTitle("");
      setMaterialText("");
      setNotice(
        "Az edzői anyag piszkozatként mentve. Megosztás előtt ellenőrizd a szöveget és a forrást.",
        "success",
      );
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function publishCoachMaterial(material: MaterialSummary) {
    if (active?.activeRole !== "coach" || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/publications", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-habi-csrf": active.csrfToken,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          resourceRef: { id: material.id, revision: material.revision },
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code ?? "PUBLISH_FAILED");
      setMaterials((items) =>
        items.map((item) =>
          item.id === material.id ? { ...item, status: "published" } : item,
        ),
      );
      setNotice(
        "Az edzői anyag megosztva a kapcsolt játékosokkal és szülőkkel.",
        "success",
      );
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function decidePlan(plan: PlanSummary, decision: "accept" | "decline") {
    if (!active || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/plans/${encodeURIComponent(plan.id)}/acceptance`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
            "If-Match": String(plan.revision),
          },
          body: JSON.stringify({ expectedRevision: plan.revision, decision }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code ?? "PLAN_DECISION_FAILED");
      setPlans((items) =>
        items.map((item) => (item.id === plan.id ? body : item)),
      );
      setNotice(
        decision === "accept"
          ? "Elfogadtad a közös tervet."
          : "A tervet elutasítottad.",
        "success",
      );
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitFollowUp(plan: PlanSummary, actionId: string) {
    if (!active || !playerId || !followupText.trim() || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(playerId)}/follow-ups`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            planRef: { id: plan.id, revision: plan.revision },
            actionId,
            occurredAt: new Date().toISOString(),
            context: {
              setting: active.activeRole === "parent" ? "home" : "training",
              activity: null,
              durationMinutes: null,
            },
            sourceKind:
              active.activeRole === "player"
                ? "self"
                : active.activeRole === "parent"
                  ? "proxy"
                  : "observation",
            outcome: followupOutcome,
            text: followupText.trim(),
            comparable: false,
            comparabilityReason:
              "Az utánkövetés nem hasonlítható össze automatikusan más helyzetekkel.",
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code ?? "FOLLOWUP_FAILED");
      setFollowupText("");
      setFollowUps((items) => [body, ...items]);
      setNotice("Az utánkövetés rögzítve, a tervhez kapcsolva.", "success");
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function askQuestion() {
    if (
      !active ||
      !["parent", "coach"].includes(active.activeRole) ||
      !playerId ||
      !question.trim()
    )
      return;
    setNotice("");
    const source = questionSource;
    if (!source) {
      setQuestionFeedback({
        kind: "error",
        message:
          "A kérdés elküldéséhez előbb a játékos napi állapotjelzése szükséges.",
      });
      return;
    }
    setBusy(true);
    setQuestionFeedback(null);
    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(playerId)}/interpretations`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": active.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            threadId: crypto.randomUUID(),
            parentTurnId: null,
            intent: "new_question",
            question: question.trim(),
            sourceRefs: [
              { id: source.id, revision: source.revision, span: null },
            ],
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.code ?? "QUESTION_FAILED");
      if (typeof result.jobId !== "string" || !result.jobId) {
        throw new Error("QUESTION_FAILED");
      }
      setQuestionJob({
        jobId: result.jobId,
        status: "queued",
        reasonCode: null,
        resultRef: null,
      });
      setSubmittedQuestion(question.trim());
      setQuestionAnswer(null);
      setQuestionStatusUnavailable(false);
      setQuestion("");
      setQuestionFeedback({
        kind: "success",
        message: "A kérdés elküldve. A feldolgozás állapotát itt követheted.",
      });
    } catch (error) {
      setQuestionFeedback({ kind: "error", message: messageFor(error) });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
    window.location.assign("/");
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <a className={styles.brand} href="/" aria-label="Habi kezdőlap">
            <span className={styles.brandMark}>H</span>
            <span>Habi</span>
          </a>
          <span className={styles.headerLabel}>Közös sportolói támogatás</span>
          {active && active.memberships.length > 1 && (
            <label className={styles.roleSwitcher}>
              <span className={styles.srOnly}>Szerepkör és játékos</span>
              <select
                aria-label="Szerepkör és játékos váltása"
                value={active.activeMembershipId ?? ""}
                onChange={(event) => void switchMembership(event.target.value)}
                disabled={busy}
              >
                {active.memberships.map((membership) => {
                  const playerLabel = membership.playerDisplayName
                    ? ` · ${membership.playerDisplayName}`
                    : "";
                  return (
                    <option key={membership.id} value={membership.id}>
                      {roleLabel(membership.role)}
                      {playerLabel}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          {active || app.state === "admin" || app.state === "no-role" ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void (active ? signOut() : logOutFromHabi())}
            >
              Kilépés
            </button>
          ) : null}
        </header>

        {app.state === "loading" && (
          <section className={styles.panel} role="status">
            Betöltjük a Habi munkaterületet…
          </section>
        )}
        {app.state === "signed-out" && (
          <section className={`${styles.hero} information-block`}>
            <span className="route-motif" aria-hidden="true">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48">
                <path d="M8 8v32h32" />
                <circle cx="8" cy="8" />
                <circle cx="8" cy="40" />
                <circle cx="24" cy="40" />
                <circle cx="40" cy="40" />
              </svg>
            </span>
            <p className={styles.eyebrow}>Sportolói támogatás</p>
            <div className="story-legend">
              {(["player", "parent", "coach"] as const).map((role) => (
                <span className={`role-badge actor-${role}`} key={role}>
                  {roleLabel(role)}
                </span>
              ))}
            </div>
            {signInFailure === "APP_PERMISSION_SETUP_REQUIRED" ? (
              <>
                <h1>A Habi SSO-beállítása még nem kész.</h1>
                <p role="alert" className={styles.signInAlert}>
                  Az automatikus felhasználói hozzáférés egy egyszeri SSO
                  adminisztrátori beállítást igényel. Próbáld újra, miután a
                  Habi alkalmazás hozzáférés-kezelése engedélyezve lett.
                </p>
                <div className={styles.actions}>
                  <a
                    className={styles.primary}
                    href="/auth/login?returnTo=%2F&prompt=login"
                  >
                    Újrapróbálkozás
                  </a>
                  <button
                    className={styles.secondary}
                    type="button"
                    onClick={() => void logOutFromHabi()}
                  >
                    Kilépés a Habiból
                  </button>
                </div>
              </>
            ) : signInFailure === "APP_PERMISSION_DENIED" ? (
              <>
                <h1>A fiók még nem fér hozzá a Habihoz.</h1>
                <p role="alert" className={styles.signInAlert}>
                  A DoneIsBetter-belépés megtörtént, de ehhez a fiókhoz nincs
                  engedélyezve a Habi alkalmazás. Kérd a Habi-hozzáférés
                  engedélyezését, vagy lépj be egy másik DoneIsBetter-fiókkal.
                </p>
                <div className={styles.actions}>
                  <a
                    className={styles.primary}
                    href="/auth/login?returnTo=%2F&prompt=select_account"
                  >
                    Másik fiók használata
                  </a>
                  <a
                    className={styles.secondary}
                    href="/auth/login?returnTo=%2F&prompt=login"
                  >
                    Újrapróbálkozás
                  </a>
                  <button
                    className={styles.secondary}
                    type="button"
                    onClick={() => void logOutFromHabi()}
                  >
                    Kilépés a Habiból
                  </button>
                </div>
              </>
            ) : signInFailure ? (
              <>
                <h1>A bejelentkezés nem fejeződött be.</h1>
                <p role="alert" className={styles.signInAlert}>
                  Próbáld újra. Ha a hiba ismétlődik, jelezd a Habi
                  rendszergazdájának.
                </p>
                <a className={styles.primary} href="/auth/login?returnTo=%2F">
                  Belépés DoneIsBetter-fiókkal
                </a>
              </>
            ) : (
              <>
                <h1>Sportolói támogatás, közösen.</h1>
                <p>
                  Biztonságos munkaterület játékosoknak, szülőknek és edzőknek.
                </p>
                <a className={styles.primary} href="/auth/login?returnTo=%2F">
                  Belépés DoneIsBetter-fiókkal
                </a>
              </>
            )}
          </section>
        )}
        {app.state === "admin" && (
          <section className={`${styles.hero} information-block`}>
            <span className="route-motif" aria-hidden="true">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48">
                <path d="M8 8v32h32" />
                <circle cx="8" cy="8" />
                <circle cx="8" cy="40" />
                <circle cx="24" cy="40" />
                <circle cx="40" cy="40" />
              </svg>
            </span>
            <p className={styles.eyebrow}>ADMINISZTRÁCIÓ</p>
            <h1>Üdv a Habiban.</h1>
            <p>
              Az adminisztrátori fiókoddal felhasználói meghívókat és
              szerepköröket kezelhetsz.
            </p>
            <h2>A saját Habi-szerepköreid</h2>
            {app.memberships.length ? (
              <div className={styles.roleCards}>
                {app.memberships.map((membership) => (
                  <article className={styles.roleCard} key={membership.id}>
                    <span className={`role-badge actor-${membership.role}`}>
                      {roleLabel(membership.role)}
                    </span>
                    <p className={styles.roleDescription}>
                      {membership.role === "coach"
                        ? "Edzői munkaterület"
                        : membership.role === "player"
                          ? (membership.playerDisplayName ??
                            "Saját sportolói napló")
                          : membership.playerDisplayName
                            ? `Szülői hozzáférés · ${membership.playerDisplayName}`
                            : "Szülői hozzáférés a kapcsolódó játékoshoz"}
                    </p>
                    <button
                      className={styles.primary}
                      type="button"
                      disabled={Boolean(enteringRoleId)}
                      onClick={() => void enterRole(membership.id)}
                    >
                      {enteringRoleId === membership.id
                        ? "Munkaterület megnyitása…"
                        : "Belépés ebben a szerepben"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p>
                Még nincs játékos, szülői vagy edzői hozzáférés hozzárendelve
                ehhez a fiókhoz.
              </p>
            )}
            <div className={styles.adminActions}>
              <a className={styles.primary} href="/admin">
                Adminfelület megnyitása
              </a>
              <a className={styles.secondary} href="/admin#my-access">
                Szerepkör kérése a saját fiókomhoz
              </a>
            </div>
            {roleEntryError && (
              <p className={styles.signInAlert} role="alert">
                {roleEntryError}
              </p>
            )}
          </section>
        )}
        {app.state === "no-role" && (
          <section className={`${styles.hero} information-block`}>
            <span className="route-motif" aria-hidden="true">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48">
                <path d="M8 8v32h32" />
                <circle cx="8" cy="8" />
                <circle cx="8" cy="40" />
                <circle cx="24" cy="40" />
                <circle cx="40" cy="40" />
              </svg>
            </span>
            <p className={styles.eyebrow}>MEGHÍVÓ SZÜKSÉGES</p>
            <h1>Még nincs Habi-szerepköröd.</h1>
            <p>
              Itt közvetlenül kérhetsz játékos, szülői vagy edzői hozzáférést. A
              kérelmet a Habi adminisztrátora nézi át; a szerepkör csak a saját,
              ellenőrzött SSO-fiókoddal elfogadott meghívó után aktiválódik.
            </p>
            <section
              className={styles.roleRequest}
              aria-labelledby="role-request-title"
            >
              {roleRequest ? (
                <>
                  <p className={styles.eyebrow}>HOZZÁFÉRÉSI KÉRELEM</p>
                  <h2 id="role-request-title">
                    {roleRequest.status === "active"
                      ? "A hozzáférésed aktív"
                      : roleRequest.status === "invitation-issued"
                        ? "Elkészült a meghívód"
                        : roleRequest.status === "declined"
                          ? "A kérelmet lezárták"
                          : "A kérelmed megérkezett"}
                  </h2>
                  <p>
                    Kért szerepkör:{" "}
                    <strong>{roleLabel(roleRequest.role)}</strong> · a név, amit
                    megadtál: <strong>{roleRequest.displayName}</strong>
                  </p>
                  <p role="status" aria-live="polite">
                    {roleRequest.status === "active"
                      ? "Frissítsd az oldalt a munkaterület megnyitásához."
                      : roleRequest.status === "invitation-issued"
                        ? "Az adminisztrátor elkészítette a meghívót. Kérd el tőle a meghívó hivatkozását, majd fogadd el ezzel az SSO-fiókkal."
                        : roleRequest.status === "declined"
                          ? "Ha továbbra is hozzáférésre van szükséged, küldhetsz új kérelmet."
                          : "Az adminisztrátor áttekinti a kérelmet. A hozzáférés még nem aktív."}
                  </p>
                  {roleRequest.status !== "pending" &&
                    roleRequest.status !== "invitation-issued" && (
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => {
                          setRoleRequest(null);
                          setRoleRequestMessage("");
                        }}
                      >
                        Új kérelem indítása
                      </button>
                    )}
                  {roleRequest.status === "pending" && (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() =>
                        void fetch("/api/identity/role-requests", {
                          cache: "no-store",
                          credentials: "same-origin",
                        })
                          .then((response) => response.json())
                          .then((body) => {
                            if (body?.request) setRoleRequest(body.request);
                          })
                      }
                    >
                      Kérelem állapotának frissítése
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className={styles.eyebrow}>HOZZÁFÉRÉS KÉRÉSE</p>
                  <h2 id="role-request-title">
                    Milyen szerepben használnád a Habi-t?
                  </h2>
                  <form
                    className={styles.roleRequestForm}
                    onSubmit={(event) => void submitRoleRequest(event)}
                  >
                    <label className={styles.label} htmlFor="requested-role">
                      Kért szerepkör
                    </label>
                    <select
                      id="requested-role"
                      value={requestedRole}
                      onChange={(event) =>
                        setRequestedRole(event.target.value as Role)
                      }
                    >
                      <option value="player">
                        Játékos – saját sportolói napló
                      </option>
                      <option value="parent">
                        Szülő – kapcsolódó játékos támogatása
                      </option>
                      <option value="coach">Edző – játékosok támogatása</option>
                    </select>
                    <label
                      className={styles.label}
                      htmlFor="request-display-name"
                    >
                      A neved, amelyen az adminisztrátor felismer
                    </label>
                    <input
                      id="request-display-name"
                      autoComplete="name"
                      maxLength={100}
                      minLength={2}
                      required
                      value={requesterName}
                      readOnly={Boolean(requesterName)}
                      onChange={(event) => setRequesterName(event.target.value)}
                    />
                    <p className={styles.muted}>
                      Ezt a nevet csak a kérelem elbírálásához használjuk. A
                      jogosultságot az adminisztrátor állítja be; ez az űrlap
                      önmagában nem ad hozzáférést.
                    </p>
                    <button
                      className={styles.primary}
                      type="submit"
                      disabled={
                        roleRequestBusy || requesterName.trim().length < 2
                      }
                    >
                      {roleRequestBusy
                        ? "Kérelem küldése…"
                        : "Szerepkör kérése"}
                    </button>
                  </form>
                </>
              )}
              {roleRequestMessage && (
                <p role="status" aria-live="polite">
                  {roleRequestMessage}
                </p>
              )}
            </section>
          </section>
        )}
        {active && (
          <>
            <nav className={styles.nav} aria-label="Munkaterület nézetei">
              {workspaceViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  aria-current={tab === view.id ? "page" : undefined}
                  className={tab === view.id ? styles.navActive : ""}
                  onClick={() => {
                    setTab(view.id);
                    setNotice("");
                  }}
                >
                  {view.label}
                </button>
              ))}
            </nav>
            <section className={styles.heroCompact}>
              <div className={styles.roleHeading}>
                <span className="route-motif" aria-hidden="true">
                  <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48">
                    <path d="M8 8v32h32" />
                    <circle cx="8" cy="8" />
                    <circle cx="8" cy="24" />
                    <circle cx="8" cy="40" />
                    <circle cx="24" cy="40" />
                    <circle cx="40" cy="40" />
                  </svg>
                </span>
                <ActorBadge role={active.activeRole} />
              </div>
              <p className={styles.eyebrow}>
                {roleLabel(active.activeRole).toLocaleUpperCase("hu-HU")}{" "}
                MUNKATERÜLET
              </p>
              <h1>
                {active.activeRole === "player"
                  ? "Hogy vagy ma?"
                  : active.activeRole === "parent"
                    ? "A sportolói napló"
                    : "Edzői munkaterület"}
              </h1>
              <p>
                {active.activeRole === "player"
                  ? "Jelezd röviden, hogyan érzed magad a sportban."
                  : "Kövesd a megosztott állapotjelzéseket, és rögzítsd a megfigyeléseidet."}
              </p>
            </section>
            {selectedPlayer && (
              <section
                className={styles.playerContext}
                aria-label="Kiválasztott játékos"
              >
                <div className={styles.playerContextHeading}>
                  <span className="route-motif" aria-hidden="true">
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      viewBox="0 0 48 48"
                    >
                      <path d="M8 8v32h32" />
                      <circle cx="8" cy="8" />
                      <circle cx="8" cy="40" />
                      <circle cx="24" cy="40" />
                      <circle cx="40" cy="40" />
                    </svg>
                  </span>
                  <span className="role-badge actor-player">
                    Játékos profil
                  </span>
                </div>
                {active.activeRole !== "player" && players.length > 1 && (
                  <>
                    <label htmlFor="active-player">Játékos</label>
                    <select
                      id="active-player"
                      value={playerId}
                      onChange={(event) => {
                        setSelectedPlayerId(event.target.value);
                        setData([]);
                        setTimeline(null);
                        setNotice("");
                        setQuestionFeedback(null);
                        setQuestionJob(null);
                        setQuestionAnswer(null);
                        setQuestionStatusUnavailable(false);
                      }}
                    >
                      {players.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.displayName ?? "Kapcsolt játékos"}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <strong>
                  {selectedPlayer.displayName ??
                    (active.activeRole === "player"
                      ? "Saját sportolói napló"
                      : "Kapcsolt játékos")}
                </strong>
              </section>
            )}
            {!selectedPlayer &&
              (active.activeRole === "coach" ||
                active.activeRole === "parent") && (
                <p className={styles.notice} role="status">
                  Ehhez a fiókhoz még nincs kapcsolt játékos. Kérd meg a
                  Habi-adminisztrátort, hogy rendelje hozzá a megfelelő
                  játékost.
                </p>
              )}
            {notice && (
              <p
                className={`${styles.notice} ${
                  noticeKind === "success"
                    ? styles.noticeSuccess
                    : noticeKind === "error"
                      ? styles.noticeError
                      : ""
                }`}
                role={noticeKind === "error" ? "alert" : "status"}
              >
                {notice}
              </p>
            )}
            {tab === "overview" && active.activeRole === "player" && (
              <section className={`${styles.panel} workspace-section`}>
                <p className={styles.eyebrow}>A TE NAPLÓD</p>
                <h2>Egy rövid megálló magadra.</h2>
                <p className={styles.muted}>
                  {data[0]?.checkins.length
                    ? `Legutóbbi állapotjelzés: ${new Date(data[0].checkins[0].completedAt ?? "").toLocaleDateString("hu-HU")}. A korábbi válaszaidat az Idővonalon nézheted meg.`
                    : "Még nincs állapotjelzésed. Öt rövid kérdés segít rögzíteni, hogyan vagy ma."}
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setTab("checkin")}
                >
                  {data[0]?.checkins.length
                    ? "Új állapotjelzés"
                    : "Állapotjelzés indítása"}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setTab("timeline")}
                >
                  Megnyitom az idővonalat
                </button>
                {dueOwnGoals.length > 0 && (
                  <aside className={styles.notice} role="status">
                    <p>
                      {dueOwnGoals.length === 1
                        ? "Elérkezett az idő, hogy újra ránézz a saját célodra."
                        : `${dueOwnGoals.length} saját célodnál elérkezett az újranézés ideje.`}
                    </p>
                    {dueOwnGoals.map((goal) => (
                      <button
                        className={styles.secondary}
                        type="button"
                        key={goal.id}
                        onClick={() => {
                          setTab("player-tools");
                          setReviewingGoalId(goal.id);
                        }}
                      >
                        Megnézem: {ownGoalText(goal)}
                      </button>
                    ))}
                  </aside>
                )}
                {latestCheckinConversationOpening ? (
                  <details className={styles.formGroup}>
                    <summary>A legutóbbi válaszaim</summary>
                    <dl className={styles.summaryMetrics}>
                      {latestPlayerCheckin.answerCodes?.map(
                        ({ metric, code }) => {
                          const definition = metrics.find(
                            ([key]) => key === metric,
                          );
                          return definition ? (
                            <div key={metric}>
                              <dt>{definition[1]}</dt>
                              <dd>{definition[2][code] ?? "Nincs válasz"}</dd>
                            </div>
                          ) : null;
                        },
                      ) ?? null}
                    </dl>
                    <p className={styles.muted}>
                      Ha szeretnéd, ezekből készíthetsz egy általad
                      szerkeszthető beszélgetéskezdést. Habi nem értelmezi a
                      válaszaidat.
                    </p>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => {
                        setGuidedTopicInput(latestCheckinConversationOpening);
                        setGuidedTopicSuggestions(null);
                        setTab("player-tools");
                      }}
                    >
                      Beszélgetek a válaszaimról
                    </button>
                    {latestDailySituationOptions.length > 0 && (
                      <div className={styles.formGroup}>
                        <p className={styles.muted}>
                          Választhatsz egy előre megírt beszélgetést a
                          kapcsolódó válaszhoz. Habi nem von le következtetést.
                        </p>
                        {latestDailySituationOptions.map(
                          (option: {
                            situationId: string;
                            title: string;
                            checkinId: string;
                            metric: string;
                          }) => (
                            <button
                              className={styles.secondary}
                              type="button"
                              key={option.metric}
                              disabled={busy || !experienceDraftsReady}
                              onClick={() => {
                                setTab("player-tools");
                                void startGuidedSituation(
                                  option.situationId,
                                  option.checkinId,
                                );
                              }}
                            >
                              {option.title}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </details>
                ) : null}
                {reminderType && (
                  <aside className={styles.notice} role="status">
                    <p>
                      {reminderType === "morning"
                        ? "A napi állapotjelzésed még vár rád."
                        : "Ha szeretnéd, most visszatekinthetsz a napodra."}
                    </p>
                    <div className={styles.actions}>
                      <button
                        className={styles.primary}
                        type="button"
                        onClick={() =>
                          setTab(
                            reminderType === "morning"
                              ? "checkin"
                              : "player-tools",
                          )
                        }
                      >
                        {reminderType === "morning"
                          ? "Állapotjelzés indítása"
                          : "Visszatekintés megnyitása"}
                      </button>
                      <button
                        className={styles.secondary}
                        type="button"
                        disabled={busy}
                        onClick={() => void dismissReminder(reminderType)}
                      >
                        Ma inkább kihagyom
                      </button>
                    </div>
                  </aside>
                )}
                <details className={styles.formGroup}>
                  <summary>Emlékeztetők beállítása</summary>
                  <form onSubmit={saveReminderSettings}>
                    <p className={styles.muted}>
                      A Habi csak az alkalmazás megnyitásakor mutat
                      emlékeztetőt. Nem küld értesítést az eszközödre.
                    </p>
                    <label className={styles.label}>
                      <input
                        type="checkbox"
                        checked={reminderPrefs.enabled}
                        onChange={(event) =>
                          setReminderPrefs((current) => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }
                      />{" "}
                      Kérek emlékeztetőt
                    </label>
                    <label className={styles.label} htmlFor="reminder-morning">
                      Napi állapotjelzés ideje
                    </label>
                    <input
                      id="reminder-morning"
                      type="time"
                      value={reminderPrefs.morning}
                      onChange={(event) =>
                        setReminderPrefs((current) => ({
                          ...current,
                          morning: event.target.value,
                        }))
                      }
                    />
                    <label className={styles.label} htmlFor="reminder-evening">
                      Napi visszatekintés ideje
                    </label>
                    <input
                      id="reminder-evening"
                      type="time"
                      value={reminderPrefs.evening}
                      onChange={(event) =>
                        setReminderPrefs((current) => ({
                          ...current,
                          evening: event.target.value,
                        }))
                      }
                    />
                    <button
                      className={styles.primary}
                      type="submit"
                      disabled={busy}
                    >
                      Emlékeztetők mentése
                    </button>
                  </form>
                </details>
              </section>
            )}
            {tab === "overview" && active.activeRole !== "player" && (
              <section className={`${styles.panel} workspace-section`}>
                <p className={styles.eyebrow}>
                  {active.activeRole === "coach"
                    ? "CSAPATKÖVETÉS"
                    : "KAPCSOLÓDÓ JÁTÉKOS"}
                </p>
                <h2>{selectedPlayer?.displayName ?? "Válassz játékost"}</h2>
                {data[0]?.checkins[0] ? (
                  <>
                    <p className={styles.muted}>
                      A legutóbbi elérhető saját beszámoló.
                    </p>
                    <dl className={styles.summaryMetrics}>
                      {data[0].checkins[0].answerCodes?.map(
                        ({ metric, code }) => {
                          const definition = metrics.find(
                            ([key]) => key === metric,
                          );
                          return definition ? (
                            <div key={metric}>
                              <dt>{definition[1]}</dt>
                              <dd>{definition[2][code] ?? "Nincs válasz"}</dd>
                            </div>
                          ) : null;
                        },
                      )}
                    </dl>
                  </>
                ) : (
                  <p className={styles.muted}>
                    Ehhez a játékoshoz még nincs elérhető napi állapotjelzés.
                  </p>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setTab("timeline")}
                  >
                    A történet megnyitása
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() =>
                      setTab(
                        active.activeRole === "coach"
                          ? "reports"
                          : "conversations",
                      )
                    }
                  >
                    {active.activeRole === "coach"
                      ? "Riportok és tervek"
                      : "Beszélgetések"}
                  </button>
                </div>
              </section>
            )}
            {tab === "overview" && selectedPlayer && (
              <section className={`${styles.panel} workspace-section`}>
                <p className={styles.eyebrow}>A KÖZÖS TÖRTÉNET</p>
                <h2>A közelmúlt fontos eseményei</h2>
                <MetroTimeline
                  page={timeline}
                  records={historyItems}
                  playerName={selectedPlayer.displayName ?? "Játékos"}
                  playerId={selectedPlayer.id}
                  onLoadMore={() => void loadOlderTimeline()}
                  loadingMore={loadingOlder}
                />
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setTab("timeline")}
                >
                  A teljes idővonal megnyitása
                </button>
              </section>
            )}
            {tab === "checkin" && active.activeRole === "player" && (
              <section
                className={`${styles.panel} workspace-section`}
                data-area="timeline"
              >
                {checkinIndex === null ? (
                  <>
                    <p className={styles.eyebrow}>A TE NAPLÓD</p>
                    <h2>Egy rövid megálló magadra.</h2>
                    <p className={styles.muted}>
                      Öt rövid kérdés. Bármelyiket kihagyhatod, és a válaszaidat
                      később visszanézheted.
                    </p>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => {
                        setAnswers({});
                        setCheckinIndex(0);
                        setNotice("");
                      }}
                    >
                      Elkezdtem <span aria-hidden="true">→</span>
                    </button>
                  </>
                ) : (
                  <>
                    <p className={styles.eyebrow}>
                      NAPI ÁLLAPOTJELZÉS · {checkinIndex + 1}/{metrics.length}
                    </p>
                    <progress
                      className={styles.progress}
                      max={metrics.length}
                      value={checkinIndex + 1}
                      aria-label="Állapotjelzés előrehaladása"
                    />
                    <div className={styles.currentQuestionRow}>
                      <MetricIcon
                        metric={metrics[checkinIndex]?.[0] ?? "focus"}
                      />
                      <h2 className={styles.currentQuestion}>
                        {metrics[checkinIndex]?.[1]}
                      </h2>
                    </div>
                    <fieldset className={styles.questionChoices}>
                      <legend className={styles.srOnly}>
                        Válaszlehetőségek
                      </legend>
                      {metrics[checkinIndex]?.[2].map((choice, index) => (
                        <button
                          key={choice}
                          type="button"
                          className={styles.questionChoice}
                          aria-pressed={
                            answers[metrics[checkinIndex][0]] === index
                          }
                          disabled={busy}
                          onClick={() => answerCurrent(index)}
                        >
                          {choice}
                        </button>
                      ))}
                    </fieldset>
                    {busy && (
                      <p className={styles.muted} role="status">
                        Állapotjelzés mentése…
                      </p>
                    )}
                    {notice && (
                      <p className={styles.notice} role="status">
                        {notice}
                      </p>
                    )}
                    <div className={styles.questionActions}>
                      <button
                        type="button"
                        className={styles.textButton}
                        disabled={busy}
                        onClick={() => answerCurrent(null)}
                      >
                        Most kihagyom
                      </button>
                      <button
                        type="button"
                        className={styles.textButton}
                        disabled={busy}
                        onClick={() => {
                          setNotice("");
                          if (checkinIndex === 0) setCheckinIndex(null);
                          else setCheckinIndex(checkinIndex - 1);
                        }}
                      >
                        Vissza
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
            {tab === "checkin" &&
              active.activeRole !== "player" &&
              selectedPlayer && (
                <section className={styles.panel}>
                  <p className={styles.eyebrow}>A JÁTÉKOS SAJÁT BESZÁMOLÓI</p>
                  <h2>Állapotjelzések</h2>
                  <p className={styles.muted}>
                    A válaszok a játékos tapasztalatai. Ne kezeld őket külső
                    értékelésként.
                  </p>
                  {data[0]?.checkins.length ? (
                    data[0].checkins.map((item) => (
                      <article className={styles.dataCard} key={item.id}>
                        <h3>
                          {item.completedAt
                            ? new Date(item.completedAt).toLocaleDateString(
                                "hu-HU",
                              )
                            : "Dátum nélkül"}
                        </h3>
                        <dl className={styles.summaryMetrics}>
                          {item.answerCodes?.map(({ metric, code }) => {
                            const definition = metrics.find(
                              ([key]) => key === metric,
                            );
                            return definition ? (
                              <div key={metric}>
                                <dt>{definition[1]}</dt>
                                <dd>{definition[2][code] ?? "Nincs válasz"}</dd>
                              </div>
                            ) : null;
                          })}
                        </dl>
                      </article>
                    ))
                  ) : (
                    <p className={styles.emptyState}>
                      Még nincs a szerepkörödnek megosztott állapotjelzés.
                    </p>
                  )}
                </section>
              )}
            {(tab === "journal" ||
              (tab === "conversations" &&
                (active.activeRole === "parent" ||
                  active.activeRole === "coach"))) &&
              selectedPlayer && (
                <>
                  {tab === "journal" && (
                    <section className={styles.panel}>
                      <p className={styles.eyebrow}>
                        {active.activeRole === "coach"
                          ? "EDZŐI MEGFIGYELÉS"
                          : active.activeRole === "parent"
                            ? "SZÜLŐI NAPLÓ"
                            : "JÁTÉKOSNAPLÓ"}
                      </p>
                      <h2>
                        {active.activeRole === "player"
                          ? "Rögzíts egy saját bejegyzést"
                          : "Rögzíts egy észrevételt"}
                      </h2>
                      <label className={styles.label} htmlFor="observation">
                        {active.activeRole === "player"
                          ? "Mit szeretnél megőrizni a naplódban?"
                          : "Milyen konkrét helyzetet szeretnél megosztani?"}
                      </label>
                      <textarea
                        id="observation"
                        value={observation}
                        onChange={(event) => {
                          setObservation(event.target.value);
                          setObservationFeedback(null);
                        }}
                        rows={4}
                        maxLength={2000}
                      />
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={busy || !observation.trim()}
                        onClick={() => void submitObservation()}
                      >
                        Megfigyelés mentése
                      </button>
                      {observationFeedback && (
                        <p
                          ref={observationFeedbackRef}
                          className={styles.actionFeedback}
                          data-state={observationFeedback.kind}
                          role={
                            observationFeedback.kind === "error"
                              ? "alert"
                              : "status"
                          }
                        >
                          {observationFeedback.message}
                        </p>
                      )}
                    </section>
                  )}
                  {(active.activeRole === "parent" ||
                    active.activeRole === "coach") &&
                    tab === "conversations" && (
                      <section className={styles.panel}>
                        <p className={styles.eyebrow}>
                          {active.activeRole === "coach"
                            ? "EDZŐI SEGÍTSÉGKÉRÉS"
                            : "KÉRDÉS A HABINAK"}
                        </p>
                        <h2>
                          {active.activeRole === "coach"
                            ? "Mit szeretnél jobban megérteni a forrásokból?"
                            : "Mit szeretnél jobban megérteni?"}
                        </h2>
                        <label className={styles.label} htmlFor="question">
                          Kérdés
                        </label>
                        <textarea
                          id="question"
                          value={question}
                          onChange={(event) => {
                            setQuestion(event.target.value);
                            setQuestionFeedback(null);
                          }}
                          rows={3}
                          maxLength={1000}
                        />
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={
                            busy ||
                            !question.trim() ||
                            (active.activeRole !== "coach" && !questionSource)
                          }
                          onClick={() => void askQuestion()}
                        >
                          Kérdés elküldése a helyi AI-nak
                        </button>
                        {active.activeRole === "coach" ? (
                          <p className={styles.actionInfo} role="note">
                            A Habi a játékos legutóbbi, számodra elérhető
                            visszajelzéseit, bejegyzéseit és ellenőrzött
                            felmérési adatait veszi figyelembe. A választ a
                            forrásokkal és a bizonytalanságokkal együtt mutatja.
                          </p>
                        ) : !questionSource ? (
                          <p className={styles.actionInfo} role="note">
                            A kérdés elküldéséhez előbb a játékosnak ki kell
                            töltenie egy napi állapotjelzést. Utána a választ a
                            Habi ezen a helyen mutatja meg, az edzői ellenőrzés
                            után.
                          </p>
                        ) : null}
                        {questionFeedback && (
                          <p
                            ref={questionFeedbackRef}
                            className={styles.actionFeedback}
                            data-state={questionFeedback.kind}
                            role={
                              questionFeedback.kind === "error"
                                ? "alert"
                                : "status"
                            }
                          >
                            {questionFeedback.message}
                          </p>
                        )}
                        {questionJob && (
                          <section
                            ref={questionResultRef}
                            className={styles.questionResult}
                            aria-label="A kérés eredménye"
                          >
                            {submittedQuestion && (
                              <p className={styles.questionPrompt}>
                                <strong>Kérdésed:</strong> {submittedQuestion}
                              </p>
                            )}
                            <h3>
                              {questionJob.status === "queued"
                                ? "A kérdés várakozik"
                                : questionJob.status === "processing"
                                  ? "A Habi feldolgozza a kérdést"
                                  : questionJob.status === "review"
                                    ? "Edzői ellenőrzésre vár"
                                    : questionJob.status === "ready"
                                      ? "Elkészült a válasz"
                                      : questionJob.status === "cancelled"
                                        ? "A kérés megszakadt"
                                        : "A kérés feldolgozása megállt"}
                            </h3>
                            {questionStatusUnavailable ? (
                              <p role="status">
                                Most nem érjük el az állapotot. A kérésed
                                megmaradt, és újra próbáljuk ellenőrizni.
                              </p>
                            ) : questionJob.status === "queued" ? (
                              <p role="status">
                                A helyi feldolgozó elindulására vár. Ez még nem
                                hiba.
                              </p>
                            ) : questionJob.status === "processing" ? (
                              <p role="status">A helyi feldolgozó dolgozik.</p>
                            ) : questionJob.status === "review" ? (
                              <p role="status">
                                A válasz elkészült. Az edző ellenőrzi a
                                forrásokat; jóváhagyás után itt jelenik meg.
                              </p>
                            ) : questionJob.status === "ready" &&
                              questionAnswer?.answerState === "no_evidence" ? (
                              <p role="status">
                                A Habi nem talált ellenőrizhető, forrásolt
                                választ. Nem vont le következtetést.
                              </p>
                            ) : questionJob.status === "ready" &&
                              questionAnswer?.answer ? (
                              <div aria-live="polite">
                                {questionAnswer.answer.unknowns.length > 0 && (
                                  <p>
                                    {questionAnswer.answer.unknowns.join(" ")}
                                  </p>
                                )}
                                <ul>
                                  {questionAnswer.answer.claims.map((claim) => (
                                    <li key={claim.id}>{claim.text}</li>
                                  ))}
                                </ul>
                                <p className={styles.muted}>
                                  Forrásolt, edző által ellenőrzött válasz.
                                </p>
                              </div>
                            ) : questionJob.status === "ready" ? (
                              <p role="status">
                                A választ nem tettük közzé. Kérd meg az edzőt,
                                hogy ellenőrizze a forrásokat.
                              </p>
                            ) : (
                              <p role="alert">
                                A feladat nem készült el. Próbáld újra később,
                                vagy kérj segítséget az edzőtől.
                              </p>
                            )}
                          </section>
                        )}
                        <p className={styles.muted}>
                          A személyes válasz forrásolt, és edzői jóváhagyás után
                          jelenik meg.
                        </p>
                      </section>
                    )}
                </>
              )}
            {tab === "conversations" &&
              active.activeRole !== "parent" &&
              selectedPlayer && (
                <section className={styles.panel}>
                  <p className={styles.eyebrow}>KÖZÖS BESZÉLGETÉSEK</p>
                  <h2>Beszéljétek meg a helyzeteket</h2>
                  {threads.length ? (
                    <>
                      <label
                        className={styles.label}
                        htmlFor="conversation-select"
                      >
                        Beszélgetés
                      </label>
                      <select
                        id="conversation-select"
                        value={selectedThreadId}
                        onChange={(event) =>
                          setSelectedThreadId(event.target.value)
                        }
                      >
                        {threads.map((thread) => (
                          <option key={thread.id} value={thread.id}>
                            {new Date(
                              thread.latestActivityAt,
                            ).toLocaleDateString("hu-HU")}{" "}
                            · {thread.status === "open" ? "Nyitott" : "Lezárt"}
                          </option>
                        ))}
                      </select>
                      <ol className={styles.messageList} aria-live="polite">
                        {threadMessages.map((message) => (
                          <li key={message.id}>
                            <span
                              className={`role-badge actor-${message.recordedBy.role}`}
                            >
                              {roleLabel(message.recordedBy.role)}
                            </span>
                            <p>{message.text}</p>
                            <time dateTime={message.submittedAt}>
                              {new Date(message.submittedAt).toLocaleString(
                                "hu-HU",
                              )}
                            </time>
                          </li>
                        ))}
                      </ol>
                      {threads.find((thread) => thread.id === selectedThreadId)
                        ?.status === "open" && (
                        <>
                          <label
                            className={styles.label}
                            htmlFor="thread-message"
                          >
                            Üzenet
                          </label>
                          <textarea
                            id="thread-message"
                            rows={3}
                            maxLength={4000}
                            value={threadDraft}
                            onChange={(event) =>
                              setThreadDraft(event.target.value)
                            }
                          />
                          <button
                            className={styles.primary}
                            type="button"
                            disabled={busy || !threadDraft.trim()}
                            onClick={() => void sendThreadMessage()}
                          >
                            Üzenet küldése
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <p className={styles.emptyState}>
                      Még nincs közös beszélgetés. Szülői kérdésből vagy edzői
                      válaszból indulhat új beszélgetés.
                    </p>
                  )}
                </section>
              )}
            {tab === "reports" && selectedPlayer && (
              <section className={styles.panel}>
                <p className={styles.eyebrow}>
                  {active.activeRole === "coach"
                    ? "KÖZÖS TERVEK"
                    : "EDZŐI TERVEK"}
                </p>
                <h2>Megértésből következő lépés</h2>
                {active.activeRole === "coach" && (
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="plan-action">
                      Mi legyen a következő kipróbálható lépés?
                    </label>
                    <textarea
                      id="plan-action"
                      rows={3}
                      maxLength={1000}
                      value={planDraft}
                      onChange={(event) => setPlanDraft(event.target.value)}
                      placeholder="Egy konkrét, a játékossal egyeztetett teendő"
                    />
                    <button
                      className={styles.primary}
                      type="button"
                      disabled={busy || !planDraft.trim() || !questionSource}
                      onClick={() => void createSharedPlan()}
                    >
                      Közös terv készítése
                    </button>
                    {!questionSource && (
                      <p className={styles.actionInfo}>
                        Tervet akkor lehet létrehozni, ha van hozzá kapcsolható,
                        forrásolt játékos-beszámoló.
                      </p>
                    )}
                  </div>
                )}
                {plans.length ? (
                  plans.map((plan) => (
                    <article className={styles.dataCard} key={plan.id}>
                      <p className={styles.eyebrow}>
                        ÁLLAPOT:{" "}
                        {plan.status === "proposed"
                          ? "JÓVÁHAGYÁSRA VÁR"
                          : plan.status === "active"
                            ? "AKTÍV"
                            : plan.status.toLocaleUpperCase("hu-HU")}
                      </p>
                      {plan.actions.map((action) => (
                        <div key={action.id}>
                          <h3>{action.what}</h3>
                          <p>{action.why}</p>
                          <p className={styles.muted}>
                            Határidő:{" "}
                            {new Date(action.dueAt).toLocaleDateString("hu-HU")}{" "}
                            · Leállítási feltétel: {action.stopCondition}
                          </p>
                          {plan.status === "active" && (
                            <div className={styles.formGroup}>
                              <label
                                className={styles.label}
                                htmlFor={`followup-outcome-${plan.id}-${action.id}`}
                              >
                                Hogyan alakult a kipróbálás?
                              </label>
                              <select
                                id={`followup-outcome-${plan.id}-${action.id}`}
                                value={followupOutcome}
                                onChange={(event) =>
                                  setFollowupOutcome(
                                    event.target
                                      .value as typeof followupOutcome,
                                  )
                                }
                              >
                                <option value="helped">Segített</option>
                                <option value="not_helped">Nem segített</option>
                                <option value="adjust">Módosítani kell</option>
                                <option value="unknown">Még nem tudom</option>
                              </select>
                              <label
                                className={styles.label}
                                htmlFor={`followup-text-${plan.id}-${action.id}`}
                              >
                                Mit szeretnél hozzáfűzni?
                              </label>
                              <textarea
                                id={`followup-text-${plan.id}-${action.id}`}
                                rows={2}
                                maxLength={4000}
                                value={followupText}
                                onChange={(event) =>
                                  setFollowupText(event.target.value)
                                }
                              />
                              <button
                                className={styles.secondary}
                                type="button"
                                disabled={busy || !followupText.trim()}
                                onClick={() =>
                                  void submitFollowUp(plan, action.id)
                                }
                              >
                                Utánkövetés rögzítése
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {plan.status === "proposed" &&
                        (active.activeRole === "player" ||
                          active.activeRole === "parent") && (
                          <div className={styles.actions}>
                            <button
                              className={styles.primary}
                              type="button"
                              disabled={busy}
                              onClick={() => void decidePlan(plan, "accept")}
                            >
                              Elfogadom
                            </button>
                            <button
                              className={styles.secondary}
                              type="button"
                              disabled={busy}
                              onClick={() => void decidePlan(plan, "decline")}
                            >
                              Nem ezt javaslom
                            </button>
                          </div>
                        )}
                      <p className={styles.muted}>
                        Forrásolt terv · {plan.sourceRefs.length} kapcsolt
                        forrás · {plan.acceptances.length} válasz
                      </p>
                    </article>
                  ))
                ) : (
                  <p className={styles.emptyState}>
                    Még nincs rögzített közös terv.
                  </p>
                )}
                {active.activeRole === "coach" && (
                  <div className={styles.formGroup}>
                    <p className={styles.eyebrow}>EDZŐI ANYAG</p>
                    <h3>Ossz meg egy pontosan verziózott anyagot</h3>
                    <label className={styles.label} htmlFor="material-title">
                      Anyag címe
                    </label>
                    <input
                      id="material-title"
                      value={materialTitle}
                      maxLength={200}
                      onChange={(event) => setMaterialTitle(event.target.value)}
                    />
                    <label className={styles.label} htmlFor="material-text">
                      Az edzői anyag szövege
                    </label>
                    <textarea
                      id="material-text"
                      rows={5}
                      maxLength={8000}
                      value={materialText}
                      onChange={(event) => setMaterialText(event.target.value)}
                    />
                    <button
                      className={styles.secondary}
                      type="button"
                      disabled={
                        busy ||
                        !materialTitle.trim() ||
                        !materialText.trim() ||
                        !questionSource
                      }
                      onClick={() => void saveCoachMaterial()}
                    >
                      Piszkozat mentése forrással
                    </button>
                    {!questionSource && (
                      <p className={styles.actionInfo}>
                        Az anyag csak ellenőrizhető, kapcsolt forrással
                        menthető.
                      </p>
                    )}
                    {materials.map((material) => (
                      <article className={styles.dataCard} key={material.id}>
                        <p className={styles.eyebrow}>
                          EDZŐI ANYAG ·{" "}
                          {material.status === "published"
                            ? "MEGOSZTVA"
                            : "PISZKOZAT"}{" "}
                          · {material.version}. VERZIÓ
                        </p>
                        <h3>{material.title}</h3>
                        <p>{material.text}</p>
                        {material.status !== "published" && (
                          <button
                            className={styles.primary}
                            type="button"
                            disabled={busy}
                            onClick={() => void publishCoachMaterial(material)}
                          >
                            Megosztom a szülőkkel
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
            {tab === "assessments" &&
              active.activeRole === "coach" &&
              selectedPlayer && (
                <>
                  <section className={styles.panel}>
                    <p className={styles.eyebrow}>FELMÉRÉSEK ÉS EREDMÉNYEK</p>
                    <h2>Rögzítsd a forrást és ellenőrizd az adatokat</h2>
                    <p className={styles.muted}>
                      Tölts fel egy kérdőíveredményt, vagy vidd be kézzel a
                      mezőket az eredeti dokumentum alapján. Az értékeket a Habi
                      nem következteti ki.
                    </p>
                  </section>
                  <CoachReportWorkspace
                    playerId={selectedPlayer.id}
                    playerName={
                      selectedPlayer.displayName ?? "A kiválasztott játékos"
                    }
                    csrfToken={active.csrfToken}
                  />
                </>
              )}
            {tab === "knowledge" && active.activeRole === "coach" && (
              <section className={styles.panel}>
                <p className={styles.eyebrow}>TUDÁSTÁR</p>
                <h2>Segítség konkrét helyzetekhez</h2>
                <p className={styles.muted}>
                  Válassz egy kapcsolódó gyakorlatot. Ezek általános támogatási
                  ötletek, nem diagnózisok és nem egyéni értékelések.
                </p>
                <label className={styles.label} htmlFor="practice-search">
                  Keresés a tudástárban
                </label>
                <input
                  id="practice-search"
                  type="search"
                  value={practiceSearch}
                  onChange={(event) => setPracticeSearch(event.target.value)}
                />
                <div className={styles.knowledgeList}>
                  {(
                    practices.items as Array<{
                      id: string;
                      title: string;
                      what: string;
                      how: string;
                    }>
                  )
                    .filter((practice) =>
                      `${practice.title} ${practice.what} ${practice.how}`
                        .toLocaleLowerCase("hu-HU")
                        .includes(practiceSearch.toLocaleLowerCase("hu-HU")),
                    )
                    .map((practice) => (
                      <details className={styles.dataCard} key={practice.id}>
                        <summary>
                          <strong className={styles.knowledgeCardTitle}>
                            {practice.title}
                          </strong>
                          <span className={styles.practiceDescription}>
                            {practice.what}
                          </span>
                        </summary>
                        <p>{practice.how}</p>
                        <p className={styles.muted}>
                          Általános gyakorlat · a helyzethez való
                          alkalmazhatóságot az edzőnek kell mérlegelnie.
                        </p>
                      </details>
                    ))}
                </div>
              </section>
            )}
            {tab === "timeline" && (
              <section className={styles.panel}>
                <p className={styles.eyebrow}>ELŐZMÉNYEK</p>
                <h2>A napló eseményei</h2>
                <div className={styles.timelineFilter}>
                  <div>
                    <label className={styles.label} htmlFor="timeline-day">
                      Egy nap eseményei
                    </label>
                    <input
                      id="timeline-day"
                      type="date"
                      value={timelineDayFilter}
                      onChange={(event) => {
                        setTimelineDayFilter(event.target.value);
                        setLoadingOlder(false);
                      }}
                    />
                  </div>
                  {timelineDayFilter ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setTimelineDayFilter("")}
                    >
                      Teljes idővonal
                    </button>
                  ) : null}
                </div>
                {timelineDayFilter ? (
                  <article
                    className={styles.dataCard}
                    aria-label="Napi összefoglaló"
                  >
                    <p className={styles.eyebrow}>NAPI ÖSSZEFOGLALÓ</p>
                    <h3>
                      {new Date(
                        `${timelineDayFilter}T00:00:00`,
                      ).toLocaleDateString("hu-HU", { dateStyle: "full" })}
                    </h3>
                    {data[0]?.checkins.length ? (
                      data[0].checkins.map((item) => (
                        <div key={item.id}>
                          <p className={styles.muted}>
                            {item.completedAt
                              ? new Date(item.completedAt).toLocaleTimeString(
                                  "hu-HU",
                                  { hour: "2-digit", minute: "2-digit" },
                                )
                              : "Állapotjelzés"}
                          </p>
                          <dl className={styles.summaryMetrics}>
                            {item.answerCodes?.map(({ metric, code }) => {
                              const definition = metrics.find(
                                ([key]) => key === metric,
                              );
                              return definition ? (
                                <div key={metric}>
                                  <dt>{definition[1]}</dt>
                                  <dd>
                                    {definition[2][code] ?? "Nincs válasz"}
                                  </dd>
                                </div>
                              ) : null;
                            })}
                          </dl>
                        </div>
                      ))
                    ) : (
                      <p className={styles.muted}>
                        Ezen a napon nincs rögzített állapotjelzés.
                      </p>
                    )}
                  </article>
                ) : null}
                <div className="story-legend">
                  {(["player", "parent", "coach"] as const).map((role) => (
                    <span className={`role-badge actor-${role}`} key={role}>
                      {roleLabel(role)}
                    </span>
                  ))}
                </div>
                <MetroTimeline
                  page={timeline}
                  records={historyItems}
                  playerName={
                    selectedPlayer?.displayName ??
                    (active.activeRole === "player"
                      ? "Saját sportolói napló"
                      : "Kapcsolt játékos")
                  }
                  playerId={playerId}
                  onLoadMore={() => void loadOlderTimeline()}
                  loadingMore={loadingOlder}
                />
              </section>
            )}
            {tab === "player-tools" &&
              active.activeRole === "player" &&
              selectedPlayer && (
                <section className={styles.panel}>
                  <p className={styles.eyebrow}>SAJÁT SPORTOLÓI MUNKA</p>
                  <h2>Gyakorlatok és saját célok</h2>
                  <p className={styles.muted}>
                    Válassz egy rövid, nem klinikai gyakorlatot, rögzítsd a
                    tapasztalatodat, vagy tűzz ki egy saját célt. Minden mentés
                    a naplódhoz kapcsolódik.
                  </p>
                  <div className={styles.formGroup}>
                    <h3>{guidedConversationContent.labels.title}</h3>
                    <p className={styles.muted}>
                      Válassz egy témát. A beszélgetés a te válaszaid alapján,
                      előre megírt kérdésekkel halad; bármikor folytathatod
                      később.
                    </p>
                    {!guidedTreeDraft ? (
                      <>
                        <label
                          className={styles.label}
                          htmlFor="guided-topic-input"
                        >
                          Vagy írd le röviden, mi foglalkoztat
                        </label>
                        <textarea
                          id="guided-topic-input"
                          value={guidedTopicInput}
                          maxLength={1000}
                          rows={3}
                          onChange={(event) => {
                            setGuidedTopicInput(event.target.value);
                            setGuidedTopicSuggestions(null);
                          }}
                        />
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={busy || !guidedTopicInput.trim()}
                          onClick={suggestGuidedTopics}
                        >
                          Témák mutatása
                        </button>
                        {guidedTopicSuggestions && (
                          <p className={styles.muted} role="status">
                            Válaszd ki, melyik téma áll a legközelebb ahhoz,
                            amit leírtál. A témák sorrendje szövegegyezésen
                            alapul; Habi nem állapítja meg, mit érzel.
                          </p>
                        )}
                        <div className={styles.knowledgeList}>
                          {guidedConversationContent.categories
                            .filter(
                              (category) =>
                                !guidedTopicSuggestions ||
                                guidedTopicSuggestions.includes(category.id),
                            )
                            .sort((a, b) =>
                              guidedTopicSuggestions
                                ? guidedTopicSuggestions.indexOf(a.id) -
                                  guidedTopicSuggestions.indexOf(b.id)
                                : 0,
                            )
                            .map((category) => (
                              <button
                                className={styles.secondary}
                                key={category.id}
                                type="button"
                                disabled={busy || !experienceDraftsReady}
                                onClick={() =>
                                  void startGuidedTopic(category.id)
                                }
                              >
                                {category.label}
                              </button>
                            ))}
                        </div>
                      </>
                    ) : guidedTreePaused ? (
                      <article className={styles.dataCard}>
                        <p className={styles.eyebrow}>
                          FOLYTATHATÓ BESZÉLGETÉS
                        </p>
                        <h4>
                          {
                            guidedConversationContent.categories.find(
                              (category) =>
                                category.id === guidedTreeDraft.categoryId,
                            )?.label
                          }
                        </h4>
                        <p>
                          {guidedTreeDraft.turns.length} válaszod már mentve
                          van.
                        </p>
                        <div className={styles.actions}>
                          <button
                            className={styles.primary}
                            type="button"
                            onClick={() => setGuidedTreePaused(false)}
                          >
                            Folytatom
                          </button>
                          <button
                            className={styles.secondary}
                            type="button"
                            disabled={busy}
                            onClick={() => void discardGuidedTopic()}
                          >
                            Beszélgetés elvetése
                          </button>
                        </div>
                      </article>
                    ) : (
                      (() => {
                        const state =
                          resolveGuidedConversation(guidedTreeDraft);
                        if (!state) return null;
                        return (
                          <article className={styles.dataCard}>
                            <p className={styles.eyebrow}>
                              {state.category.label}
                            </p>
                            {guidedTreeDraft.opening && (
                              <p>
                                <strong>Te mondtad:</strong>{" "}
                                {guidedTreeDraft.opening}
                              </p>
                            )}
                            {state.turns.map(({ node, option }) => (
                              <div key={`${node.question}-${option.id}`}>
                                <p>
                                  <strong>{node.response}</strong>
                                </p>
                                <p>{node.question}</p>
                                <p className={styles.muted}>{option.label}</p>
                              </div>
                            ))}
                            {state.currentNode ? (
                              <>
                                <p>
                                  <strong>{state.currentNode.response}</strong>
                                </p>
                                <h4>{state.currentNode.question}</h4>
                                <div className={styles.knowledgeList}>
                                  {state.currentNode.options.map(
                                    (option: { id: string; label: string }) => (
                                      <button
                                        className={styles.secondary}
                                        key={option.id}
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          void answerGuidedTopic(option.id)
                                        }
                                      >
                                        {option.label}
                                      </button>
                                    ),
                                  )}
                                </div>
                              </>
                            ) : state.outcome ? (
                              <>
                                <h4>Habi válasza</h4>
                                <p>{state.outcome.text}</p>
                                <details className={styles.dataCard}>
                                  <summary>Beszélgetés összefoglalója</summary>
                                  <pre className={styles.summaryText}>
                                    {createGuidedConversationSummary(
                                      guidedTreeDraft,
                                    )}
                                  </pre>
                                </details>
                                <div className={styles.actions}>
                                  <button
                                    className={styles.primary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void saveGuidedTopic()}
                                  >
                                    Beszélgetés mentése a naplóba
                                  </button>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    onClick={() =>
                                      downloadGuidedTopicSummary(
                                        createGuidedConversationSummary(
                                          guidedTreeDraft,
                                        ) ?? "",
                                      )
                                    }
                                  >
                                    Beszélgetés letöltése
                                  </button>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void discardGuidedTopic()}
                                  >
                                    Beszélgetés elvetése
                                  </button>
                                </div>
                              </>
                            ) : null}
                            {!state.outcome && (
                              <button
                                className={styles.textButton}
                                type="button"
                                disabled={busy}
                                onClick={() => setGuidedTreePaused(true)}
                              >
                                Később folytatom
                              </button>
                            )}
                          </article>
                        );
                      })()
                    )}
                    {guidedTreeDraft && experienceDraftsReady && (
                      <p className={styles.actionFeedback} role="status">
                        {draftNotice ||
                          "A válaszaid piszkozatként mentve vannak."}
                      </p>
                    )}
                    {completedGuidedTreeSummary && (
                      <article className={styles.dataCard} role="status">
                        <p>A beszélgetés bekerült a naplódba.</p>
                        <button
                          className={styles.secondary}
                          type="button"
                          onClick={() =>
                            downloadGuidedTopicSummary(
                              completedGuidedTreeSummary,
                            )
                          }
                        >
                          Beszélgetés letöltése
                        </button>
                      </article>
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <h3>Vezetett beszélgetés</h3>
                    <p className={styles.muted}>
                      Válassz egy helyzetet, és haladj a saját tempódban. A
                      válaszaid minden lépésnél elmentődnek, így később innen
                      folytathatod.
                    </p>
                    {guidedSituationId && experienceDraftsReady && (
                      <p className={styles.actionFeedback} role="status">
                        {draftNotice || "A beszélgetés piszkozatként mentve."}
                      </p>
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <h3>Állapotjelzéseid alakulása</h3>
                    <p className={styles.muted}>
                      Csak a ténylegesen rögzített válaszokat mutatjuk. A
                      grafikon nem tölt ki hiányzó napokat, és nem értékel
                      téged.
                    </p>
                    <label className={styles.label} htmlFor="trend-period">
                      Időszak
                    </label>
                    <select
                      id="trend-period"
                      value={trendPeriod}
                      onChange={(event) =>
                        setTrendPeriod(
                          Number(event.target.value) as 14 | 28 | 42,
                        )
                      }
                    >
                      <option value={14}>14 nap</option>
                      <option value={28}>28 nap</option>
                      <option value={42}>42 nap</option>
                    </select>
                    {trendCheckins.length === 0 ? (
                      <p className={styles.emptyState}>
                        Ebben az időszakban még nincs megjeleníthető
                        állapotjelzés.
                      </p>
                    ) : (
                      <div className={styles.knowledgeList}>
                        {metrics.map(([metric, label, options]) => {
                          const points = trendCheckins
                            .map((checkin, index) => ({
                              id: checkin.id,
                              date: checkin.completedAt ?? "",
                              value: checkin.answerCodes?.find(
                                (answer) => answer.metric === metric,
                              )?.code,
                              index,
                            }))
                            .filter(
                              (point) =>
                                Number.isInteger(point.value) &&
                                point.value !== undefined,
                            );
                          const recordedSummary = summarizeRecordedAnswers(
                            points,
                            options,
                          );
                          return (
                            <article className={styles.dataCard} key={metric}>
                              <h4>{label}</h4>
                              {points.length ? (
                                <>
                                  <section
                                    className={styles.trendRouteViewport}
                                    aria-label={`${label}: ${points.length} rögzített válasz az elmúlt ${trendPeriod} napban`}
                                  >
                                    <ol
                                      className={styles.trendRoute}
                                      style={{ color: `var(--${metric})` }}
                                    >
                                      {points.map((point) => {
                                        const timestamp = new Date(point.date);
                                        const answer =
                                          options[point.value ?? 0];
                                        return (
                                          <li
                                            className={styles.trendStation}
                                            key={`${metric}-${point.id}`}
                                          >
                                            <span
                                              className={
                                                styles.trendStationMark
                                              }
                                              aria-hidden="true"
                                            />
                                            <time
                                              dateTime={point.date}
                                              className={
                                                styles.trendStationTime
                                              }
                                            >
                                              {timestamp.toLocaleString(
                                                "hu-HU",
                                                {
                                                  month: "short",
                                                  day: "numeric",
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                },
                                              )}
                                            </time>
                                            <span
                                              className={
                                                styles.trendStationAnswer
                                              }
                                            >
                                              {answer}
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ol>
                                  </section>
                                  <p className={styles.muted}>
                                    {recordedSummary}
                                  </p>
                                </>
                              ) : (
                                <p className={styles.muted}>
                                  Ehhez a kérdéshez nincs rögzített válasz ebben
                                  az időszakban.
                                </p>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <h3>Fájdalmat érzel?</h3>
                    <p className={styles.muted}>
                      Ez nem orvosi értékelés. Ha egy mozdulat fáj, ne ismételd
                      meg csak azért, hogy teljesítsd a feladatot. Szólj egy
                      megbízható felnőttnek; ha a fájdalom erős vagy
                      rosszabbodik, kérj tőle segítséget most.
                    </p>
                    {painStep === null ? (
                      <button
                        className={styles.secondary}
                        type="button"
                        onClick={startPainSupport}
                      >
                        Segítségkérő mondat összeállítása
                      </button>
                    ) : painStep < 3 ? (
                      <div className={styles.dataCard}>
                        <p className={styles.eyebrow}>
                          FÁJDALOMRÓL SZÓLÓ BESZÉLGETÉS · {painStep + 1}/3
                        </p>
                        <h4>
                          {
                            [
                              "Hol érzed a fájdalmat?",
                              "Mióta érzed?",
                              "Mikor jelentkezik?",
                            ][painStep]
                          }
                        </h4>
                        <div className={styles.knowledgeList}>
                          {[
                            [
                              "A lábamban vagy a lábfejemben.",
                              "A karomban vagy a vállamban.",
                              "Máshol, vagy nehéz megmondanom.",
                            ],
                            [
                              "Most kezdődött.",
                              "Ma már korábban is éreztem.",
                              "Több napja visszatér.",
                            ],
                            [
                              "Egy bizonyos mozdulatnál.",
                              "Mozgás közben többféle helyzetben.",
                              "Pihenés közben is, vagy nehéz megmondanom.",
                            ],
                          ][painStep]?.map((choice, index) => (
                            <button
                              className={styles.secondary}
                              type="button"
                              key={choice}
                              onClick={() => answerPainSupport(index)}
                            >
                              {choice}
                            </button>
                          ))}
                        </div>
                        <button
                          className={styles.secondary}
                          type="button"
                          onClick={() =>
                            painStep === 0
                              ? setPainStep(null)
                              : setPainStep(painStep - 1)
                          }
                        >
                          Vissza
                        </button>
                        <button
                          className={styles.secondary}
                          type="button"
                          onClick={() =>
                            setPainStep(painStep === 2 ? 3 : painStep + 1)
                          }
                        >
                          Kihagyom
                        </button>
                      </div>
                    ) : (
                      <div className={styles.dataCard}>
                        <h4>Segítségkérő mondat</h4>
                        <p>
                          Fájdalmat érzek
                          {painAnswers[0] !== undefined
                            ? ` ${
                                [
                                  "a lábamban vagy a lábfejemben",
                                  "a karomban vagy a vállamban",
                                  "máshol",
                                ][painAnswers[0] ?? 2]
                              }`
                            : ""}
                          {painPlaceDetail.trim()
                            ? ` (${painPlaceDetail.trim()})`
                            : ""}
                          {painAnswers[1] !== undefined
                            ? ` ${[
                                "Most kezdődött",
                                "Ma már korábban is éreztem",
                                "Több napja visszatér",
                              ][painAnswers[1] ?? 0].toLowerCase()}`
                            : ""}
                          {painAnswers[2] !== undefined
                            ? ` ${
                                [
                                  "egy bizonyos mozdulatnál",
                                  "mozgás közben többféle helyzetben",
                                  "pihenés közben is, vagy nem tudom pontosan mikor",
                                ][painAnswers[2] ?? 0]
                              }`
                            : ""}
                          . Szeretnék segítséget kérni.
                        </p>
                        <label
                          className={styles.label}
                          htmlFor="pain-place-detail"
                        >
                          Szeretnéd pontosítani, hol érzed? (nem kötelező)
                        </label>
                        <input
                          id="pain-place-detail"
                          maxLength={160}
                          value={painPlaceDetail}
                          onChange={(event) =>
                            setPainPlaceDetail(event.target.value)
                          }
                        />
                        <p className={styles.muted}>
                          Ezt a mondatot itt nem mentjük el, és nem küldjük el
                          senkinek. Te döntöd el, kinek mondod el.
                        </p>
                        <button
                          className={styles.secondary}
                          type="button"
                          onClick={startPainSupport}
                        >
                          Újrakezdem
                        </button>
                        <button
                          className={styles.secondary}
                          type="button"
                          onClick={() => setPainStep(null)}
                        >
                          Bezárom
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <h3>Beszéljünk egy konkrét helyzetről</h3>
                    <p className={styles.muted}>
                      A Habi vezeti ezt a rövid beszélgetést. A válaszaidból nem
                      készít diagnózist; a beszélgetés végén te döntöd el, mit
                      próbálsz ki.
                    </p>
                    {!guidedSituationId || guidedPaused ? (
                      <div className={styles.knowledgeList}>
                        {guidedSituationId && guidedPaused && (
                          <article className={styles.dataCard}>
                            <h4>
                              {journeyContent.situations.find(
                                (item) => item.id === guidedSituationId,
                              )?.opening ?? "A félretett beszélgetésed"}
                            </h4>
                            <p className={styles.muted}>
                              {guidedAnswers.length} válaszod már megvan.
                              Folytathatod innen, vagy másik helyzetet
                              választhatsz.
                            </p>
                            <button
                              className={styles.primary}
                              type="button"
                              onClick={() => setGuidedPaused(false)}
                            >
                              Folytatom
                            </button>
                          </article>
                        )}
                        {journeyContent.situations.map((situation) => (
                          <button
                            className={styles.secondary}
                            key={situation.id}
                            type="button"
                            disabled={busy || !experienceDraftsReady}
                            onClick={() => startGuidedSituation(situation.id)}
                          >
                            {situation.opening}
                          </button>
                        ))}
                      </div>
                    ) : (
                      (() => {
                        const situation = journeyContent.situations.find(
                          (item) => item.id === guidedSituationId,
                        );
                        if (!situation) return null;
                        const step = guidedAnswers.length;
                        const choices = [
                          situation.options,
                          journeyContent.chat.options,
                          [
                            situation.action,
                            journeyContent.chat.askChoice,
                            journeyContent.chat.reflectChoice,
                          ],
                        ][step];
                        const prompt = [
                          situation.question,
                          journeyContent.chat.question,
                          journeyContent.chat.lastQuestion,
                        ][step];
                        return (
                          <article className={styles.dataCard}>
                            <h4>{situation.opening}</h4>
                            {guidedSourceCheckinId &&
                              (() => {
                                const sourceCheckin =
                                  ownPlayerData?.checkins.find(
                                    (item) => item.id === guidedSourceCheckinId,
                                  );
                                const sourceMetric =
                                  guidedSituationId === "too-fast"
                                    ? "focus"
                                    : "mood";
                                const sourceAnswer =
                                  sourceCheckin?.answerCodes?.find(
                                    (item) => item.metric === sourceMetric,
                                  );
                                const sourceDefinition = sourceAnswer
                                  ? metrics.find(
                                      ([key]) => key === sourceAnswer.metric,
                                    )
                                  : null;
                                return (
                                  <p className={styles.muted}>
                                    Kapcsolódó állapotjelzés
                                    {sourceCheckin?.completedAt
                                      ? ` · ${new Date(sourceCheckin.completedAt).toLocaleString("hu-HU")}`
                                      : ""}
                                    {sourceAnswer && sourceDefinition
                                      ? ` · ${sourceDefinition[1]} — ${sourceDefinition[2][sourceAnswer.code] ?? "Nincs válasz"}`
                                      : " · A válasz részlete jelenleg nem érhető el."}
                                  </p>
                                );
                              })()}
                            {guidedAnswers.map((answer, index) => {
                              const priorChoices = [
                                situation.options,
                                journeyContent.chat.options,
                                [
                                  situation.action,
                                  journeyContent.chat.askChoice,
                                  journeyContent.chat.reflectChoice,
                                ],
                              ][index];
                              const priorPrompt = [
                                situation.question,
                                journeyContent.chat.question,
                                journeyContent.chat.lastQuestion,
                              ][index];
                              return (
                                <p key={priorPrompt}>
                                  <strong>{priorPrompt}</strong>{" "}
                                  {priorChoices[answer]}
                                </p>
                              );
                            })}
                            <button
                              className={styles.textButton}
                              type="button"
                              disabled={busy}
                              onClick={() => setGuidedPaused(true)}
                            >
                              Később folytatom
                            </button>
                            {choices && prompt ? (
                              <>
                                <h4>{prompt}</h4>
                                <div className={styles.knowledgeList}>
                                  {choices.map((choice, index) => (
                                    <button
                                      className={styles.secondary}
                                      key={choice}
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        answerGuidedSituation(index)
                                      }
                                    >
                                      {choice}
                                    </button>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <>
                                <h4>Habi válasza</h4>
                                <p>
                                  {guidedAnswers[2] === 0
                                    ? situation.action
                                    : guidedAnswers[2] === 1
                                      ? journeyContent.chat.goalAsk
                                      : journeyContent.labels.endReflect}
                                </p>
                                <div className={styles.actions}>
                                  <button
                                    className={styles.primary}
                                    type="button"
                                    disabled={busy || !experienceDraftsReady}
                                    onClick={() =>
                                      void saveGuidedConversation()
                                    }
                                  >
                                    Beszélgetés mentése a naplóba
                                  </button>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void startGuidedSituation("")
                                    }
                                  >
                                    Beszélgetés elvetése
                                  </button>
                                </div>
                              </>
                            )}
                          </article>
                        );
                      })()
                    )}
                  </div>
                  <form
                    className={styles.formGroup}
                    onSubmit={saveTrustedAdultPrep}
                  >
                    <h3>Beszélgetés előkészítése</h3>
                    <p className={styles.muted}>
                      Itt leírhatod, mit szeretnél elmondani egy általad
                      választott, megbízható felnőttnek. Előbb átnézheted és
                      javíthatod. Habi nem küldi el senkinek.
                    </p>
                    {!trustedAdultPreview ? (
                      <>
                        {(
                          [
                            ["person", "Kivel szeretnél beszélni?"],
                            ["topic", "Mit szeretnél elmondani?"],
                            ["ask", "Milyen segítség esne jól?"],
                          ] as const
                        ).map(([key, label]) => (
                          <div key={key}>
                            <label
                              className={styles.label}
                              htmlFor={`trusted-adult-${key}`}
                            >
                              {label}
                            </label>
                            <textarea
                              id={`trusted-adult-${key}`}
                              rows={2}
                              maxLength={1000}
                              value={trustedAdultPrep[key]}
                              onChange={(event) =>
                                setTrustedAdultPrep((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                            />
                          </div>
                        ))}
                        <button
                          className={styles.primary}
                          type="submit"
                          disabled={
                            busy ||
                            !Object.values(trustedAdultPrep).some((value) =>
                              value.trim(),
                            )
                          }
                        >
                          Előnézet és átnézés
                        </button>
                      </>
                    ) : (
                      <section
                        className={styles.dataCard}
                        aria-live="polite"
                        aria-label="Üzenet előnézete"
                      >
                        <h4>Így készítetted elő</h4>
                        <pre className={styles.preformatted}>
                          {createTrustedAdultMessage(trustedAdultPrep)}
                        </pre>
                        <p className={styles.muted}>
                          Ez csak előnézet. A Habi nem küldi el. Letöltheted,
                          vagy elmentheted a saját naplódba.
                        </p>
                        <div className={styles.actions}>
                          <button
                            className={styles.primary}
                            type="button"
                            disabled={busy}
                            onClick={() => void saveTrustedAdultPrepToDiary()}
                          >
                            Mentés a saját naplómba
                          </button>
                          <button
                            className={styles.secondary}
                            type="button"
                            onClick={downloadTrustedAdultPrep}
                          >
                            Letöltöm a szöveget
                          </button>
                          <button
                            className={styles.secondary}
                            type="button"
                            onClick={() => setTrustedAdultPreview(false)}
                          >
                            Vissza a szerkesztéshez
                          </button>
                        </div>
                      </section>
                    )}
                  </form>
                  <form className={styles.formGroup} onSubmit={saveOwnGoal}>
                    <label className={styles.label} htmlFor="own-goal">
                      Saját cél
                    </label>
                    <textarea
                      id="own-goal"
                      rows={2}
                      maxLength={500}
                      value={playerGoalDraft}
                      onChange={(event) =>
                        setPlayerGoalDraft(event.target.value)
                      }
                      placeholder="Például: edzés előtt elvégzem a bemelegítést."
                    />
                    <label className={styles.label} htmlFor="goal-review-days">
                      Mikor nézzünk rá újra?
                    </label>
                    <select
                      id="goal-review-days"
                      value={goalReviewDays}
                      onChange={(event) =>
                        setGoalReviewDays(event.target.value)
                      }
                    >
                      <option value="7">Egy hét múlva</option>
                      <option value="14">Két hét múlva</option>
                      <option value="28">Négy hét múlva</option>
                      <option value="none">Ne emlékeztess</option>
                    </select>
                    <button
                      className={styles.primary}
                      type="submit"
                      disabled={busy || !playerGoalDraft.trim()}
                    >
                      Cél mentése
                    </button>
                  </form>
                  <div className={styles.taskList}>
                    {ownPlayerData?.records
                      .filter((record) =>
                        ownGoals.some((goal) => goal.id === record.id),
                      )
                      .map((record) => {
                        const goal = ownGoalText(record);
                        const status = ownGoalStatus(record);
                        const reviewDate = latestGoalReviewDate(
                          ownPlayerData?.records ?? [],
                          record.id,
                        );
                        const superseded = status === "superseded";
                        const closed =
                          status === "closed" ||
                          status === "habit" ||
                          superseded;
                        const activeGoal = ownGoals.find(
                          (candidate) => ownGoalStatus(candidate) === "active",
                        );
                        return (
                          <article className={styles.taskCard} key={record.id}>
                            <p className={styles.eyebrow}>
                              {status === "paused"
                                ? "FÉLRETETT SAJÁT CÉL"
                                : superseded
                                  ? "LECSERÉLT SAJÁT CÉL"
                                  : status === "habit"
                                    ? "SZOKÁSKÉNT FOLYTATOTT CÉL"
                                    : closed
                                      ? "LEZÁRT SAJÁT CÉL"
                                      : "AKTÍV SAJÁT CÉL"}
                            </p>
                            <h3>{goal}</h3>
                            {reviewDate && status === "active" ? (
                              <p className={styles.muted}>
                                Újranézés: {reviewDate}
                                {isGoalReviewDue(reviewDate, localToday)
                                  ? " · esedékes"
                                  : ""}
                              </p>
                            ) : null}
                            <button
                              className={styles.secondary}
                              type="button"
                              onClick={() => {
                                setExportingGoalId(
                                  exportingGoalId === record.id
                                    ? ""
                                    : record.id,
                                );
                                setIncludeGoalHistory(false);
                              }}
                            >
                              Összefoglaló letöltése
                            </button>
                            {exportingGoalId === record.id && (
                              <div className={styles.formGroup}>
                                <label className={styles.label}>
                                  <input
                                    type="checkbox"
                                    checked={includeGoalHistory}
                                    onChange={(event) =>
                                      setIncludeGoalHistory(
                                        event.target.checked,
                                      )
                                    }
                                  />
                                  A cél módosításait, állapotait és
                                  visszatekintéseit is hozzáadom
                                </label>
                                <p className={styles.muted}>
                                  A fájl csak a saját eszközödre töltődik le.
                                </p>
                                <div className={styles.actions}>
                                  <button
                                    className={styles.primary}
                                    type="button"
                                    onClick={() => downloadOwnGoal(record)}
                                  >
                                    Letöltés
                                  </button>
                                  <button
                                    className={styles.textButton}
                                    type="button"
                                    onClick={() => setExportingGoalId("")}
                                  >
                                    Mégse
                                  </button>
                                </div>
                              </div>
                            )}
                            <time dateTime={record.occurredAt}>
                              Rögzítve:{" "}
                              {record.occurredAt
                                ? new Date(record.occurredAt).toLocaleString(
                                    "hu-HU",
                                    { dateStyle: "medium", timeStyle: "short" },
                                  )
                                : "—"}
                            </time>
                            {superseded && activeGoal ? (
                              <button
                                className={styles.secondary}
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void replaceOwnGoal(
                                    activeGoal.id,
                                    ownGoalText(record),
                                  )
                                }
                              >
                                Ezt a korábbi célt állítom vissza
                              </button>
                            ) : null}
                            {!closed && (
                              <>
                                <div className={styles.actions}>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setReplacingGoalId(
                                        replacingGoalId === record.id
                                          ? ""
                                          : record.id,
                                      );
                                      setReplacementGoalText("");
                                    }}
                                  >
                                    Cél cseréje
                                  </button>
                                </div>
                                {replacingGoalId === record.id && (
                                  <form
                                    onSubmit={saveOwnGoalReplacement}
                                    className={styles.formGroup}
                                  >
                                    <label
                                      className={styles.label}
                                      htmlFor={`replace-goal-${record.id}`}
                                    >
                                      Mi legyen az új cél?
                                    </label>
                                    <textarea
                                      id={`replace-goal-${record.id}`}
                                      rows={2}
                                      maxLength={500}
                                      value={replacementGoalText}
                                      onChange={(event) =>
                                        setReplacementGoalText(
                                          event.target.value,
                                        )
                                      }
                                      required
                                    />
                                    <div className={styles.actions}>
                                      <button
                                        className={styles.primary}
                                        type="submit"
                                        disabled={
                                          busy || !replacementGoalText.trim()
                                        }
                                      >
                                        Célcsere mentése
                                      </button>
                                      <button
                                        className={styles.textButton}
                                        type="button"
                                        onClick={() => setReplacingGoalId("")}
                                      >
                                        Mégse
                                      </button>
                                    </div>
                                  </form>
                                )}
                                <div className={styles.actions}>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setEditingGoalId(record.id);
                                      setEditingGoalText(goal);
                                    }}
                                  >
                                    Cél módosítása
                                  </button>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void setOwnGoalState(
                                        record.id,
                                        status === "paused"
                                          ? "active"
                                          : "paused",
                                      )
                                    }
                                  >
                                    {status === "paused"
                                      ? "Újra előveszem"
                                      : "Most félreteszem"}
                                  </button>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setReviewingGoalId(
                                        reviewingGoalId === record.id
                                          ? ""
                                          : record.id,
                                      );
                                      setGoalReviewNote("");
                                    }}
                                  >
                                    Visszatekintek
                                  </button>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void setOwnGoalState(record.id, "habit")
                                    }
                                  >
                                    Szokásként folytatom
                                  </button>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void setOwnGoalState(record.id, "closed")
                                    }
                                  >
                                    Ezt a célt lezárom
                                  </button>
                                </div>
                                {editingGoalId === record.id && (
                                  <form
                                    onSubmit={saveOwnGoalEdit}
                                    className={styles.formGroup}
                                  >
                                    <label
                                      className={styles.label}
                                      htmlFor={`edit-goal-${record.id}`}
                                    >
                                      A cél új szövege
                                    </label>
                                    <label
                                      className={styles.label}
                                      htmlFor={`review-cycle-${record.id}`}
                                    >
                                      Mikor nézzünk rá újra?
                                    </label>
                                    <select
                                      id={`review-cycle-${record.id}`}
                                      value={goalReviewDays}
                                      onChange={(event) =>
                                        setGoalReviewDays(event.target.value)
                                      }
                                    >
                                      <option value="7">Egy hét múlva</option>
                                      <option value="14">Két hét múlva</option>
                                      <option value="28">Négy hét múlva</option>
                                      <option value="none">
                                        Ne emlékeztess
                                      </option>
                                    </select>
                                    <textarea
                                      id={`edit-goal-${record.id}`}
                                      rows={2}
                                      maxLength={500}
                                      value={editingGoalText}
                                      onChange={(event) =>
                                        setEditingGoalText(event.target.value)
                                      }
                                    />
                                    <button
                                      className={styles.primary}
                                      type="submit"
                                      disabled={busy || !editingGoalText.trim()}
                                    >
                                      Módosítás mentése
                                    </button>
                                  </form>
                                )}
                                {reviewingGoalId === record.id && (
                                  <div className={styles.formGroup}>
                                    <label
                                      className={styles.label}
                                      htmlFor={`review-goal-${record.id}`}
                                    >
                                      Mi segített, mi volt nehéz, vagy min
                                      változtatnál?
                                    </label>
                                    <textarea
                                      id={`review-goal-${record.id}`}
                                      rows={3}
                                      maxLength={1000}
                                      value={goalReviewNote}
                                      onChange={(event) =>
                                        setGoalReviewNote(event.target.value)
                                      }
                                    />
                                    <button
                                      className={styles.primary}
                                      type="button"
                                      disabled={busy || !goalReviewNote.trim()}
                                      onClick={() =>
                                        void saveOwnGoalReview(record.id)
                                      }
                                    >
                                      Visszatekintés mentése
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </article>
                        );
                      })}
                  </div>
                  <form className={styles.formGroup} onSubmit={saveRoutine}>
                    <h3>Saját rutin</h3>
                    <p className={styles.muted}>
                      Rögzíthetsz egy egyszerű, általad választott rutint, és
                      naponta feljegyezheted, ha kipróbáltad.
                    </p>
                    <label className={styles.label} htmlFor="own-routine">
                      Mit szeretnél rendszeresen kipróbálni?
                    </label>
                    <input
                      id="own-routine"
                      maxLength={300}
                      value={routineDraft}
                      onChange={(event) => setRoutineDraft(event.target.value)}
                    />
                    <button
                      className={styles.primary}
                      type="submit"
                      disabled={busy || !routineDraft.trim()}
                    >
                      Rutin mentése
                    </button>
                    <div className={styles.knowledgeList}>
                      {ownPlayerData?.records
                        .filter((record) =>
                          record.text?.startsWith("Saját rutin:"),
                        )
                        .map((record) => {
                          const routine =
                            record.text?.slice("Saját rutin:".length).trim() ??
                            "";
                          const today = new Date().toLocaleDateString("hu-HU");
                          const doneToday = ownPlayerData.records.some(
                            (item) =>
                              item.text === `Rutin elvégezve: ${routine}` &&
                              item.occurredAt &&
                              new Date(item.occurredAt).toLocaleDateString(
                                "hu-HU",
                              ) === today,
                          );
                          return (
                            <article
                              className={styles.dataCard}
                              key={record.id}
                            >
                              <h4>{routine}</h4>
                              <button
                                className={styles.secondary}
                                type="button"
                                disabled={busy || doneToday}
                                onClick={() => void logRoutine(routine)}
                              >
                                {doneToday
                                  ? "Ma már feljegyezted"
                                  : "Ma kipróbáltam"}
                              </button>
                            </article>
                          );
                        })}
                    </div>
                  </form>
                  <form className={styles.formGroup} onSubmit={saveReflection}>
                    <h3>Napi és heti visszatekintés</h3>
                    <p className={styles.muted}>
                      Írd le, amit szeretnél megőrizni a napodból vagy a
                      hetedből. Bármelyik kérdést kihagyhatod; a kész
                      visszatekintés a naplódban jelenik meg.
                    </p>
                    {draftNotice ? (
                      <p
                        role="status"
                        aria-live="polite"
                        className={styles.muted}
                      >
                        {draftNotice}
                      </p>
                    ) : null}
                    <label className={styles.label} htmlFor="reflection-type">
                      Melyikre tekintenél vissza?
                    </label>
                    <select
                      id="reflection-type"
                      value={reflectionType}
                      disabled={!experienceDraftsReady}
                      onChange={(event) =>
                        setReflectionType(
                          event.target.value as "daily" | "weekly",
                        )
                      }
                    >
                      <option value="daily">A napom</option>
                      <option value="weekly">A hetem</option>
                    </select>
                    {(reflectionType === "daily"
                      ? ([
                          ["moment", "Mi maradt meg a mai napból?"],
                          ["helped", "Mi segített ma?"],
                        ] as const)
                      : ([
                          ["helped", "Mi segített ezen a héten?"],
                          ["hard", "Mi volt sok vagy nehéz?"],
                          ["next", "Mit próbálnál ki jövő héten?"],
                        ] as const)
                    ).map(([key, label]) => (
                      <div key={`${reflectionType}-${key}`}>
                        <label
                          className={styles.label}
                          htmlFor={`reflection-${reflectionType}-${key}`}
                        >
                          {label}
                        </label>
                        <textarea
                          id={`reflection-${reflectionType}-${key}`}
                          rows={2}
                          maxLength={1000}
                          disabled={!experienceDraftsReady}
                          value={reflectionAnswers[reflectionType][key]}
                          onChange={(event) =>
                            setReflectionAnswers((current) => ({
                              ...current,
                              [reflectionType]: {
                                ...current[reflectionType],
                                [key]: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                    <div className={styles.actions}>
                      <button
                        className={styles.secondary}
                        type="button"
                        disabled={!experienceDraftsReady}
                        onClick={() =>
                          void saveExperienceDraft(
                            reflectionType === "daily"
                              ? "daily-reflection"
                              : "weekly-reflection",
                            reflectionType === "daily"
                              ? reflectionAnswers.daily
                              : reflectionAnswers.weekly,
                          )
                        }
                      >
                        Piszkozat mentése
                      </button>
                      <button
                        className={styles.primary}
                        type="submit"
                        disabled={
                          busy ||
                          !experienceDraftsReady ||
                          !Object.values(
                            reflectionAnswers[reflectionType],
                          ).some((value) => value.trim())
                        }
                      >
                        Visszatekintés mentése a naplóba
                      </button>
                    </div>
                  </form>
                  <section
                    className={styles.formGroup}
                    aria-labelledby="reflection-history-heading"
                  >
                    <h3 id="reflection-history-heading">
                      Korábbi napi és heti visszatekintéseid
                    </h3>
                    {(ownPlayerData?.records ?? [])
                      .filter(
                        (record) =>
                          record.text?.startsWith("Napi visszatekintés ·") ||
                          record.text?.startsWith("Heti visszatekintés ·"),
                      )
                      .map((record) => (
                        <article className={styles.dataCard} key={record.id}>
                          <p>{record.text}</p>
                          <time dateTime={record.occurredAt}>
                            {record.occurredAt
                              ? new Date(record.occurredAt).toLocaleString(
                                  "hu-HU",
                                  { dateStyle: "medium", timeStyle: "short" },
                                )
                              : ""}
                          </time>
                        </article>
                      ))}
                    {recordCursor ? (
                      <button
                        className={styles.secondary}
                        type="button"
                        disabled={loadingOlderRecords}
                        onClick={() => void loadOlderRecords()}
                      >
                        {loadingOlderRecords
                          ? "Régebbi bejegyzések betöltése…"
                          : "Régebbi naplóbejegyzések betöltése"}
                      </button>
                    ) : (
                      <p className={styles.muted}>
                        {ownPlayerData?.records.length
                          ? "A betöltött naplóbejegyzések végére értél."
                          : "Még nincs naplóbejegyzés."}
                      </p>
                    )}
                  </section>
                  <form
                    className={styles.formGroup}
                    onSubmit={saveMonthlyReflection}
                  >
                    <h3>Havi visszatekintés</h3>
                    <p className={styles.muted}>
                      Gondolj az elmúlt négy hétre. A 16 rövid kérdést egyenként
                      nézheted végig; bármelyiket kihagyhatod.
                    </p>
                    <p className={styles.eyebrow}>
                      {monthlyReflectionStep <
                      monthlyReflectionContent.questions.length
                        ? `HAVI VISSZATEKINTÉS · ${monthlyReflectionStep + 1}/${monthlyReflectionContent.questions.length}`
                        : "HAVI VISSZATEKINTÉS · ÁTTEKINTÉS"}
                    </p>
                    {monthlyReflectionStep <
                    monthlyReflectionContent.questions.length ? (
                      <>
                        <p className={styles.muted}>
                          {
                            monthlyReflectionContent.questions[
                              monthlyReflectionStep
                            ]?.domain
                          }
                        </p>
                        <h4>
                          {
                            monthlyReflectionContent.questions[
                              monthlyReflectionStep
                            ]?.text
                          }
                        </h4>
                        <div className={styles.knowledgeList}>
                          {monthlyReflectionContent.choices.map(
                            (choice, index) => (
                              <button
                                className={styles.secondary}
                                type="button"
                                key={choice}
                                disabled={!experienceDraftsReady}
                                onClick={() =>
                                  answerMonthlyReflection(index + 1)
                                }
                              >
                                {choice}
                              </button>
                            ),
                          )}
                          <button
                            className={styles.secondary}
                            type="button"
                            disabled={!experienceDraftsReady}
                            onClick={() =>
                              answerMonthlyReflection("not-applicable")
                            }
                          >
                            {monthlyReflectionContent.notApplicable}
                          </button>
                          <button
                            className={styles.secondary}
                            type="button"
                            disabled={!experienceDraftsReady}
                            onClick={() => answerMonthlyReflection("skip")}
                          >
                            {monthlyReflectionContent.skipped}
                          </button>
                        </div>
                        {monthlyReflectionStep > 0 && (
                          <button
                            className={styles.secondary}
                            type="button"
                            disabled={!experienceDraftsReady}
                            onClick={() =>
                              setMonthlyReflectionStep((step) => step - 1)
                            }
                          >
                            Vissza az előző kérdéshez
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <h4>Válaszaid áttekintése</h4>
                        <div className={styles.knowledgeList}>
                          {monthlyReflectionContent.questions.map(
                            (item, index) => {
                              const answer = monthlyAnswers[index];
                              const label =
                                typeof answer === "number"
                                  ? monthlyReflectionContent.choices[answer - 1]
                                  : answer === "not-applicable"
                                    ? monthlyReflectionContent.notApplicable
                                    : monthlyReflectionContent.skipped;
                              return (
                                <article
                                  className={styles.dataCard}
                                  key={`${item.domain}-${item.text}`}
                                >
                                  <h4>{item.text}</h4>
                                  <p>{label}</p>
                                </article>
                              );
                            },
                          )}
                        </div>
                        <label
                          className={styles.label}
                          htmlFor="monthly-next-step"
                        >
                          Mire szeretnél figyelni a következő hónapban? (nem
                          kötelező)
                        </label>
                        <textarea
                          id="monthly-next-step"
                          rows={2}
                          maxLength={500}
                          disabled={!experienceDraftsReady}
                          value={monthlyNextStep}
                          onChange={(event) =>
                            setMonthlyNextStep(event.target.value)
                          }
                        />
                        <label className={styles.label} htmlFor="monthly-note">
                          Saját megjegyzés (nem kötelező)
                        </label>
                        <textarea
                          id="monthly-note"
                          rows={2}
                          maxLength={1000}
                          disabled={!experienceDraftsReady}
                          value={monthlyNote}
                          onChange={(event) =>
                            setMonthlyNote(event.target.value)
                          }
                        />
                        <div className={styles.actions}>
                          <button
                            className={styles.secondary}
                            type="button"
                            disabled={!experienceDraftsReady}
                            onClick={() =>
                              setMonthlyReflectionStep(
                                monthlyReflectionContent.questions.length - 1,
                              )
                            }
                          >
                            Vissza az utolsó kérdéshez
                          </button>
                          <button
                            className={styles.secondary}
                            type="button"
                            disabled={!experienceDraftsReady}
                            onClick={() =>
                              void saveExperienceDraft("monthly-reflection", {
                                step: monthlyReflectionStep,
                                answers: monthlyAnswers,
                                nextFocus: monthlyNextStep,
                                note: monthlyNote,
                              })
                            }
                          >
                            Piszkozat mentése
                          </button>
                          <button
                            className={styles.primary}
                            type="submit"
                            disabled={busy}
                          >
                            Havi visszatekintés mentése
                          </button>
                        </div>
                      </>
                    )}
                  </form>
                  <div className={styles.formGroup}>
                    <h3>Korábbi visszatekintések</h3>
                    {ownPlayerData?.records
                      .filter((record) =>
                        record.text?.startsWith("Havi visszatekintés"),
                      )
                      .map((record) => (
                        <article className={styles.dataCard} key={record.id}>
                          <p>{record.text}</p>
                          <time dateTime={record.occurredAt}>
                            {record.occurredAt
                              ? new Date(record.occurredAt).toLocaleString(
                                  "hu-HU",
                                  { dateStyle: "medium", timeStyle: "short" },
                                )
                              : ""}
                          </time>
                        </article>
                      ))}
                  </div>
                  <div className={styles.formGroup}>
                    <h3>Rövid gyakorlatok</h3>
                    <p className={styles.muted}>
                      Ezek általános ötletek; bármelyiket kihagyhatod, és
                      bármikor kérhetsz segítséget egy megbízható felnőttől.
                    </p>
                    <label className={styles.label} htmlFor="practice-feedback">
                      Saját megjegyzés a gyakorlathoz (nem kötelező)
                    </label>
                    <textarea
                      id="practice-feedback"
                      rows={2}
                      maxLength={1000}
                      value={practiceFeedback}
                      onChange={(event) =>
                        setPracticeFeedback(event.target.value)
                      }
                    />
                    <div className={styles.knowledgeList}>
                      {(
                        practices.items as Array<{
                          id: string;
                          title: string;
                          what: string;
                          how: string;
                        }>
                      ).map((practice) => (
                        <details className={styles.dataCard} key={practice.id}>
                          <summary>
                            <strong>{practice.title}</strong>
                            <span className={styles.practiceDescription}>
                              {practice.what}
                            </span>
                          </summary>
                          <p>{practice.how}</p>
                          <div className={styles.actions}>
                            {(
                              [
                                "Segített",
                                "Részben segített",
                                "Nem segített",
                              ] as const
                            ).map((rating) => (
                              <button
                                className={styles.secondary}
                                type="button"
                                key={rating}
                                disabled={busy}
                                onClick={() =>
                                  void savePracticeFeedback(practice, rating)
                                }
                              >
                                {rating}
                              </button>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <h3>Korábbi gyakorlataid</h3>
                    {ownPlayerData?.records
                      .filter(
                        (record) =>
                          record.kind === "diary" &&
                          record.text?.startsWith("Gyakorlat:"),
                      )
                      .map((record) => (
                        <article className={styles.dataCard} key={record.id}>
                          <p>{record.text}</p>
                          <time dateTime={record.occurredAt}>
                            {record.occurredAt
                              ? new Date(record.occurredAt).toLocaleString(
                                  "hu-HU",
                                  { dateStyle: "medium", timeStyle: "short" },
                                )
                              : ""}
                          </time>
                        </article>
                      ))}
                  </div>
                </section>
              )}
            {tab === "tasks-feedback" && selectedPlayer && (
              <section className={styles.panel}>
                {active.activeRole === "player" && (
                  <div className={styles.formGroup}>
                    <p className={styles.eyebrow}>A MAI ÁLLAPOTJELZÉSEDHEZ</p>
                    <p className={styles.eyebrow}>
                      A LEGUTÓBBI ÁLLAPOTJELZÉSEDHEZ
                    </p>
                    <h2>Válassz egy saját következő lépést</h2>
                    {!latestPlayerCheckin ? (
                      <p className={styles.emptyState}>
                        Először töltsd ki a napi állapotjelzésedet. Utána itt
                        választhatsz egy neked megfelelő következő lépést.
                      </p>
                    ) : !latestPlayerTask ? (
                      <>
                        <p className={styles.muted}>
                          A válaszaid alapján Habi nem dönt helyetted. Válaszd
                          azt, ami ma neked hasznosnak tűnik.
                        </p>
                        <div className={styles.knowledgeList}>
                          {[
                            "Átgondolom, melyik válaszom a legfontosabb ma.",
                            "Elmondom egy megbízható felnőttnek, hogyan vagyok.",
                            "Kiválasztok egy rövid gyakorlatot.",
                          ].map((action) => (
                            <button
                              className={styles.secondary}
                              type="button"
                              key={action}
                              disabled={busy}
                              onClick={() =>
                                void chooseDailyPlayerTask(
                                  latestPlayerCheckin.id,
                                  action,
                                )
                              }
                            >
                              {action}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <article className={styles.taskCard}>
                        <h3>
                          {latestPlayerTask.text
                            ?.split(" · ")
                            .slice(2)
                            .join(" · ")}
                        </h3>
                        <p className={styles.muted}>
                          {latestPlayerTaskDone
                            ? "Ezt a lépést elvégezted."
                            : "Akkor jelöld késznek, amikor neked megfelel."}
                        </p>
                        {!latestPlayerTaskDone && (
                          <button
                            className={styles.primary}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void completeDailyPlayerTask(
                                latestPlayerCheckin.id,
                              )
                            }
                          >
                            Elvégeztem
                          </button>
                        )}
                      </article>
                    )}
                  </div>
                )}
                <p className={styles.eyebrow}>KÖZÖS MUNKA</p>
                <h2>Feladatok és visszajelzések</h2>
                <p className={styles.muted}>
                  A közös tervhez kapcsolt teendők, döntések és utánkövetések.
                  Minden visszajelzés a naplóban is megjelenik.
                </p>
                {tasksLoading ? (
                  <p className={styles.emptyState} role="status">
                    A feladatok és visszajelzések betöltése…
                  </p>
                ) : plans.length === 0 ? (
                  <p className={styles.emptyState}>
                    Még nincs közös feladat. Az edző által készített terv itt
                    jelenik meg, miután kapcsolódó játékos vagy szülő elfogadta.
                  </p>
                ) : (
                  <div className={styles.taskList}>
                    {plans.flatMap((plan) =>
                      plan.actions.map((action) => {
                        const feedback = followUps.filter(
                          (item) =>
                            item.planRef.id === plan.id &&
                            item.actionId === action.id,
                        );
                        const outcomeLabel: Record<string, string> = {
                          helped: "Segített",
                          not_helped: "Nem segített",
                          unknown: "Még nem tudom",
                          adjust: "Módosítani kell",
                        };
                        return (
                          <article
                            className={styles.taskCard}
                            key={`${plan.id}:${action.id}`}
                          >
                            <div className={styles.taskHeading}>
                              <div>
                                <p className={styles.eyebrow}>
                                  {plan.status === "proposed"
                                    ? "JÓVÁHAGYÁSRA VÁR"
                                    : plan.status === "active"
                                      ? "AKTÍV FELADAT"
                                      : "LEZÁRT TERV"}
                                </p>
                                <h3>{action.what}</h3>
                              </div>
                              <time dateTime={action.dueAt}>
                                Határidő:{" "}
                                {new Date(action.dueAt).toLocaleDateString(
                                  "hu-HU",
                                )}
                              </time>
                            </div>
                            <p>{action.why}</p>
                            <p className={styles.muted}>
                              Leállítási feltétel: {action.stopCondition}
                            </p>
                            {plan.status === "proposed" &&
                              (active.activeRole === "player" ||
                                active.activeRole === "parent") && (
                                <div className={styles.actions}>
                                  <button
                                    className={styles.primary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void decidePlan(plan, "accept")
                                    }
                                  >
                                    Elfogadom
                                  </button>
                                  <button
                                    className={styles.secondary}
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void decidePlan(plan, "decline")
                                    }
                                  >
                                    Nem ezt javaslom
                                  </button>
                                </div>
                              )}
                            {plan.status === "active" && (
                              <div className={styles.formGroup}>
                                <label
                                  className={styles.label}
                                  htmlFor={`task-outcome-${plan.id}-${action.id}`}
                                >
                                  Hogyan alakult?
                                </label>
                                <select
                                  id={`task-outcome-${plan.id}-${action.id}`}
                                  value={followupOutcome}
                                  onChange={(event) =>
                                    setFollowupOutcome(
                                      event.target
                                        .value as typeof followupOutcome,
                                    )
                                  }
                                >
                                  <option value="helped">Segített</option>
                                  <option value="not_helped">
                                    Nem segített
                                  </option>
                                  <option value="adjust">
                                    Módosítani kell
                                  </option>
                                  <option value="unknown">Még nem tudom</option>
                                </select>
                                <label
                                  className={styles.label}
                                  htmlFor={`task-feedback-${plan.id}-${action.id}`}
                                >
                                  Visszajelzés
                                </label>
                                <textarea
                                  id={`task-feedback-${plan.id}-${action.id}`}
                                  rows={3}
                                  maxLength={4000}
                                  value={followupText}
                                  onChange={(event) =>
                                    setFollowupText(event.target.value)
                                  }
                                />
                                <button
                                  className={styles.primary}
                                  type="button"
                                  disabled={busy || !followupText.trim()}
                                  onClick={() =>
                                    void submitFollowUp(plan, action.id)
                                  }
                                >
                                  Visszajelzés mentése
                                </button>
                              </div>
                            )}
                            <div className={styles.feedbackList}>
                              <h4>Korábbi visszajelzések</h4>
                              {feedback.length ? (
                                feedback.map((item) => (
                                  <article key={item.id}>
                                    <p>
                                      <strong>
                                        {outcomeLabel[item.outcome] ??
                                          item.outcome}
                                      </strong>
                                      {" · "}
                                      <time dateTime={item.occurredAt}>
                                        {new Date(
                                          item.occurredAt,
                                        ).toLocaleString("hu-HU", {
                                          dateStyle: "medium",
                                          timeStyle: "short",
                                        })}
                                      </time>
                                    </p>
                                    <p>{item.text}</p>
                                  </article>
                                ))
                              ) : (
                                <p className={styles.muted}>
                                  Ehhez a feladathoz még nincs visszajelzés.
                                </p>
                              )}
                            </div>
                          </article>
                        );
                      }),
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
