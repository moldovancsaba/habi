"use client";
import { useCallback, useEffect, useState } from "react";
import { productRequest, commandMessage } from "./product-request";
import styles from "./workspace.module.css";
type Candidate = {
  id: string;
  revision: number;
  status: string;
  text: string;
  exclusions: string[];
  reviews: Array<{ rationale: string; at: string }>;
};
export default function KnowledgeWorkspace({
  csrfToken,
}: {
  csrfToken: string;
}) {
  const [items, setItems] = useState<Candidate[]>([]),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({
    situation: "",
    response: "",
    exclusions: "",
    evidence: "",
  });
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [rationale, setRationale] = useState<Record<string, string>>({});
  const load = useCallback(
    async () =>
      setItems(
        (await productRequest("/api/v1/knowledge", csrfToken, undefined, "GET"))
          .items,
      ),
    [csrfToken],
  );
  useEffect(() => {
    void load().catch(() => setNotice("A minták most nem tölthetők be."));
  }, [load]);
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
  return (
    <section className={styles.panel}>
      <h2>Szakmai minták és felülvizsgálat</h2>
      <p>
        Általánosított helyzeteket rögzíts személyes részletek nélkül. A
        jóváhagyás forrás-, személytelenségi és jogellenőrzéshez kötött.
      </p>
      {notice && <p role="status">{notice}</p>}
      <label htmlFor="pattern-search">Keresés a mintákban</label>
      <input
        id="pattern-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {items
        .filter((item) =>
          `${item.text} ${item.exclusions.join(" ")}`
            .toLocaleLowerCase("hu")
            .includes(search.toLocaleLowerCase("hu")),
        )
        .map((item) => (
          <article className={styles.dataCard} key={item.id}>
            <p className={styles.eyebrow}>
              {item.status === "approved"
                ? "JÓVÁHAGYOTT"
                : item.status === "withdrawn"
                  ? "VISSZAVONT"
                  : "ELLENŐRZÉSRE VÁR"}{" "}
              · {item.revision}. változat
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{item.text}</p>
            <details>
              <summary>Mikor nem alkalmazható?</summary>
              <p>{item.exclusions.join(" ")}</p>
            </details>
            {item.status !== "approved" && (
              <fieldset>
                <legend>Felülvizsgálat</legend>
                {[
                  [
                    "evidence",
                    "A szakmai forrást és alkalmazhatóságot ellenőriztem.",
                  ],
                  ["privacy", "A minta nem azonosít személyt."],
                  ["rights", "A felhasználási jogot ellenőriztem."],
                ].map(([k, label]) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={checks[item.id + k] ?? false}
                      onChange={(e) =>
                        setChecks({
                          ...checks,
                          [item.id + k]: e.target.checked,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            )}
            <label htmlFor={`pattern-review-${item.id}`}>
              Felülvizsgálat indoklása
            </label>
            <textarea
              id={`pattern-review-${item.id}`}
              maxLength={1500}
              value={rationale[item.id] ?? ""}
              onChange={(e) =>
                setRationale({ ...rationale, [item.id]: e.target.value })
              }
            />
            <button
              className={styles.secondary}
              type="button"
              disabled={
                busy ||
                !rationale[item.id]?.trim() ||
                (item.status !== "approved" &&
                  !["evidence", "privacy", "rights"].every(
                    (k) => checks[item.id + k],
                  ))
              }
              onClick={() =>
                void run(async () => {
                  await productRequest(
                    `/api/v1/knowledge/${encodeURIComponent(item.id)}/review`,
                    csrfToken,
                    {
                      expectedRevision: item.revision,
                      decision:
                        item.status === "approved" ? "withdrawn" : "approved",
                      evidenceChecked: checks[`${item.id}evidence`] ?? false,
                      privacyChecked: checks[`${item.id}privacy`] ?? false,
                      rightsChecked: checks[`${item.id}rights`] ?? false,
                      rationale: rationale[item.id],
                    },
                  );
                  await load();
                })
              }
            >
              {item.status === "approved" ? "Minta visszavonása" : "Jóváhagyás"}
            </button>
            <details>
              <summary>Felülvizsgálati előzmények</summary>
              {item.reviews.map((review) => (
                <p key={`${review.at}-${review.rationale}`}>
                  {new Date(review.at).toLocaleString("hu-HU")} ·{" "}
                  {review.rationale}
                </p>
              ))}
            </details>
          </article>
        ))}
      <details>
        <summary>Új minta rögzítése ellenőrzésre</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await productRequest("/api/v1/knowledge", csrfToken, fields);
              setFields({
                situation: "",
                response: "",
                exclusions: "",
                evidence: "",
              });
              await load();
              setNotice("A minta ellenőrzésre vár.");
            });
          }}
        >
          {[
            ["situation", "Általánosított helyzet"],
            ["response", "Válasz iránya és pontosítás"],
            ["exclusions", "Mikor nem alkalmazható?"],
            ["evidence", "Szakmai forrás és indoklás"],
          ].map(([k, label]) => (
            <label key={k} htmlFor={`pattern-${k}`}>
              {label}
              <textarea
                id={`pattern-${k}`}
                required
                maxLength={
                  k === "response" ? 2000 : k === "evidence" ? 1000 : 500
                }
                value={fields[k as keyof typeof fields]}
                onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
              />
            </label>
          ))}
          <button className={styles.primary} disabled={busy} type="submit">
            Minta mentése ellenőrzésre
          </button>
        </form>
      </details>
    </section>
  );
}
