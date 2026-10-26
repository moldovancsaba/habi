"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./workspace.module.css";
import MetroTimeline, { ActorBadge, type TimelinePage } from "./metro-timeline";
import CoachReportWorkspace from "./coach-report-workspace";
import practices from "../lib/content/practices-v1.json";

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
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checkinIndex, setCheckinIndex] = useState<number | null>(null);
  const [observation, setObservation] = useState("");
  const [question, setQuestion] = useState("");
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
  const [notice, setNotice] = useState("");
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
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [planDraft, setPlanDraft] = useState("");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialText, setMaterialText] = useState("");
  const [followupText, setFollowupText] = useState("");
  const [followupOutcome, setFollowupOutcome] = useState<
    "helped" | "not_helped" | "unknown" | "adjust"
  >("unknown");
  const [practiceSearch, setPracticeSearch] = useState("");

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
    return () => controller.abort();
  }, [app, selectedPlayerId, tab]);

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
  }, [selectedThreadId, tab]);

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
  }, []);

  useEffect(() => {
    if (app.state !== "ready" || !selectedPlayerId) {
      setData([]);
      setTimeline(null);
      return;
    }
    setData([]);
    setTimeline(null);
    const player = players.find((item) => item.id === selectedPlayerId);
    if (!player) return;
    const controller = new AbortController();
    void Promise.all([
      fetch(
        `/api/v1/players/${encodeURIComponent(selectedPlayerId)}/checkin-results`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        },
      ),
      fetch(`/api/v1/players/${encodeURIComponent(selectedPlayerId)}/records`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      }),
      fetch(
        `/api/v1/timeline?playerId=${encodeURIComponent(selectedPlayerId)}&limit=50`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        },
      ),
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
  }, [app, players, selectedPlayerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = app.state === "ready" ? app.me : null;
  const playerId = selectedPlayerId;
  const selectedPlayer =
    players.find((player) => player.id === playerId) ?? null;
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
        ]
      : active?.activeRole === "parent"
        ? [
            { id: "overview", label: "Áttekintés" },
            { id: "journal", label: "Napló" },
            { id: "conversations", label: "Beszélgetések" },
            { id: "timeline", label: "Idővonal" },
            { id: "reports", label: "Tervek" },
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
      setNotice("A mai állapotjelzésed elmentve.");
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
      setNotice("Az üzenet bekerült a beszélgetésbe.");
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
    if (!source) {
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
            sourceRefs: [{ id: source.id, revision: source.revision }],
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
      setNotice("Az utánkövetés rögzítve, a tervhez kapcsolva.");
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
          {notice && (
            <p className={styles.signInAlert} role="alert">
              {notice}
            </p>
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
            <div className="story-legend">
              {(["player", "parent", "coach"] as const).map((role) => (
                <span className={`role-badge actor-${role}`} key={role}>
                  {roleLabel(role)}
                </span>
              ))}
            </div>
            <p className={styles.eyebrow}>MEGHÍVÓ SZÜKSÉGES</p>
            <h1>Még nincs Habi-szerepköröd.</h1>
            <p>
              Kérj játékos, szülői vagy edzői meghívót a Habi
              adminisztrátorától. A szerepkör a saját ellenőrzött
              SSO-identitásodhoz kapcsolódik.
            </p>
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
              <a className={styles.navLink} href="/legacy">
                Feladatok és visszajelzések
              </a>
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
              <p className={styles.notice} role="status">
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
                          disabled={busy || !question.trim() || !questionSource}
                          onClick={() => void askQuestion()}
                        >
                          Kérdés elküldése a helyi AI-nak
                        </button>
                        {!questionSource && (
                          <p className={styles.actionInfo} role="note">
                            A kérdés elküldéséhez előbb a játékosnak ki kell
                            töltenie egy napi állapotjelzést. Utána a választ a
                            Habi ezen a helyen mutatja meg, az edzői ellenőrzés
                            után.
                          </p>
                        )}
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
          </>
        )}
      </div>
    </main>
  );
}
