"use client";
import { useCallback, useEffect, useState } from "react";
import { commandMessage, productRequest } from "./product-request";
import styles from "./workspace.module.css";
type Thread = {
  id: string;
  revision: number;
  status: string;
  latestActivityAt: string;
};
type Message = {
  id: string;
  text: string;
  replyTo: string | null;
  recordedBy: { role: string };
  submittedAt: string;
};
export default function SharedConversations({
  playerId,
  csrfToken,
  role,
}: {
  playerId: string;
  csrfToken: string;
  role: string;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadCursor, setThreadCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [opening, setOpening] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const body = await productRequest(
      `/api/v1/players/${encodeURIComponent(playerId)}/threads?limit=100`,
      csrfToken,
      undefined,
      "GET",
    );
    setThreads(body.items);
    setThreadCursor(body.nextCursor);
    setSelected((id) =>
      body.items.some((t: Thread) => t.id === id)
        ? id
        : (body.items[0]?.id ?? ""),
    );
  }, [playerId, csrfToken]);
  useEffect(() => {
    let current = true;
    setSelected("");
    setMessages([]);
    setDraft("");
    setOpening("");
    void load().catch(() => {
      if (current) setNotice("A beszélgetések most nem tölthetők be.");
    });
    return () => {
      current = false;
    };
  }, [load]);
  useEffect(() => {
    let current = true;
    setMessages([]);
    setReplyTo(null);
    setCursor(null);
    if (selected)
      void productRequest(
        `/api/v1/threads/${encodeURIComponent(selected)}/messages?limit=50`,
        csrfToken,
        undefined,
        "GET",
      )
        .then((body) => {
          if (current) {
            setMessages(body.items.reverse());
            setCursor(body.nextCursor);
          }
        })
        .catch(() => {
          if (current) setNotice("Az üzenetek most nem tölthetők be.");
        });
    return () => {
      current = false;
    };
  }, [selected, csrfToken]);
  const thread = threads.find((t) => t.id === selected);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(commandMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>KÖZÖS BESZÉLGETÉSEK</p>
      <h2>Kérdések és válaszok az edzővel</h2>
      <p>
        A helyzetet közösen beszélitek meg. Minden hozzászólás a saját
        beszélgetésében marad.
      </p>
      {notice && <p role="status">{notice}</p>}
      <details>
        <summary>Új beszélgetés indítása</summary>
        <label htmlFor="new-conversation">
          Milyen helyzetet szeretnél megbeszélni?
        </label>
        <textarea
          id="new-conversation"
          value={opening}
          maxLength={4000}
          onChange={(e) => setOpening(e.target.value)}
        />
        <button
          className={styles.primary}
          type="button"
          disabled={busy || !opening.trim()}
          onClick={() =>
            void run(async () => {
              const created = await productRequest(
                `/api/v1/players/${encodeURIComponent(playerId)}/threads`,
                csrfToken,
                { text: opening.trim(), replyTo: null },
              );
              await load();
              setSelected(created.id);
              setOpening("");
              setNotice("A beszélgetés elindult.");
            })
          }
        >
          Beszélgetés indítása
        </button>
      </details>
      {threadCursor && (
        <button
          className={styles.secondary}
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const body = await productRequest(
                `/api/v1/players/${encodeURIComponent(playerId)}/threads?limit=100&cursor=${encodeURIComponent(threadCursor)}`,
                csrfToken,
                undefined,
                "GET",
              );
              setThreads((items) => [...items, ...body.items]);
              setThreadCursor(body.nextCursor);
            })
          }
        >
          Korábbi beszélgetések betöltése
        </button>
      )}
      {threads.length ? (
        <>
          <label htmlFor="shared-thread">Beszélgetés kiválasztása</label>
          <select
            id="shared-thread"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {new Date(t.latestActivityAt).toLocaleString("hu-HU")} ·{" "}
                {t.status === "open" ? "Nyitott" : "Lezárt"}
              </option>
            ))}
          </select>
          {cursor && (
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const body = await productRequest(
                    `/api/v1/threads/${encodeURIComponent(selected)}/messages?cursor=${encodeURIComponent(cursor)}&limit=50`,
                    csrfToken,
                    undefined,
                    "GET",
                  );
                  setMessages((current) => [
                    ...body.items.reverse(),
                    ...current,
                  ]);
                  setCursor(body.nextCursor);
                })
              }
            >
              Korábbi üzenetek betöltése
            </button>
          )}
          <ol className={styles.messageList}>
            {messages.map((m) => (
              <li key={m.id}>
                <span className={`role-badge actor-${m.recordedBy.role}`}>
                  {m.recordedBy.role === "coach"
                    ? "Edző"
                    : m.recordedBy.role === "parent"
                      ? "Szülő"
                      : "Játékos"}
                </span>
                <p>{m.text}</p>
                <time dateTime={m.submittedAt}>
                  {new Date(m.submittedAt).toLocaleString("hu-HU")}
                </time>
                {thread?.status === "open" && (
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => setReplyTo(m.id)}
                  >
                    Erre válaszolok
                  </button>
                )}
              </li>
            ))}
          </ol>
          {thread?.status === "open" && (
            <>
              {replyTo && (
                <p>
                  Válasz erre: {messages.find((m) => m.id === replyTo)?.text}
                  <button type="button" onClick={() => setReplyTo(null)}>
                    Mégsem
                  </button>
                </p>
              )}
              <label htmlFor="shared-reply">Hozzászólás</label>
              <textarea
                id="shared-reply"
                value={draft}
                maxLength={4000}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                className={styles.primary}
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() =>
                  void run(async () => {
                    const saved = await productRequest(
                      `/api/v1/threads/${encodeURIComponent(selected)}/messages`,
                      csrfToken,
                      { text: draft.trim(), replyTo },
                    );
                    setMessages((items) => [...items, saved]);
                    setDraft("");
                    setReplyTo(null);
                    await load();
                  })
                }
              >
                Hozzászólás mentése
              </button>
            </>
          )}
          {role === "coach" && thread && (
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const current = await productRequest(
                    `/api/v1/threads/${encodeURIComponent(selected)}`,
                    csrfToken,
                    undefined,
                    "GET",
                  );
                  await productRequest(
                    `/api/v1/threads/${encodeURIComponent(selected)}/${current.status === "open" ? "close" : "reopen"}`,
                    csrfToken,
                    { expectedRevision: current.revision },
                  );
                  await load();
                })
              }
            >
              {thread.status === "open"
                ? "Beszélgetés lezárása"
                : "Beszélgetés újranyitása"}
            </button>
          )}
        </>
      ) : (
        <p>
          Még nincs közös beszélgetés. Egy konkrét helyzetből indíthatsz újat.
        </p>
      )}
    </section>
  );
}
