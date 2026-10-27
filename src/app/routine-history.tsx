"use client";
import { AiCoachButton } from "./ai-coach";
import { useState } from "react";
import styles from "./workspace.module.css";
type Entry = { id: string; text?: string | null; occurredAt?: string };
export default function RoutineHistory({
  routines,
  records,
  save,
}: {
  routines: Array<{ id: string; text: string }>;
  records: Entry[];
  save: (text: string) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(""),
    [text, setText] = useState("");
  async function commit(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (await save(value)) {
        setEditing("");
        setText("");
      }
    } finally {
      setBusy(false);
    }
  }
  const today = new Date().toLocaleDateString("sv-SE");
  return (
    <section>
      <h3>Rutinok és kipróbálási előzmények</h3>
      <AiCoachButton />
      {routines.map((routine) => {
        const events = records
          .filter((record) =>
            record.text?.startsWith(`Rutin állapot · ${routine.id} ·`),
          )
          .sort((a, b) =>
            (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
          );
        const paused = events[0]?.text?.endsWith("paused");
        const changes = records
          .filter((record) =>
            record.text?.startsWith(`Rutin módosítva · ${routine.id} ·`),
          )
          .sort((a, b) =>
            (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
          );
        const label =
          changes[0]?.text?.slice(
            `Rutin módosítva · ${routine.id} · `.length,
          ) ?? routine.text;
        const logs = records.filter((record) =>
          record.text?.startsWith(`Rutin kipróbálva · ${routine.id} ·`),
        );
        const done =
          logs.some((record) =>
            record.text?.startsWith(
              `Rutin kipróbálva · ${routine.id} · ${today}`,
            ),
          ) ||
          records.some(
            (record) =>
              record.text === `Rutin elvégezve: ${routine.text}` &&
              record.occurredAt &&
              new Date(record.occurredAt).toLocaleDateString("sv-SE") === today,
          );
        return (
          <article className={styles.dataCard} key={routine.id}>
            <h4>{label}</h4>
            <p>{paused ? "Félretett rutin" : "Saját rutin"}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy || done || paused}
                onClick={() =>
                  void commit(
                    `Rutin kipróbálva · ${routine.id} · ${today}\n${label}`,
                  )
                }
              >
                {done ? "Ma már feljegyezted" : "Ma kipróbáltam"}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() =>
                  void commit(
                    `Rutin állapot · ${routine.id} · ${paused ? "active" : "paused"}`,
                  )
                }
              >
                {paused ? "Újra előveszem" : "Most félreteszem"}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setEditing(routine.id);
                  setText(label);
                }}
              >
                Módosítom
              </button>
            </div>
            {editing === routine.id && (
              <>
                <label htmlFor={`routine-edit-${routine.id}`}>
                  A rutin új szövege
                </label>
                <input
                  id={`routine-edit-${routine.id}`}
                  maxLength={300}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button
                  className={styles.primary}
                  type="button"
                  disabled={busy || !text.trim()}
                  onClick={() =>
                    void commit(
                      `Rutin módosítva · ${routine.id} · ${text.trim()}`,
                    )
                  }
                >
                  Változat mentése
                </button>
              </>
            )}
            <details>
              <summary>Kipróbálási előzmények · {logs.length} alkalom</summary>
              {logs.map((log) => (
                <p key={log.id}>
                  {log.occurredAt
                    ? new Date(log.occurredAt).toLocaleString("hu-HU")
                    : ""}{" "}
                  · {log.text?.split("\n")[1]}
                </p>
              ))}
            </details>
          </article>
        );
      })}
    </section>
  );
}
