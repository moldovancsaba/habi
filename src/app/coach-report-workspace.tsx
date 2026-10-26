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
type SourceRef = { id: string; revision: number; span: null };
type Interpretation = {
  id: string;
  revision: number;
  answerState: string;
  reviewState: string;
  answer: {
    status: string;
    claims: Array<{
      id: string;
      text: string;
      kind: string;
      evidenceRefs: SourceRef[];
    }>;
    unknowns: string[];
    clarifyingQuestions: string[];
    manifest: { sourceRefs: SourceRef[] };
  } | null;
};
type InterpretationJob = {
  jobId: string;
  status: string;
  reasonCode: string | null;
  resultRef: { id: string; revision: number } | null;
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
  const [interpretationQuestion, setInterpretationQuestion] = useState("");
  const [interpretationJob, setInterpretationJob] =
    useState<InterpretationJob | null>(null);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(
    null,
  );
  const [interpretationSource, setInterpretationSource] = useState("");

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

  useEffect(() => {
    const jobId = interpretationJob?.jobId;
    const currentStatus = interpretationJob?.status;
    if (
      !jobId ||
      !["queued", "processing", "waiting"].includes(currentStatus ?? "")
    )
      return;
    let stopped = false;
    let timer: number | undefined;
    let delay = 1500;
    const poll = async () => {
      if (stopped) return;
      try {
        const job = (await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
          credentials: "same-origin",
        }).then(readResponse)) as InterpretationJob;
        if (stopped) return;
        if (["ready", "review"].includes(job.status) && job.resultRef) {
          const result = (await fetch(
            `/api/v1/interpretations/${encodeURIComponent(job.resultRef.id)}`,
            { cache: "no-store", credentials: "same-origin" },
          ).then(readResponse)) as Interpretation;
          if (stopped) return;
          setInterpretation(result);
          setInterpretationJob(job);
          setMessage(
            "Az értelmezés elkészült. Ellenőrizd a forrásokat és a jelzett bizonytalanságokat.",
          );
          setMessageKind("success");
          return;
        }
        if (["failed", "cancelled"].includes(job.status)) {
          setInterpretationJob(job);
          setMessage(
            job.reasonCode === "DEPENDENCY_UNAVAILABLE"
              ? "A helyi feldolgozás jelenleg nem érhető el. A kérdőív adatai megmaradtak; később újra kérheted az értelmezést."
              : "Az értelmezési folyamat lezárult válasz nélkül. A feltöltött és ellenőrzött adatok megmaradtak.",
          );
          setMessageKind("error");
          return;
        }
        setInterpretationJob((current) =>
          current &&
          current.status === job.status &&
          current.reasonCode === job.reasonCode &&
          current.resultRef?.id === job.resultRef?.id
            ? current
            : job,
        );
        delay = Math.min(10000, Math.round(delay * 1.5));
      } catch {
        if (!stopped) {
          setInterpretationJob((current) =>
            current && current.status !== "waiting"
              ? { ...current, status: "waiting" }
              : current,
          );
          setMessage(
            "A kapcsolat átmenetileg megszakadt. Az értelmezési állapotot újra ellenőrizzük.",
          );
          setMessageKind("success");
          delay = Math.min(10000, Math.round(delay * 1.5));
        }
      }
      if (!stopped) timer = window.setTimeout(poll, delay);
    };
    timer = window.setTimeout(poll, delay);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [interpretationJob]);

  async function requestInterpretation() {
    const source = reports
      .map((report) => ({ report, extraction: extractions[report.id] }))
      .find(
        ({ extraction }) => extraction?.id === interpretationSource,
      )?.extraction;
    if (source?.status !== "verified" || !interpretationQuestion.trim() || busy)
      return;
    setBusy(true);
    setMessage("Az értelmezési kérés elküldése…");
    setMessageKind("success");
    setInterpretation(null);
    try {
      const response = await fetch(
        `/api/v1/players/${encodeURIComponent(playerId)}/interpretations`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            threadId: crypto.randomUUID(),
            parentTurnId: null,
            intent: "new_question",
            question: interpretationQuestion.trim(),
            sourceRefs: [
              { id: source.id, revision: source.revision, span: null },
            ],
          }),
        },
      ).then(readResponse);
      setInterpretationQuestion("");
      setInterpretationJob({
        jobId: response.jobId,
        status: "queued",
        reasonCode: null,
        resultRef: null,
      });
      setMessage(
        "A kérés sorba állt a helyi AI-feldolgozáshoz. Az állapotot automatikusan frissítjük.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Az értelmezési kérés nem küldhető el.",
      );
      setMessageKind("error");
    } finally {
      setBusy(false);
    }
  }

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

      <section
        className={styles.interpretation}
        aria-labelledby="report-interpretation-heading"
      >
        <h3 id="report-interpretation-heading">
          Mit szeretnél megérteni a felmérésből?
        </h3>
        <p className={styles.intro}>
          Csak ellenőrzött adatmezőből kérhető forrásolt magyarázat. Az
          AI-válasz nem diagnózis; a bizonytalanságot és az ellenőrzési
          állapotot külön jelezzük.
        </p>
        <label htmlFor="interpretation-source">Ellenőrzött adatforrás</label>
        <select
          id="interpretation-source"
          value={interpretationSource}
          onChange={(event) => setInterpretationSource(event.target.value)}
        >
          <option value="">Válassz ellenőrzött felmérési adatot</option>
          {reports.flatMap((report) => {
            const extraction = extractions[report.id];
            return report.status === "ready" &&
              extraction?.status === "verified"
              ? [
                  <option key={extraction.id} value={extraction.id}>
                    Felmérési eredmény · {extraction.fields.length} ellenőrzött
                    mező
                  </option>,
                ]
              : [];
          })}
        </select>
        <label htmlFor="interpretation-question">Kérdés</label>
        <textarea
          id="interpretation-question"
          rows={3}
          maxLength={2000}
          value={interpretationQuestion}
          onChange={(event) => setInterpretationQuestion(event.target.value)}
          placeholder="Például: Mit mondanak az ellenőrzött értékek, és mit nem lehet belőlük megállapítani?"
        />
        <button
          type="button"
          className={styles.primary}
          disabled={
            busy ||
            !interpretationQuestion.trim() ||
            !interpretationSource ||
            Boolean(
              interpretationJob &&
                ["queued", "processing", "waiting"].includes(
                  interpretationJob.status,
                ),
            )
          }
          onClick={() => void requestInterpretation()}
        >
          {interpretationJob &&
          ["queued", "processing", "waiting"].includes(interpretationJob.status)
            ? "Helyi feldolgozás folyamatban…"
            : "Forrásolt értelmezés kérése"}
        </button>
        {!interpretationSource && (
          <p className={styles.intro}>
            Az értelmezéshez előbb tölts fel PDF-et, rögzítsd a mezőket, majd
            ellenőrizd és hagyd jóvá azokat.
          </p>
        )}
        {interpretation && (
          <article className={styles.interpretationResult} aria-live="polite">
            <p className={styles.eyebrow}>
              HABI ·{" "}
              {interpretation.reviewState === "pending"
                ? "EDZŐI ELLENŐRZÉSRE VÁR"
                : interpretation.answerState.toLocaleUpperCase("hu-HU")}
            </p>
            {interpretation.answer ? (
              <>
                {interpretation.answer.claims.length ? (
                  <ul>
                    {interpretation.answer.claims.map((claim) => (
                      <li key={claim.id}>
                        <strong>
                          {claim.kind === "inference"
                            ? "Értelmezés"
                            : claim.kind === "general"
                              ? "Általános háttér"
                              : "Forrás állítása"}
                          :
                        </strong>{" "}
                        {claim.text}
                        <p className={styles.intro}>
                          Források:{" "}
                          {claim.evidenceRefs
                            .map((ref) => `${ref.id} · ${ref.revision}`)
                            .join(", ") || "nincs hivatkozott bizonyíték"}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.intro}>
                    Nincs forrásokkal alátámasztható állítás. A rendszer nem
                    következtet hiányzó adatra.
                  </p>
                )}
                {interpretation.answer.unknowns.length > 0 && (
                  <p>
                    <strong>Ami nem állapítható meg:</strong>{" "}
                    {interpretation.answer.unknowns.join(" ")}
                  </p>
                )}
                {interpretation.answer.clarifyingQuestions.length > 0 && (
                  <p>
                    <strong>Tisztázó kérdések:</strong>{" "}
                    {interpretation.answer.clarifyingQuestions.join(" ")}
                  </p>
                )}
              </>
            ) : (
              <p className={styles.intro}>
                A feldolgozás elkészült, de válasz nem tehető elérhetővé.
              </p>
            )}
          </article>
        )}
      </section>
    </section>
  );
}
