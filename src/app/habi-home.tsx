"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import practices from "../lib/content/practices-v1.json";
import styles from "./habi-home.module.css";

type Checkin = {
  id: string | number;
  date: string;
  answers: Record<string, number | null>;
  questions?: Array<[string, string, string[]]>;
  schema?: number;
};
type Task = { checkin: string | number; done: boolean };
type AppState = {
  checkins?: Checkin[];
  tasks?: Task[];
  requests?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};
type Question = [string, string, string[]];
type PracticeGuidance = { what: string; how: string };
type Catalog = {
  data?: {
    app_questions?: Question[];
    c2113ae1c4c25fce6?: PracticeGuidance;
  };
};
type Payload = { app: AppState; chat?: unknown };
type ApiResponse = {
  catalog?: Catalog;
  payload?: Payload | null;
  revision: number;
};
type Screen = "today" | "history" | "support";
type ViewState = "loading" | "ready" | "error";

const fallbackQuestions: Question[] = [
  [
    "mood",
    "Hogy érzed magad?",
    ["Nagyon jól", "Jól", "Lehangoltan", "Feszült"],
  ],
  ["sleep", "Hogyan aludtál?", ["Kiválóan", "Jól", "Keveset", "Rosszul"]],
  [
    "energy",
    "Mennyi energiád van?",
    ["Sok", "Megfelelő", "Kevés", "Kimerültem"],
  ],
  [
    "focus",
    "Mennyire tudsz figyelni?",
    ["Nagyon jól", "Jól", "Nehezen", "Alig"],
  ],
  [
    "result",
    "Hogy ment az edzés?",
    ["Nagyon jól", "Jól", "Vegyesen", "Rosszul"],
  ],
  [
    "load",
    "Mennyit edzettél?",
    ["Nem edzettem", "Keveset", "Közepesen", "Sokat"],
  ],
  ["pain", "Van fájdalmad?", ["Nincs", "Enyhe", "Igen", "Erős"]],
];

function todayLabel() {
  return new Date().toLocaleDateString("hu-HU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function todayKey() {
  return new Date().toLocaleDateString("hu-HU");
}

function readDevicePayload(): Payload | null {
  try {
    const app = JSON.parse(
      window.localStorage.getItem("habi-app-v1") ?? "null",
    ) as AppState | null;
    const chat = JSON.parse(
      window.localStorage.getItem("habi-chat-v1") ?? "null",
    ) as unknown;
    return app && typeof app === "object" ? { app, chat } : null;
  } catch {
    return null;
  }
}

function normalizeApp(app: AppState): AppState {
  return {
    ...app,
    checkins: Array.isArray(app.checkins) ? app.checkins : [],
    tasks: Array.isArray(app.tasks) ? app.tasks : [],
    requests: Array.isArray(app.requests) ? app.requests : [],
  };
}

function mergeApp(remote: AppState, local: AppState): AppState {
  const mergeBy = <T extends Record<string, unknown>>(
    left: T[] | undefined,
    right: T[] | undefined,
    key: keyof T,
  ) => {
    const merged = new Map<string, T>();
    for (const item of left ?? []) merged.set(String(item[key]), item);
    for (const item of right ?? [])
      merged.set(String(item[key]), {
        ...merged.get(String(item[key])),
        ...item,
      });
    return [...merged.values()].sort(
      (a, b) => Number(b.id ?? 0) - Number(a.id ?? 0),
    );
  };
  return {
    ...remote,
    ...local,
    checkins: mergeBy(
      remote.checkins as unknown as Array<Record<string, unknown>>,
      local.checkins as unknown as Array<Record<string, unknown>>,
      "id",
    ) as unknown as Checkin[],
    tasks: mergeBy(
      remote.tasks as unknown as Array<Record<string, unknown>>,
      local.tasks as unknown as Array<Record<string, unknown>>,
      "checkin",
    ) as unknown as Task[],
    requests: mergeBy(
      remote.requests as unknown as Array<Record<string, unknown>>,
      local.requests,
      "id",
    ),
  };
}

function responseText(question: Question, answer: number | null | undefined) {
  return answer == null
    ? "Kihagyva"
    : (question[2][answer] ?? "Válasz rögzítve");
}

function formatDate(value: string) {
  return value;
}

export default function HabiHome() {
  const [screen, setScreen] = useState<Screen>("today");
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [app, setApp] = useState<AppState>({
    checkins: [],
    tasks: [],
    requests: [],
  });
  const [catalogQuestions, setCatalogQuestions] =
    useState<Question[]>(fallbackQuestions);
  const [painGuidance, setPainGuidance] = useState<PracticeGuidance>({
    what: "Írd meg egy megbízható felnőttnek, hogy fájdalmat érzel.",
    how: "Írd le, hol fáj, mióta érzed, és melyik mozdulatnál jelentkezik. A fájdalmas mozdulatot ne ismételd csak azért, hogy teljesítsd a feladatot.",
  });
  const [revision, setRevision] = useState(0);
  const [chat, setChat] = useState<unknown>(null);
  const [saveState, setSaveState] = useState("Betöltés…");
  const [questionIndex, setQuestionIndex] = useState<number | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<
    Record<string, number | null>
  >({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setViewState("loading");
    setSaveState("Betöltés…");
    try {
      const response = await fetch("/api/app", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) throw new Error("A napló most nem érhető el.");
      const result = (await response.json()) as ApiResponse;
      const device = readDevicePayload();
      const dirty = window.localStorage.getItem("habi-cloud-dirty") === "1";
      const nextPayload = !result.payload
        ? device
        : dirty && device
          ? { ...device, app: mergeApp(result.payload.app, device.app) }
          : result.payload;
      setApp(normalizeApp(nextPayload?.app ?? {}));
      setChat(nextPayload?.chat ?? null);
      setRevision(result.revision);
      const questions = result.catalog?.data?.app_questions;
      if (Array.isArray(questions) && questions.length)
        setCatalogQuestions(questions);
      if (result.catalog?.data?.c2113ae1c4c25fce6)
        setPainGuidance(result.catalog.data.c2113ae1c4c25fce6);
      setSaveState("Az adataid betöltődtek.");
      setViewState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const device = readDevicePayload();
      if (device) {
        setApp(normalizeApp(device.app));
        setChat(device.chat ?? null);
        setSaveState(
          "A böngészőben mentett adatok látszanak. A szerverkapcsolat nem elérhető.",
        );
        setViewState("ready");
      } else {
        setSaveError(
          error instanceof Error ? error.message : "A napló nem tölthető be.",
        );
        setViewState("error");
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const checkins = app.checkins ?? [];
  const tasks = app.tasks ?? [];
  const todaysCheckin = checkins.find((item) => item.date === todayKey());
  const sortedCheckins = useMemo(
    () => [...checkins].sort((a, b) => Number(b.id) - Number(a.id)),
    [checkins],
  );

  const persist = useCallback(
    async (nextApp: AppState) => {
      const normalized = normalizeApp(nextApp);
      setApp(normalized);
      try {
        const response = await fetch("/api/app", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision,
            payload: {
              app: normalized,
              chat,
            },
          }),
        });
        if (response.status === 409)
          throw new Error(
            "Az adatok közben megváltoztak. Frissítsd a naplót, majd próbáld újra.",
          );
        if (!response.ok) throw new Error("A mentés nem sikerült.");
        const result = (await response.json()) as { revision: number };
        setRevision(result.revision);
        window.localStorage.setItem("habi-app-v1", JSON.stringify(normalized));
        window.localStorage.setItem("habi-cloud-dirty", "0");
        setSaveState("Elmentve a Habi-naplódba.");
        setSaveError(null);
        return true;
      } catch (error) {
        window.localStorage.setItem("habi-app-v1", JSON.stringify(normalized));
        window.localStorage.setItem("habi-cloud-dirty", "1");
        setSaveState(
          "A böngészőben elmentve; a szerverrel való szinkron még várakozik.",
        );
        setSaveError(
          error instanceof Error
            ? error.message
            : "A szerverrel való mentés nem sikerült.",
        );
        return false;
      }
    },
    [chat, revision],
  );

  function startCheckin() {
    setDraftAnswers({});
    setQuestionIndex(0);
    setScreen("today");
  }

  async function finishCheckin(answers: Record<string, number | null>) {
    const previousToday = checkins.find((item) => item.date === todayKey());
    const entry: Checkin = {
      id: Date.now(),
      date: todayKey(),
      answers,
      schema: 2,
      questions: catalogQuestions.map(([key, title, options]) => [
        key,
        title,
        [...options],
      ]),
    };
    const next = {
      ...app,
      checkins: [entry, ...checkins.filter((item) => item.date !== todayKey())],
      tasks: [
        { checkin: entry.id, done: false },
        ...tasks.filter((task) => task.checkin !== previousToday?.id),
      ],
    };
    setQuestionIndex(null);
    setDraftAnswers({});
    await persist(next);
  }

  async function toggleTask(checkinId: string | number) {
    const found = tasks.some((task) => task.checkin === checkinId);
    const nextTasks = found
      ? tasks.map((task) =>
          task.checkin === checkinId ? { ...task, done: !task.done } : task,
        )
      : [{ checkin: checkinId, done: true }, ...tasks];
    await persist({ ...app, tasks: nextTasks });
  }

  function answerCurrent(answer: number | null) {
    if (questionIndex === null) return;
    const question = catalogQuestions[questionIndex];
    if (!question) return;
    const next = { ...draftAnswers, [question[0]]: answer };
    setDraftAnswers(next);
    if (questionIndex + 1 >= catalogQuestions.length) void finishCheckin(next);
    else setQuestionIndex(questionIndex + 1);
  }

  const currentTask = todaysCheckin
    ? tasks.find((task) => task.checkin === todaysCheckin.id)
    : undefined;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <a className={styles.brand} href="/" aria-label="Habi kezdőlap">
            <span className={styles.brandMark} aria-hidden="true">
              H
            </span>
            <span>Habi</span>
          </a>
          <span className={styles.headerLabel}>A sportolói naplód</span>
        </header>

        <nav className={styles.nav} aria-label="Főmenü">
          {(
            [
              ["today", "Ma"],
              ["history", "Napló"],
              ["support", "Gyakorlatok"],
            ] as Array<[Screen, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={screen === value ? styles.navActive : styles.navButton}
              aria-current={screen === value ? "page" : undefined}
              onClick={() => {
                setScreen(value);
                setQuestionIndex(null);
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <p className={styles.saveStatus} role="status" aria-live="polite">
          {saveState}
        </p>
        {saveError && (
          <div className={styles.errorInline} role="alert">
            <span>{saveError}</span>
            <button type="button" onClick={() => void load()}>
              Újratöltés
            </button>
          </div>
        )}

        {viewState === "loading" && (
          <p className={styles.notice} role="status">
            Betöltöm a Habi-naplódat…
          </p>
        )}
        {viewState === "error" && (
          <section className={styles.error} role="alert">
            <h1>Most nem érem el a naplódat.</h1>
            <p>{saveError}</p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void load()}
            >
              Újrapróbálom
            </button>
          </section>
        )}

        {viewState === "ready" && screen === "today" && (
          <>
            <section className={styles.welcome} aria-labelledby="welcome-title">
              <p className={styles.eyebrow}>MA · {todayLabel()}</p>
              <h1 id="welcome-title">Hogy vagy ma?</h1>
              <p className={styles.intro}>
                Röviden jelezheted, hogyan érzed magad a sportban. A válaszaid a
                saját naplódba kerülnek.
              </p>
            </section>

            {questionIndex !== null ? (
              <section
                className={styles.primaryCard}
                aria-labelledby="question-title"
              >
                <p className={styles.cardEyebrow}>
                  NAPI ÁLLAPOTJELZÉS · {questionIndex + 1}/
                  {catalogQuestions.length}
                </p>
                <progress
                  className={styles.progress}
                  max={catalogQuestions.length}
                  value={questionIndex + 1}
                  aria-label="Állapotjelzés előrehaladása"
                />
                <h2 id="question-title">
                  {catalogQuestions[questionIndex]?.[1]}
                </h2>
                <div className={styles.choiceList}>
                  {(catalogQuestions[questionIndex]?.[2] ?? []).map(
                    (option, index) => (
                      <button
                        key={option}
                        type="button"
                        className={styles.choice}
                        onClick={() => answerCurrent(index)}
                      >
                        {option}
                      </button>
                    ),
                  )}
                </div>
                <div className={styles.questionControls}>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => answerCurrent(null)}
                  >
                    Most kihagyom
                  </button>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => {
                      if (questionIndex === 0) setQuestionIndex(null);
                      else setQuestionIndex(questionIndex - 1);
                    }}
                  >
                    Vissza
                  </button>
                </div>
              </section>
            ) : (
              <section
                className={styles.primaryCard}
                aria-labelledby="checkin-title"
              >
                <div className={styles.cardCopy}>
                  <p className={styles.cardEyebrow}>A TE NAPLÓD</p>
                  <h2 id="checkin-title">
                    {todaysCheckin
                      ? "A mai jelzésed elmentve."
                      : "Egy rövid megálló magadra."}
                  </h2>
                  <p>
                    {todaysCheckin
                      ? "A mai válaszaidat bármikor visszanézheted a Napló menüpontban."
                      : "Hét rövid kérdés. Bármelyiket kihagyhatod, és a válaszaidat később visszanézheted."}
                  </p>
                  {!todaysCheckin && (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={startCheckin}
                    >
                      Elkezdtem <span aria-hidden="true">→</span>
                    </button>
                  )}
                </div>
                <div className={styles.routeMark} aria-hidden="true">
                  <span className={styles.routeLine} />
                  <span className={styles.station} />
                  <span className={styles.station} />
                  <span className={styles.station} />
                </div>
              </section>
            )}

            {todaysCheckin && (todaysCheckin.answers?.pain ?? 0) > 0 && (
              <section
                className={styles.safetyCard}
                aria-labelledby="pain-guidance-title"
              >
                <p className={styles.cardEyebrow}>AMIT JELEZTÉL</p>
                <h2 id="pain-guidance-title">{painGuidance.what}</h2>
                <p>{painGuidance.how}</p>
              </section>
            )}

            <section className={styles.summary} aria-labelledby="summary-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>A SAJÁT ADATAID</p>
                  <h2 id="summary-title">A naplód röviden</h2>
                </div>
              </div>
              <dl className={styles.stats}>
                <div className={styles.stat}>
                  <dt>Állapotjelzések</dt>
                  <dd>{checkins.length}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Elvégzett feladatok</dt>
                  <dd>{tasks.filter((task) => task.done).length}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Mai vállalás</dt>
                  <dd>
                    {currentTask?.done
                      ? "Kész"
                      : todaysCheckin
                        ? "Nyitott"
                        : "—"}
                  </dd>
                </div>
              </dl>
              <p className={styles.privacyNote}>
                A naplód ehhez a böngészőhöz tartozik. Másik eszközön vagy
                böngészőben csak külön belépés után lesz elérhető.
              </p>
            </section>
          </>
        )}

        {viewState === "ready" && screen === "history" && (
          <section className={styles.content} aria-labelledby="history-title">
            <p className={styles.eyebrow}>A TE NAPLÓD</p>
            <h1 id="history-title">Korábbi állapotjelzések</h1>
            {sortedCheckins.length === 0 ? (
              <p className={styles.empty}>
                Még nincs mentett állapotjelzés. A mai kérdéssorral elkezdheted
                a naplódat.
              </p>
            ) : (
              <div className={styles.historyList}>
                {sortedCheckins.map((entry) => {
                  const questions = entry.questions?.length
                    ? entry.questions
                    : catalogQuestions;
                  const task = tasks.find((item) => item.checkin === entry.id);
                  return (
                    <article className={styles.historyCard} key={entry.id}>
                      <div className={styles.historyTop}>
                        <h2>{formatDate(entry.date)}</h2>
                        <button
                          className={
                            task?.done
                              ? styles.doneButton
                              : styles.secondaryButton
                          }
                          type="button"
                          onClick={() => void toggleTask(entry.id)}
                        >
                          {task?.done ? "Kész" : "Megjelölés kész"}
                        </button>
                      </div>
                      <ul className={styles.answers}>
                        {questions.map(([key, title, options]) => (
                          <li key={key}>
                            <span>{title}</span>
                            <strong>
                              {responseText(
                                [key, title, options],
                                entry.answers?.[key],
                              )}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {viewState === "ready" && screen === "support" && (
          <section className={styles.content} aria-labelledby="support-title">
            <p className={styles.eyebrow}>RÖVID GYAKORLATOK</p>
            <h1 id="support-title">Válaszd, ami most segíthet.</h1>
            <p className={styles.intro}>
              Ezek egyszerű, nem klinikai gyakorlatok. Választhatsz közülük,
              vagy később visszatérhetsz hozzájuk.
            </p>
            <div className={styles.practiceList}>
              {practices.items.map((item) => (
                <article className={styles.practiceCard} key={item.id}>
                  <p className={styles.cardEyebrow}>HABI · GYAKORLAT</p>
                  <h2>{item.title}</h2>
                  <p className={styles.practiceWhat}>{item.what}</p>
                  <details>
                    <summary>Megnézem, hogyan</summary>
                    <p>{item.how}</p>
                  </details>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
