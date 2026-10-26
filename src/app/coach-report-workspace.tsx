"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./coach-report-workspace.module.css";

type Report = {
  id: string;
  revision: number;
  playerId: string;
  status: "restricted" | "ready" | "deleted";
  scanStatus: "pending" | "passed" | "failed";
  latestExtractionRef: { id: string; revision: number } | null;
};
type ExtractedField = {
  field: string;
  page: number;
  unit: string | null;
  rawValue: string;
  interpretationDirection: string | null;
  normSource: null;
  review: {
    status: "pending" | "approved" | "rejected";
    rationale: string;
  };
};
type Extraction = {
  id: string;
  revision: number;
  status: "awaiting_review" | "verified" | "rejected";
  fields: ExtractedField[];
};
type InputField = {
  id: string;
  field: string;
  page: string;
  rawValue: string;
  unit: string;
};

const CHUNK_SIZE = 1_048_576;
const MAX_FILE_SIZE = 10 * 1_048_576;

function digestHex(bytes: ArrayBuffer) {
  return crypto.subtle
    .digest("SHA-256", bytes)
    .then((digest) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    );
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const messages: Record<string, string> = {
      AUTHENTICATION_REQUIRED: "Lejárt a bejelentkezésed. Jelentkezz be újra.",
      ACCESS_DENIED: "Ehhez a művelethez nincs hozzáférésed.",
      DEPENDENCY_UNAVAILABLE: "A Habi szolgáltatás átmenetileg nem érhető el.",
      INVALID_INPUT:
        "Ellenőrizd a megadott adatokat és a kiválasztott PDF-fájlt.",
      NOT_FOUND:
        "A riport vagy a játékos már nem érhető el ezzel a hozzáféréssel.",
      REVISION_CONFLICT:
        "Az adatok közben megváltoztak. Frissítsd a lapot, majd próbáld újra.",
    };
    throw new Error(
      messages[body?.code] ?? "A művelet nem sikerült. Próbáld újra.",
    );
  }
  return body;
}

export default function CoachReportWorkspace({
  playerId,
  playerName,
  csrfToken,
}: {
  playerId: string;
  playerName: string;
  csrfToken: string;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [extractions, setExtractions] = useState<Record<string, Extraction>>(
    {},
  );
  const [fields, setFields] = useState<Record<string, InputField[]>>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">(
    "success",
  );

  const loadReports = useCallback(async () => {
    const response = await fetch(
      `/api/v1/players/${encodeURIComponent(playerId)}/reports`,
      { cache: "no-store", credentials: "same-origin" },
    );
    const body = await readResponse(response);
    const items = Array.isArray(body.items) ? (body.items as Report[]) : [];
    setReports(items);
    const refs = items.filter((item) => item.latestExtractionRef);
    const loaded = await Promise.all(
      refs.map(async (item) => {
        const ref = item.latestExtractionRef;
        if (!ref) return null;
        const result = await fetch(
          `/api/v1/extractions/${encodeURIComponent(ref.id)}`,
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        )
          .then(readResponse)
          .catch(() => null);
        return result ? ([item.id, result as Extraction] as const) : null;
      }),
    );
    setExtractions((current) => ({
      ...current,
      ...Object.fromEntries(loaded.filter((item) => item !== null)),
    }));
  }, [playerId]);

  useEffect(() => {
    void loadReports().catch((error: unknown) => {
      setMessage(
        error instanceof Error ? error.message : "A riportok nem tölthetők be.",
      );
      setMessageKind("error");
    });
    const timer = window.setInterval(() => {
      void loadReports().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadReports]);

  async function uploadReport() {
    if (!file || busy) return;
    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      setMessage("PDF-fájl szükséges, legfeljebb 10 MB méretben.");
      setMessageKind("error");
      return;
    }
    setBusy(true);
    setMessage("A kérdőíveredmény feltöltése folyamatban…");
    setMessageKind("success");
    try {
      const bytes = await file.arrayBuffer();
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
        throw new Error("A kiválasztott fájl nem érvényes PDF.");
      }
      const sha256 = await digestHex(bytes);
      const upload = await fetch(
        `/api/v1/players/${encodeURIComponent(playerId)}/uploads`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            size: file.size,
            mime: "application/pdf",
            sha256,
          }),
        },
      ).then(readResponse);

      const count = Math.ceil(file.size / CHUNK_SIZE);
      for (let index = 0; index < count; index += 1) {
        const chunk = await file
          .slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
          .arrayBuffer();
        await fetch(
          `/api/v1/uploads/${encodeURIComponent(upload.id)}/chunks/${index}`,
          {
            method: "PUT",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/octet-stream",
              "x-habi-csrf": csrfToken,
              "x-chunk-sha256": await digestHex(chunk),
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: chunk,
          },
        ).then(readResponse);
        setMessage(`Feltöltés… ${Math.round(((index + 1) / count) * 100)}%`);
      }

      await fetch(`/api/v1/uploads/${encodeURIComponent(upload.id)}/finalize`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-habi-csrf": csrfToken,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: "{}",
      }).then(readResponse);
      setFile(null);
      const input = document.getElementById(
        "survey-pdf",
      ) as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage(
        "A fájl feltöltve. Biztonsági vizsgálat után megjelenik az adatbevitel.",
      );
      await loadReports();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "A feltöltés nem sikerült.",
      );
      setMessageKind("error");
    } finally {
      setBusy(false);
    }
  }

  function updateField(
    reportId: string,
    index: number,
    key: keyof InputField,
    value: string,
  ) {
    setFields((current) => ({
      ...current,
      [reportId]: (current[reportId] ?? []).map((field, itemIndex) =>
        itemIndex === index ? { ...field, [key]: value } : field,
      ),
    }));
  }

  function addField(reportId: string) {
    setFields((current) => ({
      ...current,
      [reportId]: [
        ...(current[reportId] ?? []),
        {
          id: crypto.randomUUID(),
          field: "",
          page: "1",
          rawValue: "",
          unit: "",
        },
      ],
    }));
  }

  function removeField(reportId: string, index: number) {
    setFields((current) => ({
      ...current,
      [reportId]: (current[reportId] ?? []).filter(
        (_field, itemIndex) => itemIndex !== index,
      ),
    }));
  }

  async function saveInputs(report: Report) {
    const inputs = fields[report.id] ?? [];
    if (busy) return;
    if (
      !inputs.length ||
      inputs.some((item) => !item.field.trim() || !item.rawValue.trim())
    ) {
      setMessage(
        "Minden mezőhöz add meg a nevét és az eredeti értékét, vagy távolítsd el az üres sort.",
      );
      setMessageKind("error");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await fetch(
        `/api/v1/reports/${encodeURIComponent(report.id)}/extractions`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            reportRef: { id: report.id, revision: report.revision },
            fields: inputs.map((item) => ({
              field: item.field.trim(),
              page: Math.max(1, Number(item.page) || 1),
              unit: item.unit.trim() || null,
              rawValue: item.rawValue.trim(),
              interpretationDirection: null,
              normSource: null,
              review: {
                status: "pending",
                actorId: null,
                rationale: "Kézi adatbevitel; edzői ellenőrzésre vár.",
                at: null,
              },
            })),
          }),
        },
      ).then(readResponse);
      setExtractions((current) => ({
        ...current,
        [report.id]: created as Extraction,
      }));
      setMessage(
        "Az adatok mentve. Ellenőrizd a mezőket, majd hagyd jóvá őket.",
      );
      await loadReports();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Az adatbevitel nem menthető.",
      );
      setMessageKind("error");
    } finally {
      setBusy(false);
    }
  }

  async function approveExtraction(report: Report, extraction: Extraction) {
    if (busy) return;
    setBusy(true);
    try {
      const reviewed = await fetch(
        `/api/v1/extractions/${encodeURIComponent(extraction.id)}/review`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            expectedRevision: extraction.revision,
            fields: extraction.fields.map((field) => ({
              field: field.field,
              page: field.page,
              decision: "approve",
              rationale:
                "A feltöltött kérdőív mezőjével összevetve ellenőrizve.",
            })),
          }),
        },
      ).then(readResponse);
      setExtractions((current) => ({
        ...current,
        [report.id]: reviewed as Extraction,
      }));
      setMessage("Az adatmezők ellenőrzése és jóváhagyása elmentve.");
      setMessageKind("success");
      await loadReports();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Az ellenőrzés nem menthető.",
      );
      setMessageKind("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`${styles.panel} workspace-section`}
      aria-labelledby="coach-reports-heading"
    >
      <div className={styles.heading}>
        <span className={styles.metroIcon} aria-hidden="true">
          <svg viewBox="0 0 48 48" focusable="false" aria-hidden="true">
            <path d="M8 8v32h32" />
            <circle cx="8" cy="8" />
            <circle cx="8" cy="40" />
            <circle cx="24" cy="40" />
            <circle cx="40" cy="40" />
          </svg>
        </span>
        <p className={styles.eyebrow}>KÉRDŐÍVEK ÉS EREDMÉNYEK</p>
      </div>
      <h2 id="coach-reports-heading">Feltöltés és adatbevitel</h2>
      <p className={styles.intro}>
        {playerName} sportolói kérdőívének PDF-eredményét töltsd fel. A
        biztonsági vizsgálat után vidd be az adatokat az eredeti oldalszámokkal,
        majd ellenőrizd és hagyd jóvá a rögzített mezőket.
      </p>
      <label htmlFor="survey-pdf">Kérdőíveredmény PDF-fájlja</label>
      <input
        id="survey-pdf"
        type="file"
        accept="application/pdf,.pdf"
        disabled={busy}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        className={styles.primary}
        disabled={busy || !file}
        onClick={() => void uploadReport()}
      >
        {busy ? "Feldolgozás…" : "Kérdőíveredmény feltöltése"}
      </button>

      {message && (
        <p
          className={messageKind === "error" ? styles.error : styles.status}
          role={messageKind === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      )}

      <h3>Korábbi feltöltések</h3>
      {!reports.length ? (
        <p className={styles.intro}>
          Ehhez a játékoshoz még nincs feltöltött kérdőíveredmény.
        </p>
      ) : null}
      <div className={styles.reportList}>
        {reports.map((report) => {
          const extraction = extractions[report.id];
          const rows = fields[report.id] ?? [];
          return (
            <article className={styles.report} key={report.id}>
              <h4>Kérdőíveredmény</h4>
              <p className={styles.intro}>
                {report.scanStatus === "pending" ||
                report.status === "restricted"
                  ? "Biztonsági vizsgálat folyamatban."
                  : report.scanStatus === "failed"
                    ? "A fájl biztonsági vizsgálata nem ment át; az adatok nem használhatók."
                    : "A PDF ellenőrzése rendben, a fájl olvasható."}
              </p>
              {report.status === "ready" && !extraction && (
                <div className={styles.fields}>
                  <h4>Adatmezők kézi rögzítése</h4>
                  <p className={styles.intro}>
                    Minden sort az eredeti kérdőív megfelelő oldaláról tölts ki.
                    Ne alakítsd át és ne következtess hiányzó értékre.
                  </p>
                  {rows.map((item, index) => (
                    <fieldset className={styles.fieldRow} key={item.id}>
                      <legend>Adatmező {index + 1}</legend>
                      <label>
                        Mező neve
                        <input
                          value={item.field}
                          onChange={(event) =>
                            updateField(
                              report.id,
                              index,
                              "field",
                              event.target.value,
                            )
                          }
                          maxLength={200}
                        />
                      </label>
                      <label>
                        Oldal
                        <input
                          type="number"
                          min="1"
                          value={item.page}
                          onChange={(event) =>
                            updateField(
                              report.id,
                              index,
                              "page",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label>
                        Rögzített érték
                        <input
                          value={item.rawValue}
                          onChange={(event) =>
                            updateField(
                              report.id,
                              index,
                              "rawValue",
                              event.target.value,
                            )
                          }
                          maxLength={500}
                        />
                      </label>
                      <label>
                        Mértékegység, ha van
                        <input
                          value={item.unit}
                          onChange={(event) =>
                            updateField(
                              report.id,
                              index,
                              "unit",
                              event.target.value,
                            )
                          }
                          maxLength={100}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.removeField}
                        disabled={busy}
                        aria-label={`Adatmező ${index + 1} eltávolítása`}
                        onClick={() => removeField(report.id, index)}
                      >
                        Mező eltávolítása
                      </button>
                    </fieldset>
                  ))}
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => addField(report.id)}
                    >
                      Új mező
                    </button>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={
                        busy ||
                        !rows.some(
                          (item) => item.field.trim() && item.rawValue.trim(),
                        )
                      }
                      onClick={() => void saveInputs(report)}
                    >
                      Adatbevitel mentése
                    </button>
                  </div>
                </div>
              )}
              {extraction && (
                <div className={styles.fields}>
                  <h4>
                    {extraction.status === "verified"
                      ? "Ellenőrzött adatok"
                      : extraction.status === "rejected"
                        ? "Elutasított adatbevitel"
                        : "Ellenőrzésre váró adatok"}
                  </h4>
                  <dl className={styles.values}>
                    {extraction.fields.map((field) => (
                      <div key={`${field.field}:${field.page}`}>
                        <dt>
                          {field.field} · {field.page}. oldal
                        </dt>
                        <dd>
                          {field.rawValue}
                          {field.unit ? ` ${field.unit}` : ""}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {extraction.status === "awaiting_review" && (
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={busy}
                      onClick={() => void approveExtraction(report, extraction)}
                    >
                      Mezők ellenőrzése és jóváhagyása
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
