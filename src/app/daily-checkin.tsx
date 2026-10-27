"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkinMetrics } from "../lib/workflows/checkin-chart.mjs";
import { productRequest, commandMessage } from "./product-request";
import { MetricGraphic } from "./checkin-graphics";
import styles from "./workspace.module.css";
type Session = {
  id: string;
  revision: number;
  answers: Array<{ metric: string; answerCode: number }>;
  startedAt: string;
};
const hints: Record<string, string> = {
  energy: "Mennyi energiád van most a napi teendőkhöz és a sporthoz?",
  sleep: "A legutóbbi éjszakára gondolj.",
  focus: "Mennyire könnyű most egy feladatra figyelned?",
  mood: "A mostani érzésedhez legközelebbi választ válaszd. Nincs jó vagy rossz válasz.",
  load: "A több edzés nem feltétlenül jobb. A tényleges mennyiséget jelöld.",
};
export default function DailyCheckin({
  playerId,
  csrfToken,
  onSaved,
}: {
  playerId: string;
  csrfToken: string;
  onSaved: () => void;
}) {
  const [sessions, setSessions] = useState<Session[]>([]),
    [session, setSession] = useState<Session | null>(null),
    [step, setStep] = useState(0),
    [selection, setSelection] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const load = useCallback(
    async () =>
      setSessions(
        (
          await productRequest(
            `/api/v1/players/${encodeURIComponent(playerId)}/checkin-sessions`,
            csrfToken,
            undefined,
            "GET",
          )
        ).items,
      ),
    [playerId, csrfToken],
  );
  useEffect(() => {
    void load().catch(() =>
      setNotice("A félbehagyott jelzések most nem tölthetők be."),
    );
  }, [load]);
  async function send(path: string, body: unknown) {
    const fingerprint = path + JSON.stringify(body);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const result = await productRequest(
      path,
      csrfToken,
      body,
      "POST",
      pending.current.key,
    );
    pending.current = null;
    return result;
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(commandMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function refresh(id: string) {
    const value = await productRequest(
      `/api/v1/checkin-sessions/${encodeURIComponent(id)}`,
      csrfToken,
      undefined,
      "GET",
    );
    setSession(value);
    return value as Session;
  }
  async function finish() {
    if (!session) return;
    if (!session.answers.length) {
      setSession(null);
      await load();
      return;
    }
    await send(
      `/api/v1/checkin-sessions/${encodeURIComponent(session.id)}/complete`,
      { expectedRevision: session.revision },
    );
    setSession(null);
    setNotice("Az állapotjelzésed elmentve.");
    await load();
    onSaved();
  }
  const question = checkinMetrics[step];
  const saved = session?.answers.find((a) => a.metric === question?.[0]);
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>NAPI ÁLLAPOTJELZÉS</p>
      <h2>
        {session ? "Elmondhatod, hogy vagy." : "Egy rövid megálló magadra."}
      </h2>
      <p>
        A beküldött válasz azonnal mentődik, és a jogosult szüleid és edzőid
        láthatják. A félbehagyott jelzés később folytatható.
      </p>
      {notice && <p role="status">{notice}</p>}
      {!session ? (
        <>
          <button
            className={styles.primary}
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const value = await send(
                  `/api/v1/players/${encodeURIComponent(playerId)}/checkin-sessions`,
                  {
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    instrumentVersion: "checkin-hu-1",
                  },
                );
                setSession(value);
                setStep(0);
                setSelection(null);
              })
            }
          >
            Új állapotjelzés
          </button>
          {sessions.map((s) => (
            <div className={styles.dataCard} key={s.id}>
              <p>
                {new Date(s.startedAt).toLocaleString("hu-HU")} ·{" "}
                {s.answers.length} beküldött válasz
              </p>
              <button
                className={styles.secondary}
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const current = await refresh(s.id);
                    const index = checkinMetrics.findIndex(
                      ([metric]) =>
                        !current.answers.some((a) => a.metric === metric),
                    );
                    setStep(index < 0 ? checkinMetrics.length : index);
                    setSelection(null);
                  })
                }
              >
                Félbehagyott jelzés folytatása
              </button>
            </div>
          ))}
        </>
      ) : step < checkinMetrics.length ? (
        <>
          <progress
            value={step + 1}
            max={checkinMetrics.length}
            aria-label="Állapotjelzés előrehaladása"
          />
          <h3>{question[1]}</h3>
          <details>
            <summary>Hogyan válasszak?</summary>
            <p>{hints[question[0]]}</p>
          </details>
          <fieldset className={styles.questionChoices}>
            <legend>
              {step + 1} / {checkinMetrics.length}
            </legend>
            {question[2].map((label, code) => (
              <button
                className={styles.questionChoice}
                type="button"
                key={label}
                disabled={busy || Boolean(saved)}
                aria-pressed={
                  saved ? saved.answerCode === code : selection === code
                }
                onClick={() => setSelection(code)}
              >
                <MetricGraphic metric={question[0]} code={code} />
                {label}
              </button>
            ))}
          </fieldset>
          {saved ? (
            <>
              <p>A korábban beküldött válasz megmaradt.</p>
              <button
                className={styles.primary}
                type="button"
                onClick={() => {
                  setStep(step + 1);
                  setSelection(null);
                }}
              >
                Következő kérdés
              </button>
            </>
          ) : (
            <button
              className={styles.primary}
              type="button"
              disabled={busy || selection === null}
              onClick={() =>
                void run(async () => {
                  await send(
                    `/api/v1/checkin-sessions/${encodeURIComponent(session.id)}/answers`,
                    {
                      expectedRevision: session.revision,
                      metric: question[0],
                      answerCode: selection,
                    },
                  );
                  await refresh(session.id);
                  setStep(step + 1);
                  setSelection(null);
                  onSaved();
                })
              }
            >
              Válasz beküldése
            </button>
          )}
          {!saved && (
            <button
              className={styles.textButton}
              type="button"
              disabled={busy}
              onClick={() => {
                setStep(step + 1);
                setSelection(null);
              }}
            >
              Most kihagyom
            </button>
          )}
          <button
            className={styles.secondary}
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setSession(null);
                await load();
              })
            }
          >
            Később folytatom
          </button>
          <button
            className={styles.secondary}
            type="button"
            disabled={busy}
            onClick={() => void run(finish)}
          >
            Most befejezem
          </button>
          {step > 0 && (
            <button
              className={styles.textButton}
              type="button"
              disabled={busy}
              onClick={() => {
                setStep(step - 1);
                setSelection(null);
              }}
            >
              Vissza
            </button>
          )}
        </>
      ) : (
        <>
          <h3>Beküldött válaszaid</h3>
          {session.answers.map((a) => (
            <p key={a.metric}>
              {checkinMetrics.find(([metric]) => metric === a.metric)?.[1]} ·{" "}
              {
                checkinMetrics.find(([metric]) => metric === a.metric)?.[2][
                  a.answerCode
                ]
              }
            </p>
          ))}
          <button
            className={styles.primary}
            type="button"
            disabled={busy}
            onClick={() => void run(finish)}
          >
            Állapotjelzés lezárása
          </button>
          <button
            className={styles.secondary}
            type="button"
            disabled={busy}
            onClick={() => {
              setStep(0);
              setSelection(null);
            }}
          >
            Átnézem a válaszaimat
          </button>
        </>
      )}
    </section>
  );
}
