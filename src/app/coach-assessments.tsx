"use client";
import { useEffect, useState } from "react";
import content from "../lib/content/coach-assessments-v1.json";
import { commandMessage, productRequest } from "./product-request";
import styles from "./workspace.module.css";
export default function CoachAssessments({
  playerId,
  csrfToken,
  onSaved,
}: {
  playerId: string;
  csrfToken: string;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState("questionnaire");
  const choices = content.topics.filter((t) =>
    mode === "cognitive"
      ? t.domain === "cognitive"
      : content.items.some((i) => i.construct_id === t.id),
  );
  const [topicId, setTopicId] = useState(choices[0].id);
  const topic = choices.find((t) => t.id === topicId) ?? choices[0];
  const items = content.items.filter((i) => i.construct_id === topic.id);
  const scenarios = content.scenarios.filter(
    (i) => i.construct_id === topic.id,
  );
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!started) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const beforeNavigate = (event: Event) => {
      if (
        !window.confirm(
          "A be nem küldött felmérés megszakad. Kilépsz az alkalomból?",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("habi:before-navigate", beforeNavigate);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("habi:before-navigate", beforeNavigate);
    };
  }, [started]);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null | undefined>>([]);
  const [fields, setFields] = useState<Record<string, string>>({
    date: new Date().toLocaleDateString("sv-SE"),
    context: "",
    example: "",
    reflection: "",
    scenarioId: "",
    value: "",
    scale: "",
    source: "",
    reference: "",
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const labels =
    topic.domain === "personality"
      ? [
          "Egyáltalán nem jellemző",
          "Nem jellemző",
          "Vegyes / semleges",
          "Jellemző",
          "Nagyon jellemző",
        ]
      : ["Soha", "Ritkán", "Néha", "Gyakran", "Szinte mindig"];
  const reset = () => {
    setStarted(false);
    setStep(0);
    setAnswers([]);
    setKey(crypto.randomUUID());
    setFields({
      date: new Date().toLocaleDateString("sv-SE"),
      context: "",
      example: "",
      reflection: "",
      scenarioId: "",
      value: "",
      scale: "",
      source: "",
      reference: "",
    });
  };
  const change = () =>
    !started ||
    window.confirm("A be nem küldött alkalom megszakad. Folytatod?");
  const field = (
    name: string,
    label: string,
    required = false,
    type = "textarea",
  ) => (
    <label className={styles.label} key={name} htmlFor={`assessment-${name}`}>
      {label}
      {type === "textarea" ? (
        <textarea
          id={`assessment-${name}`}
          maxLength={name === "source" || name === "reference" ? 500 : 700}
          required={required}
          value={fields[name]}
          onChange={(e) => {
            setFields({ ...fields, [name]: e.target.value });
            setKey(crypto.randomUUID());
          }}
        />
      ) : (
        <input
          id={`assessment-${name}`}
          type={type}
          required={required}
          value={fields[name]}
          onChange={(e) => {
            setFields({ ...fields, [name]: e.target.value });
            setKey(crypto.randomUUID());
          }}
        />
      )}
    </label>
  );
  const scenario = scenarios.find((s) => s.id === fields.scenarioId);
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>EDZŐI FELMÉRÉSEK ÉS INTERJÚK</p>
      <h2>Kérdőívek, helyzetek és riportértékek</h2>
      <p>
        A játékos saját válaszait és az edző megfigyelését külön rögzítjük. Az
        eredeti kérdések fejlesztést segítenek, nem diagnosztikus tesztek.
      </p>
      <div className={styles.actions}>
        {[
          ["questionnaire", "Kérdőívek"],
          ["interview", "Interjú és helyzetek"],
          ["cognitive", "CogMap eredmények"],
        ].map(([id, label]) => (
          <button
            className={styles.secondary}
            key={id}
            type="button"
            disabled={busy}
            aria-pressed={mode === id}
            onClick={() => {
              if (change()) {
                reset();
                setMode(id);
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <label htmlFor="coach-assessment-topic">Témakör</label>
      <select
        id="coach-assessment-topic"
        disabled={busy}
        value={topic.id}
        onChange={(e) => {
          if (change()) {
            reset();
            setTopicId(e.target.value);
          }
        }}
      >
        {choices.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <h3>{topic.title}</h3>
      <p>{topic.definition}</p>
      <details>
        <summary>Beszélgetési támpontok és korlátok</summary>
        <p>{topic.interview}</p>
        <p>Labdarúgó példa: {topic.football_example}</p>
        <p>Más lehetséges magyarázat: {topic.alternative}</p>
        <p>{topic.boundary}</p>
      </details>
      {notice && <p role="status">{notice}</p>}
      {!started ? (
        <button
          className={styles.primary}
          type="button"
          onClick={() => setStarted(true)}
        >
          Alkalom indítása
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            void productRequest(
              `/api/v1/players/${encodeURIComponent(playerId)}/coach-assessments`,
              csrfToken,
              {
                ...fields,
                topicId: topic.id,
                mode,
                answers: items.map((_, i) => answers[i] ?? null),
              },
              "POST",
              key,
            )
              .then(() => {
                reset();
                setNotice(
                  "Az alkalmat belső edzői anyagként elmentettük. A szülőkkel külön osztható meg.",
                );
                onSaved();
              })
              .catch((err) => setNotice(commandMessage(err)))
              .finally(() => setBusy(false));
          }}
        >
          {field("date", "Felmérés dátuma", true, "date")}
          {field("context", "Körülmények, nyelv és nyújtott segítség")}
          {mode === "questionnaire" && step < items.length ? (
            <fieldset>
              <legend>
                {step + 1} / {items.length} · {items[step].text}
              </legend>
              <p>{items[step].timeframe}</p>
              {[null, 1, 2, 3, 4, 5].map((value) => (
                <button
                  className={styles.secondary}
                  key={value ?? "skip"}
                  type="button"
                  aria-pressed={answers[step] === value}
                  onClick={() => {
                    setAnswers((a) => {
                      const next = [...a];
                      next[step] = value;
                      return next;
                    });
                    setStep(step + 1);
                    setKey(crypto.randomUUID());
                  }}
                >
                  {value === null
                    ? "Kihagyom / nem alkalmazható"
                    : labels[value - 1]}
                </button>
              ))}
            </fieldset>
          ) : (
            <>
              {mode === "questionnaire" && (
                <>
                  <h3>A válaszok áttekintése</h3>
                  {items.map((item, i) => (
                    <p key={item.id}>
                      {item.text} —{" "}
                      {answers[i] === null
                        ? "Tudatosan kihagyva"
                        : labels[(answers[i] ?? 1) - 1]}
                    </p>
                  ))}
                </>
              )}
              {mode === "interview" && (
                <>
                  <label htmlFor="coach-scenario">Helyzet</label>
                  <select
                    id="coach-scenario"
                    value={fields.scenarioId}
                    onChange={(e) =>
                      setFields({ ...fields, scenarioId: e.target.value })
                    }
                  >
                    <option value="">Témaköri interjú</option>
                    {scenarios.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.context}
                      </option>
                    ))}
                  </select>
                  <p>{scenario?.prompt ?? topic.interview}</p>
                  {scenario?.followups.map((q) => (
                    <p key={q}>{q}</p>
                  ))}
                </>
              )}
              {mode === "cognitive" && (
                <>
                  {field("value", "A riport eredeti értéke", true, "text")}
                  {field("scale", "Skála és mértékegység", true, "text")}
                  {field(
                    "source",
                    "Riport neve, verziója és pontos oldala",
                    true,
                  )}
                  {field(
                    "reference",
                    "Összehasonlítás alapja; ha hiányzik: nem ismert",
                    true,
                  )}
                </>
              )}
              {field(
                "example",
                "A játékos válasza, saját szavaival",
                mode === "interview",
              )}
              {field(
                "reflection",
                "Edzői megfigyelés és következő megbeszélendő lépés",
              )}
              <button type="submit" className={styles.primary} disabled={busy}>
                Alkalom befejezése és mentése
              </button>
            </>
          )}
          {mode === "questionnaire" && step > 0 && (
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              Előző kérdés
            </button>
          )}
          <button
            className={styles.secondary}
            type="button"
            disabled={busy}
            onClick={() => {
              if (change()) reset();
            }}
          >
            Megszakítás mentés nélkül
          </button>
        </form>
      )}
    </section>
  );
}
