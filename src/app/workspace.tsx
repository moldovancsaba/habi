"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./workspace.module.css";

type Role = "player" | "parent" | "coach";
type Me = {
  actorId: string;
  activeRole: Role;
  allowedRoles: Role[];
  playerIds: string[];
  csrfToken: string;
};
type RecordItem = {
  id: string;
  kind?: string;
  text?: string | null;
  occurredAt?: string;
  revision?: number;
  answerCodes?: Array<{ metric: string; code: number }>;
};
type PlayerData = { id: string; checkins: RecordItem[]; records: RecordItem[] };
type AppState =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "no-role" }
  | { state: "admin" }
  | { state: "ready"; me: Me };

const metrics = [
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
  return "A művelet most nem sikerült. Próbáld újra.";
}

export default function HabiWorkspace() {
  const [app, setApp] = useState<AppState>({ state: "loading" });
  const [data, setData] = useState<PlayerData[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [observation, setObservation] = useState("");
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"today" | "history">("today");

  const load = useCallback(async () => {
    setApp({ state: "loading" });
    try {
      const response = await fetch("/api/v1/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        const adminResponse = await fetch("/api/admin/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (adminResponse.ok) setApp({ state: "admin" });
        else if (adminResponse.status === 403) setApp({ state: "no-role" });
        else setApp({ state: "signed-out" });
        return;
      }
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.code ?? "LOAD_FAILED",
        );
      const me = (await response.json()) as Me;
      setApp({ state: "ready", me });
      const playerIds = me.playerIds.length ? me.playerIds : [me.actorId];
      const loaded = await Promise.all(
        playerIds.map(async (playerId) => {
          const [checkins, records] = await Promise.all([
            fetch(
              `/api/v1/players/${encodeURIComponent(playerId)}/checkin-results`,
              { cache: "no-store" },
            ).then(async (r) => (r.ok ? r.json() : { items: [] })),
            fetch(`/api/v1/players/${encodeURIComponent(playerId)}/records`, {
              cache: "no-store",
            }).then(async (r) => (r.ok ? r.json() : { items: [] })),
          ]);
          return {
            id: playerId,
            checkins: checkins.items ?? [],
            records: records.items ?? [],
          } as PlayerData;
        }),
      );
      setData(loaded);
    } catch (error) {
      setNotice(messageFor(error));
      setApp({ state: "signed-out" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = app.state === "ready" ? app.me : null;
  const playerId = useMemo(
    () =>
      active?.playerIds[0] ??
      (active?.activeRole === "player" ? active.actorId : ""),
    [active],
  );

  async function submitCheckin() {
    if (!active || !playerId || Object.keys(answers).length !== metrics.length)
      return;
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
              answerCode: answers[metric],
            }),
          },
        );
        const result = await saved.json();
        if (!saved.ok) throw new Error(result.code ?? "SAVE_FAILED");
        revision = result.revision;
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
      setNotice("A mai állapotjelzésed elmentve.");
      await load();
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitObservation() {
    if (!active || !playerId || !observation.trim()) return;
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
      setNotice("A megfigyelés elmentve.");
      await load();
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function askQuestion() {
    if (active?.activeRole !== "parent" || !playerId || !question.trim())
      return;
    const source = data[0]?.checkins[0];
    if (!source) {
      setNotice("Előbb szükség van egy elérhető napi állapotjelzésre.");
      return;
    }
    setBusy(true);
    setNotice("");
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
      setQuestion("");
      setNotice(
        "A kérdés bekerült a helyi AI feldolgozási sorába. A válasz ellenőrzés után jelenik meg.",
      );
    } catch (error) {
      setNotice(messageFor(error));
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
          {active ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void signOut()}
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
          <section className={styles.hero}>
            <p className={styles.eyebrow}>HABI · MVP</p>
            <h1>Sportolói támogatás, közösen.</h1>
            <p>Biztonságos munkaterület játékosoknak, szülőknek és edzőknek.</p>
            <a className={styles.primary} href="/auth/login?returnTo=%2F">
              Belépés DoneIsBetter-fiókkal
            </a>
          </section>
        )}
        {app.state === "admin" && (
          <section className={styles.hero}>
            <p className={styles.eyebrow}>ADMINISZTRÁCIÓ</p>
            <h1>Üdv a Habiban.</h1>
            <p>
              Az adminisztrátori fiókoddal felhasználói meghívókat és
              szerepköröket kezelhetsz.
            </p>
            <a className={styles.primary} href="/admin">
              Adminfelület megnyitása
            </a>
          </section>
        )}
        {app.state === "no-role" && (
          <section className={styles.hero}>
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
            {notice && (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            )}
            {tab === "today" && active.activeRole === "player" && (
              <section className={styles.panel}>
                <p className={styles.eyebrow}>NAPI ÁLLAPOTJELZÉS</p>
                <h2>Egy rövid megálló magadra.</h2>
                <p className={styles.muted}>
                  Bármelyik kérdést kihagyhatod. A válaszaid a naplódba
                  kerülnek.
                </p>
                <div className={styles.questions}>
                  {metrics.map(([key, prompt, choices]) => (
                    <fieldset className={styles.question} key={key}>
                      <legend>{prompt}</legend>
                      <div className={styles.choices}>
                        {choices.map((choice, index) => (
                          <label key={choice}>
                            <input
                              type="radio"
                              name={key}
                              checked={answers[key] === index}
                              onChange={() =>
                                setAnswers((current) => ({
                                  ...current,
                                  [key]: index,
                                }))
                              }
                            />
                            <span>{choice}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={
                    busy || Object.keys(answers).length !== metrics.length
                  }
                  onClick={() => void submitCheckin()}
                >
                  {busy ? "Mentés…" : "Állapotjelzés mentése"}
                </button>
              </section>
            )}
            {tab === "today" &&
              (active.activeRole === "parent" ||
                active.activeRole === "coach") && (
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
                      onChange={(event) => setObservation(event.target.value)}
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
                        onChange={(event) => setQuestion(event.target.value)}
                        rows={3}
                        maxLength={1000}
                      />
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy || !question.trim()}
                        onClick={() => void askQuestion()}
                      >
                        Kérdés elküldése a helyi AI-nak
                      </button>
                      <p className={styles.muted}>
                        A válasz forrásolt lesz, és edzői ellenőrzést kérhet.
                      </p>
                    </section>
                  )}
                </>
              )}
            {tab === "history" && (
              <section className={styles.panel}>
                <p className={styles.eyebrow}>ELŐZMÉNYEK</p>
                <h2>A napló eseményei</h2>
                {data
                  .flatMap((person) => [
                    ...person.checkins.map((item) => ({
                      ...item,
                      label: "Állapotjelzés",
                    })),
                    ...person.records.map((item) => ({
                      ...item,
                      label:
                        item.kind === "observation"
                          ? "Megfigyelés"
                          : "Bejegyzés",
                    })),
                  ])
                  .sort((a, b) =>
                    String(b.occurredAt ?? "").localeCompare(
                      String(a.occurredAt ?? ""),
                    ),
                  )
                  .map((item) => (
                    <article className={styles.record} key={item.id}>
                      <span className={styles.recordType}>{item.label}</span>
                      <time>
                        {item.occurredAt
                          ? new Date(item.occurredAt).toLocaleDateString(
                              "hu-HU",
                            )
                          : ""}
                      </time>
                      <p>
                        {item.text ??
                          (item.answerCodes
                            ?.map(
                              (answer) => `${answer.metric}: ${answer.code}`,
                            )
                            .join(" · ") ||
                            "Rögzített esemény")}
                      </p>
                    </article>
                  ))}
                {data.every(
                  (person) =>
                    person.checkins.length === 0 && person.records.length === 0,
                ) && (
                  <p className={styles.muted}>
                    Még nincs megjeleníthető bejegyzés.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
