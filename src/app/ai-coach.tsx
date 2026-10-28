"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AiAnswerProgress, { type AnswerProgress } from "./ai-answer-progress";
import { productRequest, commandMessage } from "./product-request";
import styles from "./ai-coach.module.css";
export type CoachContext = {
  page: string;
  kind: string;
  id: string;
  revision: number;
  days?: number;
  metric?: string;
  from?: string;
  to?: string;
  actorRole?: string;
  eventKind?: string;
};
type Ref = { id: string; revision: number; span: null };
type Thread = {
  id: string;
  revision: number;
  opening: string;
  context: CoachContext;
  updatedAt: string;
};
type Claim = { id: string; text: string; kind: string; evidenceRefs: Ref[] };
type Turn = {
  id: string;
  revision: number;
  question: string;
  status: string;
  answer: null | {
    claims: Claim[];
    unknowns: string[];
    clarifyingQuestions: string[];
  };
  guidance?: {
    claim: Claim;
    unknowns: string[];
    questions: string[];
    asOfDate: string;
  } | null;
  progress?: AnswerProgress;
  answerMode?: string;
  conversation?: {
    repeated: boolean;
    suppressRepeatedAnswer: boolean;
    lead: string;
    questions: string[];
  } | null;
  pendingReview: boolean;
  reviewState: string;
  reviewRationale: string;
  sourceState: string;
  failureReason?: string | null;
  sources: {
    id: string;
    revision: number;
    title: string;
    at: string;
    role: string;
  }[];
};
type Fact = {
  id: string;
  category: string;
  text: string;
  at: string;
  sourceRefs: Ref[];
  counterEvidence: Ref[];
  status: string;
};
type Recommendation = {
  id: string;
  practiceId: string;
  title: string;
  what: string;
  why: string;
  uncertainty: string;
  reviewAt: string;
  sourceRefs: Ref[];
  feedback: string;
};
type Profile = {
  revision: number;
  updatedAt: string;
  sourceCount: number;
  coverageFrom: string | null;
  coverageTo: string | null;
  facts: Fact[];
  recommendations: Recommendation[];
};
const CoachEntry = createContext<null | {
  page: string;
  open: (context?: Partial<CoachContext>) => void;
}>(null);
export function SmartToy() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="24"
      height="24"
    >
      <path
        d="M11 2h2v3h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h5V2Zm-5 5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H6Zm1 3h3v3H7v-3Zm7 0h3v3h-3v-3ZM8 16h8v2H8v-2ZM0 10h2v6H0v-6Zm22 0h2v6h-2v-6Z"
        fill="currentColor"
      />
    </svg>
  );
}
export function AiCoachButton({
  context,
  label = "Kérdezd a Habi AI-edzőt",
}: {
  context?: Partial<CoachContext>;
  label?: string;
}) {
  const entry = useContext(CoachEntry);
  if (!entry) return null;
  return (
    <button
      type="button"
      className={styles.contextButton}
      aria-label={label}
      title={label}
      onClick={() => entry.open(context)}
    >
      <SmartToy />
      <span className={styles.buttonText}>AI-edző</span>
    </button>
  );
}
export function AiCoachProvider({
  children,
  actorId,
  role,
  playerId,
  csrfToken,
  page,
  filters = {},
}: {
  children: ReactNode;
  actorId: string | null;
  role: string;
  playerId: string | null;
  csrfToken: string;
  page: string;
  filters?: Partial<CoachContext>;
}) {
  const [selection, setSelection] = useState<{
    owner: string;
    target: CoachContext;
  } | null>(null);
  const identity = `${actorId}:${role}:${playerId}`;
  const context = selection?.owner === identity ? selection.target : null;
  const open = (input?: Partial<CoachContext>) =>
    setSelection({
      owner: identity,
      target: {
        page,
        kind: "page",
        id: page,
        revision: 1,
        ...filters,
        ...input,
      },
    });
  const enabled = !!actorId && !!playerId;
  return (
    <CoachEntry.Provider value={enabled ? { page, open } : null}>
      {children}
      {enabled && (
        <button
          type="button"
          className={styles.launcher}
          onClick={() => open()}
          aria-label="AI-edző megnyitása"
        >
          <SmartToy />
          <span>AI-edző</span>
        </button>
      )}
      {enabled && context && (
        <CoachPanel
          key={identity}
          role={role}
          playerId={playerId as string}
          csrfToken={csrfToken}
          context={context}
          onClose={() => setSelection(null)}
        />
      )}
    </CoachEntry.Provider>
  );
}
const categoryLabels: Record<string, string> = {
  known: "Amit rögzítettél",
  recent: "Legutóbbi beszámolók",
  pattern: "Ismétlődések a mentett válaszokban",
  helped: "Ami a visszajelzés szerint segített",
  question: "Nyitott kérdések",
};
const feedbackLabels: Record<string, string> = {
  try: "Kipróbálom",
  adapt: "Módosítanám",
  dismiss: "Most nem kérem",
  helped: "Segített",
  not_helped: "Nem segített",
  not_yet: "Még nem próbáltam",
};
function CoachPanel({
  role,
  playerId,
  csrfToken,
  context,
  onClose,
}: {
  role: string;
  playerId: string;
  csrfToken: string;
  context: CoachContext;
  onClose: () => void;
}) {
  const composer = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    end = useRef<HTMLDivElement>(null);
  const base = `/api/v1/players/${encodeURIComponent(playerId)}`;
  const [tab, setTab] = useState("chat"),
    [threads, setThreads] = useState<Thread[]>([]),
    [thread, setThread] = useState<Thread | null>(null),
    [turns, setTurns] = useState<Turn[]>([]),
    [older, setOlder] = useState<string | null>(null),
    [olderThreads, setOlderThreads] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null),
    [reviews, setReviews] = useState<Turn[]>([]),
    [question, setQuestion] = useState(""),
    [memory, setMemory] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [source, setSource] = useState<{
      title: string;
      text: string;
      at: string;
      role: string;
    } | null>(null),
    [factLimit, setFactLimit] = useState(20);
  const [editing, setEditing] = useState<Fact | null>(null),
    [correction, setCorrection] = useState(""),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({}),
    [feedbackNotes, setFeedbackNotes] = useState<Record<string, string>>({});
  const [openedSources, setOpenedSources] = useState<Set<string>>(new Set());
  const requestEpoch = useRef(0);
  const pendingTurns = turns.filter((t) => t.status === "queued");
  const activeProgress =
    pendingTurns.find(
      (t) => t.progress && !["queued", "retry_wait"].includes(t.progress.phase),
    )?.progress ?? pendingTurns[0]?.progress;
  const liveStatus = (
    {
      queued: "Feldolgozásra vár",
      retrieving: "Források betöltése",
      provider_wait: "Várakozás az AI-ra",
      generating: "A válasz készül",
      repairing: "Automatikus újragenerálás",
      checking: "Források ellenőrzése",
      saving: "A válasz mentése",
      retry_wait: "Újrapróbálásra vár",
      reconnecting: "Újracsatlakozás",
    } as Record<string, string>
  )[activeProgress?.phase ?? "queued"];
  const pending = pendingTurns.length > 0;
  const request = useCallback(
    (
      path: string,
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
    ) => productRequest(base + path, csrfToken, body, method),
    [base, csrfToken],
  );
  async function refresh(id: string) {
    const body = await request(`/ai-coach/${encodeURIComponent(id)}`);
    setThread(body.thread);
    setTurns(body.items);
    setOlder(body.nextCursor);
  }
  async function refreshProfile() {
    const body = await request("/ai-profile");
    setProfile(body.profile);
  }
  async function refreshReviews() {
    if (role === "coach") setReviews((await request("/ai-reviews")).items);
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    requestEpoch.current++;
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(commandMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function send(text: string, newThread = false) {
    const result = await request("/ai-coach", {
      threadId: newThread ? null : (thread?.id ?? null),
      question: text,
      context,
      expectedRevision: newThread ? 0 : (thread?.revision ?? 0),
    });
    await refresh(result.threadId);
    const list = await request("/ai-coach");
    setThreads(list.items);
    setOlderThreads(list.nextCursor);
    setQuestion("");
  }
  const contextKey = JSON.stringify(context);
  // Cancel read results from a closed panel; writes remain idempotent and recoverable from history.
  useEffect(() => {
    const node = dialog.current,
      previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    return () => {
      node?.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    let current = true;
    setBusy(true);
    setNotice("");
    setThread(null);
    setTurns([]);
    setSource(null);
    void (async () => {
      const list = await request("/ai-coach");
      if (!current) return;
      setThreads(list.items);
      setOlderThreads(list.nextCursor);
      const match = list.items.find(
        (t: Thread) => JSON.stringify(t.context) === contextKey,
      );
      if (match) {
        const body = await request(`/ai-coach/${match.id}`);
        if (!current) return;
        setThread(body.thread);
        setTurns(body.items);
        setOlder(body.nextCursor);
      } else {
        const result = await request("/ai-coach", {
          threadId: null,
          question: "",
          context,
          expectedRevision: 0,
        });
        if (!current) return;
        const body = await request(`/ai-coach/${result.threadId}`);
        if (!current) return;
        setThread(body.thread);
        setTurns(body.items);
        setOlder(body.nextCursor);
      }
      const body = await request("/ai-profile");
      if (current) setProfile(body.profile);
    })()
      .catch((error) => {
        if (current) setNotice(commandMessage(error));
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [contextKey, context, request]); // Scope changes remount the panel.
  useEffect(() => {
    if (!thread?.id || !pending) return;
    let current = true;
    const timer = setInterval(() => {
      const epoch = requestEpoch.current;
      void request(`/ai-coach/${thread.id}`)
        .then((body) => {
          if (current && epoch === requestEpoch.current) {
            setThread(body.thread);
            setTurns(body.items);
            setOlder(body.nextCursor);
          }
        })
        .catch(() => {
          if (current)
            setNotice(
              "A válasz ellenőrzése most szünetel. A beszélgetés megmaradt; újranyitva folytathatod.",
            );
        });
    }, 3000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [thread?.id, pending, request]);
  useEffect(() => {
    if (turns.length) end.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length]);
  function close() {
    if (
      (question.trim() || memory.trim() || correction.trim()) &&
      !window.confirm("Van még el nem küldött szöveged. Bezárod az AI-edzőt?")
    )
      return;
    onClose();
  }
  async function openSource(ref: Ref, reviewId?: string) {
    const body = await request(
      `/ai-sources/${encodeURIComponent(ref.id)}?revision=${ref.revision}${reviewId ? `&reviewId=${reviewId}` : ""}`,
    );
    setSource(body.source);
    setOpenedSources((old) => new Set([...old, `${ref.id}:${ref.revision}`]));
  }
  function sourcesList(refs: Ref[], reviewId?: string) {
    return (
      <div className={styles.sources}>
        {refs.map((ref) => (
          <button
            className={styles.sourceButton}
            type="button"
            key={`${ref.id}-${ref.revision}`}
            onClick={() => void run(() => openSource(ref, reviewId))}
          >
            Forrás ·{" "}
            {ref.id.startsWith("habi-") ? "Habi-tartalom" : ref.id.slice(0, 8)}{" "}
            · v{ref.revision}
          </button>
        ))}
      </div>
    );
  }
  function reviewCard(turn: Turn) {
    return (
      <article className={styles.card} key={turn.id}>
        <p className={styles.eyebrow}>
          SZEMÉLYES KÖVETKEZTETÉS · ELLENŐRZÉSRE VÁR
        </p>
        <p>{turn.question}</p>
        {turn.answer?.claims.map((claim) => (
          <div key={claim.id}>
            <p>{claim.text}</p>
            {sourcesList(
              claim.evidenceRefs,
              turn.reviewState === "requested" ? turn.id : undefined,
            )}
          </div>
        ))}
        <label htmlFor={`review-${turn.id}`}>Ellenőrzés indoklása</label>
        <textarea
          id={`review-${turn.id}`}
          maxLength={2000}
          value={reviewNotes[turn.id] ?? ""}
          onChange={(e) =>
            setReviewNotes({ ...reviewNotes, [turn.id]: e.target.value })
          }
        />
        {["approved", "rejected"].map((decision) => (
          <button
            type="button"
            key={decision}
            disabled={
              busy ||
              !reviewNotes[turn.id]?.trim() ||
              (decision === "approved" &&
                !turn.answer?.claims.every((c) =>
                  c.evidenceRefs.every((r) =>
                    openedSources.has(`${r.id}:${r.revision}`),
                  ),
                ))
            }
            onClick={() =>
              void run(async () => {
                await request(`/ai-reviews/${turn.id}`, {
                  decision,
                  expectedRevision: turn.revision,
                  rationale: reviewNotes[turn.id],
                });
                await refreshReviews();
                if (thread) await refresh(thread.id);
              })
            }
          >
            {decision === "approved" ? "Jóváhagyom" : "Elutasítom"}
          </button>
        ))}
      </article>
    );
  }
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="ai-coach-title"
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>HABI · SZEMÉLYES SEGÍTSÉG</p>
            <h2 id="ai-coach-title">
              <SmartToy /> AI-edző
            </h2>
            {pending && (
              <span className={styles.liveStatus} aria-hidden="true">
                {pendingTurns.length > 1
                  ? `${pendingTurns.length} kérdés · `
                  : ""}
                {liveStatus}
              </span>
            )}
          </div>
          <button type="button" onClick={close} className={styles.close}>
            Vissza az oldalra
          </button>
        </header>
        <p className={styles.context}>
          Erről beszélünk:{" "}
          {thread?.opening.split("\n")[0] ?? "Kiválasztott tartalom"}
          {context.days ? ` · ${context.days} nap` : ""}
        </p>
        <p className={styles.privacy}>
          Ez a beszélgetés a saját{" "}
          {role === "player"
            ? "játékosi"
            : role === "parent"
              ? "szülői"
              : "edzői"}{" "}
          nézetedhez tartozik. A családi beszélgetés külön marad.
        </p>
        <nav className={styles.tabs} aria-label="AI-edző nézetek">
          {[
            ["chat", "Beszélgetés"],
            ["profile", "Amit Habi tud"],
            ["recommendations", "Javaslatok"],
            ...(role === "coach" ? [["reviews", "Ellenőrzés"]] : []),
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                if (id === "reviews") void run(refreshReviews);
                if (id === "profile" || id === "recommendations")
                  void run(refreshProfile);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        {source && (
          <section className={styles.sourceView} aria-label="Eredeti forrás">
            <button type="button" onClick={() => setSource(null)}>
              Forrás bezárása
            </button>
            <h3>{source.title}</h3>
            <p>
              {source.at
                ? new Date(source.at).toLocaleString("hu-HU")
                : "Verziózott Habi-tartalom"}{" "}
              · {source.role}
            </p>
            <p className={styles.prewrap}>{source.text}</p>
          </section>
        )}
        {tab === "chat" && (
          <>
            <details>
              <summary>Korábbi AI-beszélgetéseim</summary>
              <div className={styles.history}>
                {threads.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() =>
                      void run(async () => {
                        await refresh(t.id);
                        setQuestion("");
                      })
                    }
                  >
                    {t.opening.split("\n")[0]} ·{" "}
                    {new Date(t.updatedAt).toLocaleString("hu-HU")}
                  </button>
                ))}
                {olderThreads && (
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        const list = await request(
                          `/ai-coach?before=${olderThreads}`,
                        );
                        setThreads([...threads, ...list.items]);
                        setOlderThreads(list.nextCursor);
                      })
                    }
                  >
                    Régebbi beszélgetések
                  </button>
                )}
              </div>
            </details>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => send("", true))}
            >
              Új beszélgetés erről a tartalomról
            </button>
            {thread &&
              (turns.length > 0 ? (
                <details className={styles.assistant}>
                  <summary>A kijelölt tartalom magyarázata</summary>
                  <p className={styles.prewrap}>{thread.opening}</p>
                </details>
              ) : (
                <article className={styles.assistant}>
                  <strong>Habi AI-edző</strong>
                  <p className={styles.prewrap}>{thread.opening}</p>
                </article>
              ))}
            {older && (
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const body = await request(
                      `/ai-coach/${thread?.id}?before=${older}`,
                    );
                    setTurns([...body.items, ...turns]);
                    setOlder(body.nextCursor);
                  })
                }
              >
                Korábbi üzenetek betöltése
              </button>
            )}
            {turns.map((turn) => (
              <section key={turn.id} className={styles.turn}>
                <article className={styles.user}>
                  <strong>Kérdésed</strong>
                  <p>{turn.question}</p>
                </article>
                <article className={styles.assistant}>
                  <strong>Habi AI-edző</strong>
                  {turn.sourceState === "withdrawn" ? (
                    <p>
                      Ennek a válasznak egy forrása megváltozott vagy már nem
                      érhető el. Kérj új magyarázatot a most elérhető adatokból.
                    </p>
                  ) : (
                    <>
                      {turn.progress && (
                        <AiAnswerProgress progress={turn.progress} />
                      )}
                      {turn.answerMode === "source_summary" &&
                        turn.answer &&
                        !turn.conversation?.suppressRepeatedAnswer && (
                          <aside className={styles.notice}>
                            <strong>Forrásalapú összefoglaló</strong>
                            <p>
                              Az AI-szolgáltatás nem adott feldolgozható
                              választ. Az alábbiak az engedélyezett, mentett
                              források tényszerű összefoglalói.
                            </p>
                          </aside>
                        )}
                      {turn.status === "failed" &&
                        turn.failureReason === "REPLACED_BY_QUESTION" && (
                          <p>
                            Az automatikus magyarázat helyett a saját kérdésedre
                            válaszolok.
                          </p>
                        )}
                      {turn.status === "failed" &&
                        turn.failureReason !== "REPLACED_BY_QUESTION" && (
                          <>
                            <p>
                              A válasz most nem készült el. A kérdésed
                              megmaradt.
                            </p>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(() => send(turn.question))
                              }
                            >
                              Újra kérdezem
                            </button>
                          </>
                        )}
                      {turn.answer &&
                        (() => {
                          const guidance = turn.guidance;
                          const continuation = turn.conversation;
                          const suppress = continuation?.suppressRepeatedAnswer;
                          const lead = suppress
                            ? undefined
                            : (guidance?.claim ??
                              turn.answer.claims.find(
                                (c) => c.kind === "general",
                              ) ??
                              turn.answer.claims[0]);
                          const evidence = turn.answer.claims.filter(
                            (c) => c.id !== lead?.id && c.kind !== "inference",
                          );
                          const unknowns = suppress
                            ? []
                            : [
                                ...new Set([
                                  ...(guidance?.unknowns ?? []),
                                  ...turn.answer.unknowns,
                                ]),
                              ];
                          const questions = continuation?.questions.length
                            ? continuation.questions
                            : (guidance?.questions ??
                              turn.answer.clarifyingQuestions);
                          const fact = (claim: Claim) => (
                            <div key={claim.id}>
                              {claim.kind === "inference" && (
                                <strong>Személyes következtetés</strong>
                              )}
                              <p>{claim.text}</p>
                              {claim.evidenceRefs.map((ref) => {
                                const source = turn.sources.find(
                                  (item) =>
                                    item.id === ref.id &&
                                    item.revision === ref.revision,
                                );
                                return source?.at ? (
                                  <p className={styles.muted} key={ref.id}>
                                    {source.title} ·{" "}
                                    {new Date(source.at).toLocaleString(
                                      "hu-HU",
                                      { timeZone: "Europe/Budapest" },
                                    )}{" "}
                                    · {source.role}
                                  </p>
                                ) : null;
                              })}
                              {sourcesList(claim.evidenceRefs)}
                            </div>
                          );
                          return (
                            <>
                              {continuation && (
                                <div className={styles.answerLead}>
                                  <h3>Folytassuk innen</h3>
                                  <p>{continuation.lead}</p>
                                </div>
                              )}
                              {lead && (
                                <div className={styles.answerLead}>
                                  <h3>A rövid válasz</h3>
                                  {fact(lead)}
                                </div>
                              )}
                              {unknowns.map((text) => (
                                <p className={styles.muted} key={text}>
                                  {text}
                                </p>
                              ))}
                              {evidence.length > 0 && (
                                <details className={styles.evidence}>
                                  <summary>
                                    Mi alapján? · {evidence.length} kapcsolódó
                                    adat
                                  </summary>
                                  {evidence.map(fact)}
                                </details>
                              )}
                              {turn.answer.claims
                                .filter(
                                  (c) =>
                                    c.kind === "inference" && c.id !== lead?.id,
                                )
                                .map(fact)}
                              {questions.length > 0 && (
                                <div className={styles.followup}>
                                  <strong>Hogy pontosabban segíthessek:</strong>
                                  <ul>
                                    {questions.map((text) => (
                                      <li key={text}>{text}</li>
                                    ))}
                                  </ul>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      composer.current?.focus();
                                      composer.current?.scrollIntoView({
                                        block: "center",
                                        behavior: "smooth",
                                      });
                                    }}
                                  >
                                    Válaszolok
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      {turn.pendingReview && (
                        <div className={styles.notice}>
                          <p>
                            A személyes következtetés edzői ellenőrzést igényel.
                          </p>
                          {turn.reviewState === "requested" ? (
                            <p>Az ellenőrzési kérés elküldve.</p>
                          ) : role !== "coach" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await request(`/ai-reviews/${turn.id}`, {
                                    decision: "request",
                                    expectedRevision: turn.revision,
                                    rationale:
                                      "Ezt a kérdést, választ és a hivatkozott forrásokat külön megosztom az edzővel ellenőrzésre.",
                                  });
                                  if (thread) await refresh(thread.id);
                                })
                              }
                            >
                              Ezt a választ és forrásait megosztom edzői
                              ellenőrzésre
                            </button>
                          ) : (
                            reviewCard(turn)
                          )}
                        </div>
                      )}
                      {turn.reviewState === "approved" && (
                        <p>Edző által ellenőrizve: {turn.reviewRationale}</p>
                      )}
                      {turn.reviewState === "rejected" && (
                        <p>
                          Az edző elutasította ezt a következtetést:{" "}
                          {turn.reviewRationale}
                        </p>
                      )}
                    </>
                  )}
                </article>
              </section>
            ))}
            <div ref={end} />
            <form
              className={styles.composer}
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => send(question));
              }}
            >
              <label htmlFor="coach-question">Kérdezz a Habi AI-edzőtől</label>
              <textarea
                ref={composer}
                id="coach-question"
                value={question}
                maxLength={2000}
                rows={3}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Mit jelent ez? Mi változott?"
              />
              <div className={styles.suggestions}>
                {[
                  "Magyarázd el egyszerűbben.",
                  "Milyen korábbi adatok kapcsolódnak ehhez?",
                  "Mit próbálhatnék ki?",
                ].map((text) => (
                  <button
                    type="button"
                    key={text}
                    onClick={() => setQuestion(text)}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <button
                className={styles.primary}
                type="submit"
                disabled={busy || !question.trim()}
              >
                Kérdés elküldése
              </button>
            </form>
          </>
        )}
        {tab === "profile" && (
          <>
            <h3>Amit Habi tud rólam</h3>
            <p>
              A profil a számodra hozzáférhető mentett forrásokat és saját
              pontosításaidat rendezi. {profile?.sourceCount ?? 0} forrás;
              frissítve:{" "}
              {profile
                ? new Date(profile.updatedAt).toLocaleString("hu-HU")
                : "betöltés…"}
              .
            </p>
            {profile?.coverageFrom && (
              <p>
                Források időszaka:{" "}
                {new Date(profile.coverageFrom).toLocaleDateString("hu-HU")} –{" "}
                {profile.coverageTo
                  ? new Date(profile.coverageTo).toLocaleDateString("hu-HU")
                  : ""}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await request("/ai-profile", {
                    kind: "memory",
                    targetId: "self",
                    text: memory,
                    value: "",
                    sourceRefs: [],
                  });
                  setMemory("");
                  await refreshProfile();
                });
              }}
            >
              <label htmlFor="coach-memory">
                Mit szeretnél, hogy Habi megjegyezzen?
              </label>
              <textarea
                id="coach-memory"
                maxLength={2000}
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
              />
              <button type="submit" disabled={busy || !memory.trim()}>
                Megjegyzés a saját profilomhoz
              </button>
            </form>
            {profile?.facts.slice(0, factLimit).map((fact) => (
              <article className={styles.card} key={fact.id}>
                <p className={styles.eyebrow}>
                  {fact.status === "candidate"
                    ? "Beszélgetési megjegyzés · megerősítésre vár"
                    : categoryLabels[fact.category]}
                </p>
                <p className={styles.prewrap}>{fact.text}</p>
                <p className={styles.muted}>
                  {new Date(fact.at).toLocaleString("hu-HU")}
                </p>
                {sourcesList(fact.sourceRefs)}
                {fact.counterEvidence.length > 0 && (
                  <details>
                    <summary>Eltérő válaszok is vannak</summary>
                    {sourcesList(fact.counterEvidence)}
                  </details>
                )}
                {fact.status === "candidate" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await request("/ai-profile", {
                          kind: "memory",
                          targetId: fact.id,
                          text: fact.text,
                          value: "",
                          sourceRefs: fact.sourceRefs,
                        });
                        await refreshProfile();
                      })
                    }
                  >
                    Ezt megjegyezheted
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditing(fact);
                    setCorrection("");
                  }}
                >
                  Pontosítom / már nem aktuális
                </button>
                {editing?.id === fact.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await request("/ai-profile", {
                          kind: "correction",
                          targetId: fact.id,
                          text: correction,
                          value: "incorrect",
                          sourceRefs: fact.sourceRefs,
                        });
                        setCorrection("");
                        setEditing(null);
                        await refreshProfile();
                      });
                    }}
                  >
                    <label htmlFor="coach-correction">
                      Mi változott, vagy mit pontosítanál?
                    </label>
                    <textarea
                      id="coach-correction"
                      maxLength={2000}
                      value={correction}
                      onChange={(e) => setCorrection(e.target.value)}
                    />
                    <button type="submit" disabled={busy}>
                      Pontosítás mentése
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await request("/ai-profile", {
                            kind: "correction",
                            targetId: fact.id,
                            text: correction,
                            value: "outdated",
                            sourceRefs: fact.sourceRefs,
                          });
                          setCorrection("");
                          setEditing(null);
                          await refreshProfile();
                        })
                      }
                    >
                      Már nem aktuális
                    </button>
                  </form>
                )}
              </article>
            ))}
            {profile && profile.facts.length > factLimit && (
              <button
                type="button"
                onClick={() => setFactLimit(factLimit + 20)}
              >
                További profilinformációk
              </button>
            )}
          </>
        )}
        {tab === "recommendations" && (
          <>
            <h3>Következő kipróbálható lépések</h3>
            <p>
              A saját beszámolókhoz kapcsolódó, önkéntesen választható szerzői
              gyakorlatok. A visszajelzésed befolyásolja a következő
              áttekintést.
            </p>
            {profile?.recommendations.length === 0 && (
              <p>
                Még nincs elég mentett adat egy kapcsolódó javaslathoz. A
                Gyakorlatok és saját célok oldalon önállóan is választhatsz.
              </p>
            )}
            {profile?.recommendations.map((r) => (
              <article className={styles.card} key={r.id}>
                <h4>{r.title}</h4>
                <p>{r.what}</p>
                <strong>Miért kapcsolódhat most?</strong>
                <p>{r.why}</p>
                <p className={styles.muted}>{r.uncertainty}</p>
                <p>
                  Újranézés: {new Date(r.reviewAt).toLocaleDateString("hu-HU")}
                </p>
                {sourcesList(r.sourceRefs)}
                {r.feedback && (
                  <p>Legutóbbi döntésed: {feedbackLabels[r.feedback]}</p>
                )}
                <label htmlFor={`feedback-${r.id}`}>
                  Saját megjegyzés (nem kötelező)
                </label>
                <textarea
                  id={`feedback-${r.id}`}
                  maxLength={2000}
                  value={feedbackNotes[r.id] ?? ""}
                  onChange={(e) =>
                    setFeedbackNotes({
                      ...feedbackNotes,
                      [r.id]: e.target.value,
                    })
                  }
                />
                <div className={styles.suggestions}>
                  {Object.entries(feedbackLabels).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      disabled={busy}
                      aria-pressed={r.feedback === value}
                      onClick={() =>
                        void run(async () => {
                          await request("/ai-profile", {
                            kind: "feedback",
                            targetId: r.id,
                            text: feedbackNotes[r.id] ?? "",
                            value,
                            sourceRefs: r.sourceRefs,
                          });
                          await refreshProfile();
                          setNotice("A visszajelzésed elmentve.");
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <AiCoachButton
                  context={{ kind: "practice", id: r.practiceId, revision: 1 }}
                  label="Kérdezek erről a gyakorlatról"
                />
              </article>
            ))}
          </>
        )}
        {tab === "reviews" && (
          <>
            <h3>Külön megosztott AI-válaszok ellenőrzése</h3>
            <p>
              Csak az ellenőrzésre megosztott kérdés és válasz látható; a privát
              beszélgetés többi része külön marad.
            </p>
            {reviews.length === 0 && (
              <p>Nincs ellenőrzésre megosztott válasz.</p>
            )}
            {reviews.map(reviewCard)}
          </>
        )}
      </div>
    </dialog>
  );
}
