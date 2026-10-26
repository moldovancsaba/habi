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
    return "Az állapotjelzés közben megváltozott. Töltsd újra az oldalt, majd próbáld meg újra.";
  return "A művelet most nem sikerült. Próbáld újra.";
}

export default function HabiWorkspace() {
  const [app, setApp] = useState<AppState>({ state: "loading" });
  const [signInFailure, setSignInFailure] = useState<string | null>(null);
  const [data, setData] = useState<PlayerData[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checkinIndex, setCheckinIndex] = useState<number | null>(null);
  const [observation, setObservation] = useState("");
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"today" | "history">("today");

  async function logOutFromHabi() {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
    window.location.replace("/");
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
            <p className={styles.eyebrow}>Sportolói támogatás</p>
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
