"use client";
import { useState } from "react";
import content from "../lib/content/support-loop-v1.json";
import { useContinuityDraft } from "./use-continuity-draft";
import styles from "./workspace.module.css";
type RecordItem = { id: string; text?: string | null; occurredAt?: string };
function parsed(text: string | undefined | null, prefix: string) {
  if (!text?.startsWith(prefix)) return null;
  try {
    return JSON.parse(text.slice(prefix.length));
  } catch {
    return null;
  }
}
export default function PlayerSupportLoop({
  records,
  playerId,
  actorId,
  csrfToken,
  save,
  compact = false,
  onOpen,
}: {
  records: RecordItem[];
  playerId: string;
  actorId: string;
  csrfToken: string;
  save: (text: string) => Promise<unknown>;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const [event, setEvent] = useState({
      name: "",
      date: "",
      phase: "before",
      moment: "",
      helped: "",
      next: "",
    }),
    [returnPlan, setReturnPlan] = useState({ sourceId: "", at: "" }),
    [review, setReview] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const draft = useContinuityDraft(
    compact ? null : playerId,
    compact ? null : actorId,
    csrfToken,
    "support-loop",
    {
      event: JSON.stringify(event),
      returnPlan: JSON.stringify(returnPlan),
      review,
    },
    (values) => {
      try {
        if (values.event) setEvent(JSON.parse(values.event));
        if (values.returnPlan) setReturnPlan(JSON.parse(values.returnPlan));
        setReview(values.review ?? "");
      } catch {
        setNotice("A korábbi piszkozatot nem lehet megnyitni.");
      }
    },
  );
  const returns = records
    .map((record) => ({
      record,
      value: parsed(record.text, "Habi visszatérés · "),
    }))
    .filter(
      (item) =>
        item.value &&
        typeof item.value.at === "string" &&
        typeof item.value.sourceId === "string",
    );
  const done = new Set(
    records
      .map(
        (record) =>
          parsed(record.text, "Habi visszatérés eredménye · ")?.returnId,
      )
      .filter(Boolean),
  );
  const waiting = returns.filter((item) => !done.has(item.record.id));
  async function commit(text: string, after?: () => void) {
    if (busy) return;
    setBusy(true);
    try {
      if (await save(text)) {
        after?.();
        setNotice("Elmentve az előzmények közé.");
      }
    } finally {
      setBusy(false);
    }
  }
  if (compact)
    return (
      <>
        {waiting.map(({ record, value }) => (
          <aside className={styles.formGroup} key={record.id}>
            <h3>{content.labels.returnTitle}</h3>
            <p>{value.text}</p>
            <p>{new Date(value.at).toLocaleString("hu-HU")}</p>
            <button className={styles.secondary} type="button" onClick={onOpen}>
              Visszanézek rá
            </button>
          </aside>
        ))}
      </>
    );
  return (
    <section className={styles.formGroup}>
      <h3>Valami előtt vagy után</h3>
      <p>{content.labels.eventIntro}</p>
      {draft.status && <p role="status">{draft.status}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = `Esemény-visszatekintés · ${event.name.trim() || "Egy fontos alkalom"}\nAz alkalom napja: ${event.date}\nNézőpont: ${event.phase === "before" ? "Előtte" : "Utána"}\nMi történt / mire készülök: ${event.moment.trim() || "Kihagyva"}\nMi segít: ${event.helped.trim() || "Kihagyva"}\nAmit kipróbálnék: ${event.next.trim() || "Kihagyva"}`;
          void commit(text, () =>
            setEvent({
              name: "",
              date: "",
              phase: "before",
              moment: "",
              helped: "",
              next: "",
            }),
          );
        }}
      >
        <label htmlFor="event-name">Milyen alkalomra gondolsz?</label>
        <input
          id="event-name"
          disabled={!draft.loaded}
          maxLength={120}
          value={event.name}
          onChange={(e) => setEvent({ ...event, name: e.target.value })}
        />
        <label htmlFor="event-date">Az alkalom napja</label>
        <input
          id="event-date"
          disabled={!draft.loaded}
          required
          type="date"
          value={event.date}
          onChange={(e) => setEvent({ ...event, date: e.target.value })}
        />
        <label htmlFor="event-phase">Előtte vagy utána?</label>
        <select
          id="event-phase"
          disabled={!draft.loaded}
          value={event.phase}
          onChange={(e) => setEvent({ ...event, phase: e.target.value })}
        >
          <option value="before">Előtte</option>
          <option value="after">Utána</option>
        </select>
        {Object.entries({
          moment: "Mi történt, vagy mire készülsz?",
          helped: "Mi segített vagy mi segítene?",
          next: "Mit próbálnál ki legközelebb?",
        }).map(([key, label]) => (
          <label key={key} htmlFor={`event-${key}`}>
            {label}
            <textarea
              id={`event-${key}`}
              disabled={!draft.loaded}
              maxLength={250}
              value={event[key as keyof typeof event]}
              onChange={(e) => setEvent({ ...event, [key]: e.target.value })}
            />
          </label>
        ))}
        <button
          type="submit"
          className={styles.primary}
          disabled={
            busy ||
            !draft.loaded ||
            ![event.moment, event.helped, event.next].some((s) => s.trim())
          }
        >
          Visszatekintés mentése
        </button>
      </form>
      <h3>{content.labels.returnWhen}</h3>
      <p>
        A saját beszélgetésedre, gyakorlatodra vagy bejegyzésedre térhetsz
        vissza. A jelzés a Habi megnyitásakor látható.
      </p>
      <label htmlFor="return-source">Mire szeretnél visszanézni?</label>
      <select
        id="return-source"
        disabled={!draft.loaded}
        value={returnPlan.sourceId}
        onChange={(e) =>
          setReturnPlan({ ...returnPlan, sourceId: e.target.value })
        }
      >
        <option value="">Válassz saját bejegyzést</option>
        {records
          .filter((r) => r.text && !r.text.startsWith("Habi visszatérés"))
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.text?.split("\n")[0].slice(0, 100)}
            </option>
          ))}
      </select>
      <label htmlFor="return-at">Mikor?</label>
      <input
        id="return-at"
        disabled={!draft.loaded}
        type="datetime-local"
        value={returnPlan.at}
        onChange={(e) => setReturnPlan({ ...returnPlan, at: e.target.value })}
      />
      <button
        className={styles.secondary}
        type="button"
        disabled={
          busy || !returnPlan.sourceId || !returnPlan.at || !draft.loaded
        }
        onClick={() => {
          const source = records.find((r) => r.id === returnPlan.sourceId);
          if (!source || !Number.isFinite(Date.parse(returnPlan.at))) return;
          void commit(
            `Habi visszatérés · ${JSON.stringify({ sourceId: source.id, at: new Date(returnPlan.at).toISOString(), text: source.text?.slice(0, 500) ?? "" })}`,
            () => setReturnPlan({ sourceId: "", at: "" }),
          );
        }}
      >
        Visszatérés beállítása
      </button>
      {waiting.map(({ record, value }) => (
        <article className={styles.dataCard} key={record.id}>
          <h4>{content.labels.returnQuestion}</h4>
          <p>{value.text}</p>
          <p>{new Date(value.at).toLocaleString("hu-HU")}</p>
          {[
            "returnHelpful",
            "returnDifferent",
            "returnNotYet",
            "returnStop",
          ].map((key) => (
            <button
              className={styles.secondary}
              key={key}
              type="button"
              disabled={busy}
              onClick={() =>
                void commit(
                  `Habi visszatérés eredménye · ${JSON.stringify({ returnId: record.id, sourceId: value.sourceId, answer: content.labels[key as keyof typeof content.labels], note: review })}`,
                  () => setReview(""),
                )
              }
            >
              {content.labels[key as keyof typeof content.labels]}
            </button>
          ))}
          <label htmlFor={`return-note-${record.id}`}>Saját megjegyzés</label>
          <textarea
            id={`return-note-${record.id}`}
            value={review}
            maxLength={1000}
            onChange={(e) => setReview(e.target.value)}
          />
        </article>
      ))}
    </section>
  );
}
