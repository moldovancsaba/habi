"use client";
import { AiCoachButton } from "./ai-coach";
import { useCallback, useEffect, useState } from "react";
import { productRequest, commandMessage } from "./product-request";
import styles from "./workspace.module.css";
type Ref = { id: string; revision: number; span: string | null };
type Interpretation = {
  id: string;
  revision: number;
  reviewState: string;
  answerState: string;
  answer: {
    claims: Array<{ id: string; text: string; evidenceRefs: Ref[] }>;
    unknowns: string[];
    manifest: { sourceRefs: Ref[] };
  } | null;
};
export default function InterpretationReviews({
  playerId,
  csrfToken,
}: {
  playerId: string;
  csrfToken: string;
}) {
  const [items, setItems] = useState<Interpretation[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [rationale, setRationale] = useState<Record<string, string>>({}),
    [checked, setChecked] = useState<Record<string, boolean>>({}),
    [sources, setSources] = useState<Record<string, string>>({});
  const load = useCallback(
    async () =>
      setItems(
        (
          await productRequest(
            `/api/v1/players/${encodeURIComponent(playerId)}/interpretations?limit=100`,
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
      setNotice("A felülvizsgálatok most nem tölthetők be."),
    );
  }, [load]);
  async function review(item: Interpretation, decision: string) {
    if (busy || !item.answer) return;
    setBusy(true);
    setNotice("");
    try {
      await productRequest(
        `/api/v1/interpretations/${encodeURIComponent(item.id)}/review`,
        csrfToken,
        {
          interpretationRevision: item.revision,
          decision,
          rationale: rationale[item.id],
          sourceRevisionSet: item.answer.manifest.sourceRefs,
          claimReviews: item.answer.claims.map((claim) => ({
            claimId: claim.id,
            verdict:
              decision === "approved"
                ? "supported"
                : decision === "rejected"
                  ? "unsupported"
                  : "unclear",
            checkedSourceRefs: claim.evidenceRefs,
          })),
        },
      );
      await load();
      setNotice("A felülvizsgálat elmentve.");
    } catch (e) {
      setNotice(commandMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel}>
      <h2>Forrásolt válaszok edzői ellenőrzése</h2>
      <AiCoachButton />
      <p>
        Nyisd meg a pontos forrásokat, és minden állítást külön vess össze
        velük.
      </p>
      {notice && <p role="status">{notice}</p>}
      <button
        className={styles.secondary}
        type="button"
        onClick={() => void load()}
      >
        Válaszok frissítése
      </button>
      {items.map((item) => (
        <article className={styles.dataCard} key={item.id}>
          <p className={styles.eyebrow}>
            {item.reviewState === "approved"
              ? "JÓVÁHAGYOTT"
              : item.reviewState === "rejected"
                ? "ELUTASÍTOTT"
                : "ELLENŐRZÉSRE VÁR"}
          </p>
          {item.answer?.unknowns.map((text) => (
            <p key={text}>{text}</p>
          ))}
          {item.answer?.claims.map((claim) => (
            <div key={claim.id}>
              <p>{claim.text}</p>
              {claim.evidenceRefs.map((ref) => {
                const key = `${ref.id}:${ref.revision}`;
                return (
                  <details
                    key={`${key}:${ref.span}`}
                    onToggle={(e) => {
                      if (e.currentTarget.open && !sources[key])
                        void productRequest(
                          `/api/v1/players/${encodeURIComponent(playerId)}/sources/${encodeURIComponent(ref.id)}?revision=${ref.revision}`,
                          csrfToken,
                          undefined,
                          "GET",
                        )
                          .then((body) =>
                            setSources((s) => ({
                              ...s,
                              [key]: JSON.stringify(body.content, null, 2),
                            })),
                          )
                          .catch(() =>
                            setSources((s) => ({
                              ...s,
                              [key]:
                                "A forrás már nem olvasható ebben a változatban.",
                            })),
                          );
                    }}
                  >
                    <summary>
                      Forrás · {ref.revision}. változat
                      {ref.span ? ` · ${ref.span}` : ""}
                    </summary>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {sources[key] ?? "Forrás betöltése…"}
                    </pre>
                  </details>
                );
              })}
              <label>
                <input
                  type="checkbox"
                  checked={checked[item.id + claim.id] ?? false}
                  onChange={(e) =>
                    setChecked({
                      ...checked,
                      [item.id + claim.id]: e.target.checked,
                    })
                  }
                />
                Az állítást a megnyitott forrásokkal összevetettem.
              </label>
            </div>
          ))}
          {Boolean(item.answer?.claims.length) && (
            <>
              <label htmlFor={`review-${item.id}`}>Indoklás</label>
              <textarea
                id={`review-${item.id}`}
                maxLength={2000}
                value={rationale[item.id] ?? ""}
                onChange={(e) =>
                  setRationale({ ...rationale, [item.id]: e.target.value })
                }
              />
              <div className={styles.actions}>
                {[
                  ["approved", "Jóváhagyom"],
                  ["needs_revision", "Javítást kérek"],
                  ["rejected", "Elutasítom"],
                ].map(([decision, label]) => (
                  <button
                    className={styles.secondary}
                    type="button"
                    key={decision}
                    disabled={
                      busy ||
                      !rationale[item.id]?.trim() ||
                      (decision === "approved" &&
                        !item.answer?.claims.every(
                          (c) =>
                            checked[item.id + c.id] &&
                            c.evidenceRefs.every(
                              (r) =>
                                sources[`${r.id}:${r.revision}`] &&
                                !sources[`${r.id}:${r.revision}`].startsWith(
                                  "A forrás",
                                ),
                            ),
                        ))
                    }
                    onClick={() => void review(item, decision)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
