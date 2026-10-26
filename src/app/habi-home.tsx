"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./habi-home.module.css";

type Checkin = { id?: string | number; date?: string };
type Task = { done?: boolean };
type Request = { status?: string };
type AppPayload = {
  app?: { checkins?: Checkin[]; tasks?: Task[]; requests?: Request[] };
};
type ApiResponse = { payload?: AppPayload | null };

type LoadState =
  | { status: "loading" }
  | { status: "ready"; payload: AppPayload | null }
  | { status: "error" };

function countRecords(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

export default function HabiHome() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/app", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) throw new Error("Habi data is unavailable");
      const result = (await response.json()) as ApiResponse;
      setState({ status: "ready", payload: result.payload ?? null });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const app = state.status === "ready" ? state.payload?.app : undefined;
  const checkins = Array.isArray(app?.checkins) ? app.checkins : [];
  const tasks = Array.isArray(app?.tasks) ? app.tasks : [];
  const latestDate = formatDate(checkins[0]?.date);

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

        <section className={styles.welcome} aria-labelledby="welcome-title">
          <p className={styles.eyebrow}>EGYÜTT A FEJLŐDÉSÉRT</p>
          <h1 id="welcome-title">Értsük meg együtt, mi segít a sportban.</h1>
          <p className={styles.intro}>
            Itt találod a saját Habi-naplódat, a napi állapotjelzéseidet és a
            korábbi bejegyzéseidet.
          </p>
        </section>

        {state.status === "loading" && (
          <p className={styles.notice} role="status" aria-live="polite">
            Betöltöm a naplódat…
          </p>
        )}

        {state.status === "error" && (
          <section className={styles.error} role="alert">
            <h2>Most nem érhető el a naplód.</h2>
            <p>A mentett adataid megmaradnak. Próbáld újra a betöltést.</p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void load()}
            >
              Újrapróbálom
            </button>
          </section>
        )}

        {state.status === "ready" && (
          <>
            <section
              className={styles.primaryCard}
              aria-labelledby="journal-title"
            >
              <div className={styles.cardCopy}>
                <p className={styles.cardEyebrow}>A TE NAPLÓD</p>
                <h2 id="journal-title">
                  {latestDate
                    ? "Folytasd a saját utadat."
                    : "Kezdd a saját tempódban."}
                </h2>
                <p>
                  {latestDate
                    ? `Az utolsó bejegyzésed dátuma: ${latestDate}.`
                    : "Még nincs mentett állapotjelzés ebben a böngészőben."}
                </p>
                <a className={styles.primaryButton} href="/legacy/index.html">
                  Megnyitom a naplómat <span aria-hidden="true">→</span>
                </a>
              </div>
              <div className={styles.routeMark} aria-hidden="true">
                <span className={styles.routeLine} />
                <span className={styles.station} />
                <span className={styles.station} />
                <span className={styles.station} />
              </div>
            </section>

            <section className={styles.summary} aria-labelledby="summary-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>CSAK A TE ADATAID</p>
                  <h2 id="summary-title">A naplód röviden</h2>
                </div>
                <span className={styles.ownerNote}>
                  Ehhez a böngészőhöz kapcsolva
                </span>
              </div>
              <dl className={styles.stats}>
                <div className={styles.stat}>
                  <dt>Állapotjelzések</dt>
                  <dd>{countRecords(app?.checkins)}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Elvégzett feladatok</dt>
                  <dd>{tasks.filter((task) => task.done === true).length}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Beszélgetések</dt>
                  <dd>{countRecords(app?.requests)}</dd>
                </div>
              </dl>
            </section>

            <p className={styles.privacy}>
              A naplód ehhez a böngészőhöz tartozó, már meglévő Habi-adatokból
              töltődik be. Új mintabejegyzéseket nem készítünk.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
