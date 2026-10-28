"use client";
import { useEffect, useState } from "react";
import styles from "./ai-coach.module.css";
export type AnswerProgress = {
  phase: string;
  submittedAt: string;
  lastActivityAt: string;
  retryAt: string | null;
  attempts: number;
  queuedAhead: number;
};
const labels: Record<string, string> = {
  queued: "A kérdésed mentve, feldolgozásra vár.",
  retrieving: "A kijelölt tartalom és a források betöltése.",
  provider_wait: "Az AI-szolgáltatás sorában várakozik.",
  generating: "Az AI összeállítja a választ.",
  repairing: "A hiányos válasz automatikus újragenerálása.",
  checking: "A forráshivatkozások ellenőrzése.",
  saving: "A válasz mentése.",
  retry_wait: "Átmeneti hiba után automatikusan újrapróbáljuk.",
  reconnecting: "A feldolgozó újracsatlakozására várunk.",
  completed: "A válasz elkészült.",
  failed: "A feldolgozás megállt.",
};
const positions: Record<string, number> = {
  queued: 0,
  retrieving: 1,
  provider_wait: 2,
  generating: 2,
  repairing: 2,
  checking: 3,
  saving: 3,
  completed: 4,
  retry_wait: 1,
  reconnecting: 1,
  failed: 0,
};
function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60
    ? `${seconds} mp`
    : `${Math.floor(seconds / 60)} perc ${seconds % 60} mp`;
}
export default function AiAnswerProgress({
  progress,
}: {
  progress: AnswerProgress;
}) {
  const [now, setNow] = useState(() => Date.now());
  const finished = ["completed", "failed"].includes(progress.phase);
  useEffect(() => {
    if (finished) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [finished]);
  const last = Date.parse(progress.lastActivityAt),
    started = Date.parse(progress.submittedAt),
    elapsed = (finished ? last : now) - started,
    position = positions[progress.phase] ?? 0;
  if (progress.phase === "completed")
    return (
      <div className={styles.completedProgress} role="status">
        <strong>A válasz elkészült.</strong>
        <span>Feldolgozási idő: {duration(elapsed)}</span>
      </div>
    );
  return (
    <section
      className={styles.progressPanel}
      aria-label="A válasz feldolgozása"
    >
      <p role="status" className={styles.progressTitle}>
        {labels[progress.phase] ?? labels.queued}
      </p>
      {!finished && (
        <progress
          className={styles.progressBar}
          aria-label="A válasz feldolgozás alatt"
        />
      )}
      <ol className={styles.progressSteps}>
        {["Mentve", "Források", "Válasz", "Ellenőrzés", "Kész"].map(
          (label, i) => (
            <li
              key={label}
              className={
                i < position || (finished && progress.phase === "completed")
                  ? styles.stepDone
                  : i === position
                    ? styles.stepActive
                    : undefined
              }
              aria-current={!finished && i === position ? "step" : undefined}
            >
              {label}
            </li>
          ),
        )}
      </ol>
      <p className={styles.muted}>
        {finished ? "Feldolgozási idő" : "Eltelt idő"}: {duration(elapsed)}
        {progress.attempts > 1 ? ` · ${progress.attempts}. próbálkozás` : ""}
      </p>
      {!finished && progress.queuedAhead > 0 && (
        <p className={styles.muted}>
          Még {progress.queuedAhead} korábbi saját kérdésed vár válaszra.
        </p>
      )}
      {!finished && progress.retryAt && (
        <p className={styles.muted}>
          Következő próbálkozás:{" "}
          {new Date(progress.retryAt).toLocaleTimeString("hu-HU")}
        </p>
      )}
      {!finished && Number.isFinite(last) && now - last > 90000 && (
        <p>A feldolgozó új állapotjelzésére várunk. A kérdésed mentve van.</p>
      )}
    </section>
  );
}
