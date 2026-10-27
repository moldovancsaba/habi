"use client";
import { useCallback, useEffect, useState } from "react";
import { productRequest, commandMessage } from "./product-request";
import styles from "./workspace.module.css";
type Record = {
  id: string;
  revision?: number;
  text?: string | null;
  occurredAt?: string;
  recordedBy?: { role: string };
};
type Publication = {
  id: string;
  revision: number;
  status: string;
  resourceRef: { id: string; revision: number };
};
export default function CoachRecords({
  records,
  playerId,
  csrfToken,
}: {
  records: Record[];
  playerId: string;
  csrfToken: string;
}) {
  const [publications, setPublications] = useState<Publication[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(
    async () =>
      setPublications(
        (
          await productRequest(
            `/api/v1/publications?playerId=${encodeURIComponent(playerId)}`,
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
      setNotice("A megosztások állapota most nem tölthető be."),
    );
  }, [load]);
  return (
    <section className={styles.panel}>
      <h2>Belső edzői anyagok és megosztás</h2>
      <p>
        Minden megosztás a kiválasztott rekord pontos változatára vonatkozik.
      </p>
      {notice && <p role="status">{notice}</p>}
      {records
        .filter((r) => r.recordedBy?.role === "coach")
        .map((r) => {
          const publication = publications.find(
            (p) =>
              p.status === "active" &&
              p.resourceRef.id === r.id &&
              p.resourceRef.revision === r.revision,
          );
          return (
            <article className={styles.dataCard} key={r.id}>
              <p className={styles.eyebrow}>
                {publication ? "SZÜLŐKKEL MEGOSZTVA" : "BELSŐ EDZŐI ANYAG"}
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{r.text}</p>
              {r.occurredAt && (
                <time dateTime={r.occurredAt}>
                  {new Date(r.occurredAt).toLocaleString("hu-HU")}
                </time>
              )}
              <button
                className={styles.secondary}
                type="button"
                disabled={busy || !r.revision}
                onClick={() => {
                  setBusy(true);
                  void (
                    publication
                      ? productRequest(
                          `/api/v1/publications/${encodeURIComponent(publication.id)}/withdraw`,
                          csrfToken,
                          { expectedRevision: publication.revision },
                        )
                      : productRequest("/api/v1/publications", csrfToken, {
                          resourceRef: { id: r.id, revision: r.revision },
                        })
                  )
                    .then(load)
                    .catch((e) => setNotice(commandMessage(e)))
                    .finally(() => setBusy(false));
                }}
              >
                {publication
                  ? "Megosztás visszavonása"
                  : "Megosztom a szülőkkel"}
              </button>
            </article>
          );
        })}
    </section>
  );
}
