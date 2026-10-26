"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./workspace.module.css";
import MetroTimeline, { type TimelinePage } from "./metro-timeline";

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
  const [tab, setTab] = useState<"today" | "history">("today");

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
      if (!response.ok) throw new Error(result?.code ?? "SCOPE_SWITCH_FAILED");
      setData([]);
      setTimeline(null);
      setPlayers([]);
      setSelectedPlayerId("");
      setCheckinIndex(null);
      setAnswers({});
      setObservation("");
      setQuestion("");
      setObservationFeedback(null);
      setQuestionFeedback(null);
      setQuestionJob(null);
      setQuestionAnswer(null);
      setQuestionStatusUnavailable(false);
      setTab("today");
      setNotice("Szerepkör módosítva.");
      await load();
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
            kind: "observation",
            text: observation.trim(),
            occurredAt: new Date().toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            sourceKind:
              active.activeRole === "parent" ? "proxy" : "observation",
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

  async function askQuestion() {
    if (active?.activeRole !== "parent" || !playerId || !question.trim())
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
            <a className={styles.primary} href="/admin">
              Adminfelület megnyitása
            </a>
            <a className={styles.secondary} href="/admin#my-access">
              Szerepkör kérése a saját fiókomhoz
            </a>
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
              <button
                type="button"
                className={tab === "today" ? styles.navActive : ""}
                onClick={() => setTab("today")}
              >
                Áttekintés
              </button>
              <button
                type="button"
                className={tab === "history" ? styles.navActive : ""}
                onClick={() => setTab("history")}
              >
                Előzmények
              </button>
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
                <span className={`role-badge actor-${active.activeRole}`}>
                  {roleLabel(active.activeRole)}
                </span>
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
            {tab === "today" && active.activeRole === "player" && (
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
                    <h2 className={styles.currentQuestion}>
                      {metrics[checkinIndex]?.[1]}
                    </h2>
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
            {tab === "today" &&
              (active.activeRole === "parent" ||
                active.activeRole === "coach") &&
              selectedPlayer && (
                <>
                  <section className={styles.panel}>
                    <p className={styles.eyebrow}>MEGFIGYELÉS</p>
                    <h2>Rögzíts egy észrevételt</h2>
                    <label className={styles.label} htmlFor="observation">
                      Mit figyeltél meg?
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
                  {active.activeRole === "parent" && (
                    <section className={styles.panel}>
                      <p className={styles.eyebrow}>KÉRDÉS A HABINAK</p>
                      <h2>Mit szeretnél jobban megérteni?</h2>
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
            {tab === "history" && (
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
