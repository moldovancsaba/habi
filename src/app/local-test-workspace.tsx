"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import instrument from "../../contracts/instrument.json" with { type: "json" };
import practiceCatalog from "../lib/content/practices-v1.json" with {
  type: "json",
};
import styles from "./local-test-workspace.module.css";

type Persona = {
  actorId: string;
  label: string;
  role: "player" | "parent" | "coach";
};
type Answer = {
  id: string;
  revision: number;
  metric: string;
  answerCode: number;
  submittedAt: string;
};
type Session = {
  id: string;
  revision: number;
  status: string;
  timeZone: string;
  startedAt: string;
  completedAt: string | null;
  answers: Answer[];
};
type Result = {
  id: string;
  revision: number;
  completedAt: string;
  answerCodes: Array<{ metric: string; code: number }>;
  interpretation: string;
  suggestion: string;
};
type RecordItem = {
  id: string;
  revision: number;
  kind: string;
  text: string | null;
  metric: string | null;
  answerCode: number | null;
  recordedBy: { actorId: string; role: string };
  sharingClass: string;
  occurredAt: string;
};
type Principal = {
  actorId: string;
  activeRole: string;
  playerIds: string[];
  csrfToken: string;
};
type Plan = {
  id: string;
  revision: number;
  playerId: string;
  status: string;
  sourceRefs: Array<{ id: string; revision: number; span: string | null }>;
  actions: Array<{
    id: string;
    what: string;
    why: string;
    ownerActorId: string;
    dueAt: string;
    stopCondition: string;
  }>;
  acceptances: Array<{
    actorId: string;
    role: string;
    revision: number;
    decision: string;
    at: string;
  }>;
};
type TimelineNode = {
  id: string;
  revision: number;
  submittedAt: string;
  actorRole: string;
  kind: string;
  resourceRef: { id: string; revision: number };
};
type JobStatus = {
  jobId: string;
  status: string;
  reasonCode: string | null;
  resultRef: { id: string; revision: number } | null;
};
type InterpretationView = {
  id: string;
  revision: number;
  threadId: string;
  answerState: string;
  reviewState: string;
  answer: {
    status: string;
    unknowns: string[];
    claims: Array<{
      id: string;
      text: string;
      evidenceRefs: Array<{
        id: string;
        revision: number;
        span: string | null;
      }>;
    }>;
    manifest: {
      sourceRefs: Array<{ id: string; revision: number; span: string | null }>;
    };
  } | null;
};
type ThreadItem = {
  id: string;
  revision: number;
  playerId: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  latestActivityAt: string;
};
type ThreadMessage = {
  id: string;
  threadId: string;
  text: string;
  submittedAt: string;
  recordedBy: { role: string; displayName: string | null };
  replyTo: string | null;
};
type Material = {
  id: string;
  revision: number;
  playerId: string;
  materialId: string;
  version: number;
  status: string;
  title: string;
  text: string;
  sourceRefs: Array<{ id: string; revision: number; span: string | null }>;
};
type QuestionSourceRef = { id: string; revision: number; span: null };
type Report = {
  id: string;
  revision: number;
  playerId: string;
  status: "ready" | "restricted" | "deleted";
  scanStatus: "pending" | "passed" | "failed";
  latestExtractionRef: { id: string; revision: number } | null;
  publicationRef: { id: string; revision: number } | null;
};
type Extraction = {
  id: string;
  revision: number;
  reportRef: { id: string; revision: number };
  status: string;
  fields: Array<{
    field: string;
    page: number;
    unit: string | null;
    rawValue: string;
    review: {
      status: string;
      actorId: string | null;
      rationale: string;
      at: string | null;
    };
  }>;
};

const playerId = "seed-player-001";
const personas: Persona[] = [
  {
    actorId: "seed-a-player-actor",
    label: "Játékos · tesztcsalád",
    role: "player",
  },
  {
    actorId: "seed-a-parent-one",
    label: "Szülő 1 · tesztcsalád",
    role: "parent",
  },
  {
    actorId: "seed-a-parent-two",
    label: "Szülő 2 · tesztcsalád",
    role: "parent",
  },
  { actorId: "seed-a-coach-one", label: "Edző 1 · tesztcsapat", role: "coach" },
  { actorId: "seed-a-coach-two", label: "Edző 2 · tesztcsapat", role: "coach" },
  {
    actorId: "seed-b-player-actor",
    label: "Másik tenant játékosa · izolációs próba",
    role: "player",
  },
];

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof body?.code === "string" ? body.code : "REQUEST_FAILED";
    throw new Error(code);
  }
  return body as T;
}

async function loadReportExtractions(reportId: string): Promise<Extraction[]> {
  const page = await readJson<{ items: Extraction[] }>(
    await fetch(`/api/v1/reports/${encodeURIComponent(reportId)}/extractions`, {
      cache: "no-store",
      credentials: "same-origin",
    }),
  );
  return page.items;
}

function jobReasonMessage(reasonCode: string | null): string | null {
  if (!reasonCode) return null;
  if (
    ["DEPENDENCY_UNAVAILABLE", "TRANSIENT_NETWORK", "HOST_BUSY"].includes(
      reasonCode,
    )
  )
    return "A helyi feldolgozás vagy a kapcsolat átmenetileg nem érhető el. A feladat várakozik, majd automatikusan újrapróbálja.";
  if (["AUTH_REVOKED", "SOURCE_INVALIDATED"].includes(reasonCode))
    return "A hozzáférés vagy a felhasznált forrás megváltozott. Edzői ellenőrzés szükséges.";
  if (["INVALID_INPUT", "UNSUPPORTED_REPORT"].includes(reasonCode))
    return "A beküldött tartalom nem dolgozható fel. Ellenőrizd az adatot, majd kérj segítséget az edzőtől.";
  return "A feladat elakadt; az edző áttekintheti a részleteket.";
}

function idempotencyKey() {
  return globalThis.crypto.randomUUID();
}

export default function LocalTestWorkspace() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [latestResult, setLatestResult] = useState<Result | null>(null);
  const [sharedResults, setSharedResults] = useState<Result[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(
    null,
  );
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [timeline, setTimeline] = useState<TimelineNode[]>([]);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [interpretationAnswer, setInterpretationAnswer] =
    useState<InterpretationView | null>(null);
  const [interpretations, setInterpretations] = useState<InterpretationView[]>(
    [],
  );
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [extractFieldName, setExtractFieldName] = useState("");
  const [extractPage, setExtractPage] = useState("1");
  const [extractRawValue, setExtractRawValue] = useState("");
  const [extractReviewReason, setExtractReviewReason] = useState("");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialText, setMaterialText] = useState("");
  const [supersedesMaterial, setSupersedesMaterial] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  const [reviewRationale, setReviewRationale] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [questionSourceRefs, setQuestionSourceRefs] = useState<
    QuestionSourceRef[]
  >([]);
  const [questionThreadId, setQuestionThreadId] = useState<string | null>(null);
  const [observationText, setObservationText] = useState("");
  const [planAction, setPlanAction] = useState("");
  const [planWhy, setPlanWhy] = useState("");
  const [planStop, setPlanStop] = useState("");
  const [followUpText, setFollowUpText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    "Helyi, szintetikus adatokkal működő tesztkörnyezet. Valódi felhasználói adatot ne adj meg.",
  );
  const [error, setError] = useState<string | null>(null);

  const restoreSession = useCallback(async () => {
    try {
      const who = await readJson<Principal>(
        await fetch("/api/v1/me", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      );
      setPrincipal(who);
      const currentId = sessionStorage.getItem("habi-test-session-id");
      if (currentId && who.activeRole === "player") {
        const current = await readJson<Session>(
          await fetch(
            `/api/v1/checkin-sessions/${encodeURIComponent(currentId)}`,
            { cache: "no-store", credentials: "same-origin" },
          ),
        );
        setSession(current);
      }
      if (who.playerIds.includes(playerId)) {
        const page = await readJson<{ items: Result[] }>(
          await fetch(`/api/v1/players/${playerId}/checkin-results`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
        );
        if (who.activeRole !== "player") setSharedResults(page.items);
        const recordPage = await readJson<{ items: RecordItem[] }>(
          await fetch(`/api/v1/players/${playerId}/records`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
        );
        setRecords(recordPage.items);
        const planPage = await readJson<{ items: Plan[] }>(
          await fetch(`/api/v1/players/${playerId}/plans`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
        );
        setPlans(planPage.items);
        const materialPage = await readJson<{ items: Material[] }>(
          await fetch(`/api/v1/players/${playerId}/materials`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
        );
        setMaterials(materialPage.items);
        if (who.activeRole !== "player") {
          const reportPage = await readJson<{ items: Report[] }>(
            await fetch(`/api/v1/players/${playerId}/reports`, {
              cache: "no-store",
              credentials: "same-origin",
            }),
          );
          setReports(reportPage.items);
          const extractionPages = await Promise.all(
            reportPage.items.map((report) => loadReportExtractions(report.id)),
          );
          setExtractions(extractionPages.flat());
        }
        const timelinePage = await readJson<{ nodes: TimelineNode[] }>(
          await fetch("/api/v1/timeline?limit=50", {
            cache: "no-store",
            credentials: "same-origin",
          }),
        );
        setTimeline(timelinePage.nodes);
        if (who.activeRole !== "player") {
          const [threadPage, interpretationPage] = await Promise.all([
            readJson<{ items: ThreadItem[] }>(
              await fetch(`/api/v1/players/${playerId}/threads`, {
                cache: "no-store",
                credentials: "same-origin",
              }),
            ),
            readJson<{ items: InterpretationView[] }>(
              await fetch(`/api/v1/players/${playerId}/interpretations`, {
                cache: "no-store",
                credentials: "same-origin",
              }),
            ),
          ]);
          setThreads(threadPage.items);
          setInterpretations(interpretationPage.items);
          const latestThread = threadPage.items[0];
          if (latestThread) {
            setQuestionThreadId(latestThread.id);
            const messages = await readJson<{ items: ThreadMessage[] }>(
              await fetch(`/api/v1/threads/${latestThread.id}/messages`, {
                cache: "no-store",
                credentials: "same-origin",
              }),
            );
            setThreadMessages(messages.items.slice().reverse());
            setInterpretationAnswer(
              interpretationPage.items.find(
                (item) => item.threadId === latestThread.id,
              ) ?? null,
            );
          }
        }
      }
    } catch {
      setPrincipal(null);
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const answeredMetrics = useMemo(
    () => new Set(session?.answers.map((answer) => answer.metric) ?? []),
    [session],
  );

  async function signIn(persona: Persona) {
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch("/api/test/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorId: persona.actorId }),
        }),
      );
      await restoreSession();
      setNotice(`Tesztmunkamenet: ${persona.label}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch("/api/test/session", {
          method: "DELETE",
          credentials: "same-origin",
        }),
      );
      setPrincipal(null);
      setSession(null);
      setLatestResult(null);
      setSharedResults([]);
      setRecords([]);
      setPlans([]);
      setTimeline([]);
      setJob(null);
      setInterpretationAnswer(null);
      setInterpretations([]);
      setThreads([]);
      setThreadMessages([]);
      setMaterials([]);
      setReports([]);
      setExtractions([]);
      setMaterialTitle("");
      setMaterialText("");
      setSupersedesMaterial(null);
      setReviewRationale("");
      setQuestionThreadId(null);
      setObservationText("");
      sessionStorage.removeItem("habi-test-session-id");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function startCheckin() {
    if (!principal) return;
    setBusy(true);
    setError(null);
    try {
      const created = await readJson<Session>(
        await fetch(`/api/v1/players/${playerId}/checkin-sessions`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            timeZone: "Europe/Budapest",
            instrumentVersion: instrument.id,
          }),
        }),
      );
      setSession(created);
      setLatestResult(null);
      sessionStorage.setItem("habi-test-session-id", created.id);
      setNotice(
        "A napi állapotjelzés elkezdődött. Csak a megadott válaszokat mentjük.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(metric: string, answerCode: number) {
    if (!principal || !session) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/v1/checkin-sessions/${session.id}/answers`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            expectedRevision: session.revision,
            metric,
            answerCode,
          }),
        }),
      );
      const updated = await readJson<Session>(
        await fetch(`/api/v1/checkin-sessions/${session.id}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      );
      setSession(updated);
      setNotice("A válasz mentve.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function completeCheckin() {
    if (!principal || !session) return;
    setBusy(true);
    setError(null);
    try {
      const result = await readJson<Result>(
        await fetch(`/api/v1/checkin-sessions/${session.id}/complete`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({ expectedRevision: session.revision }),
        }),
      );
      setLatestResult(result);
      setSession(null);
      sessionStorage.removeItem("habi-test-session-id");
      setNotice(
        "A befejezett napi válaszok és az eredeti visszajelzés mentve.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function refreshRecords() {
    const page = await readJson<{ items: RecordItem[] }>(
      await fetch(`/api/v1/players/${playerId}/records`, {
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    setRecords(page.items);
  }

  async function completePractice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (principal?.activeRole !== "player" || !practiceFeedback) return;
    const practice = practiceCatalog.items.find(
      (item) => item.id === selectedPracticeId,
    );
    if (!practice) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/v1/players/${playerId}/records`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            kind: "diary",
            text: `Gyakorlat visszajelzés: ${practice.title} (v${practiceCatalog.version}). ${practiceFeedback}.`,
            occurredAt: new Date().toISOString(),
            timeZone: "Europe/Budapest",
            sourceKind: "self",
            sessionId: null,
            metric: null,
            answerCode: null,
            context: {
              setting: "training",
              activity: `habi-practice:${practice.id}:v${practiceCatalog.version}`,
              durationMinutes: null,
            },
          }),
        }),
      );
      await refreshRecords();
      setPracticeFeedback(null);
      setSelectedPracticeId(null);
      setNotice("A gyakorlatról szóló saját feljegyzésed elmentettük.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function submitObservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!principal || !observationText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/v1/players/${playerId}/records`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            kind: "observation",
            text: observationText.trim(),
            occurredAt: new Date().toISOString(),
            timeZone: "Europe/Budapest",
            sourceKind:
              principal.activeRole === "parent" ? "proxy" : "observation",
            sessionId: null,
            metric: null,
            answerCode: null,
            context: {
              setting: "training",
              activity: null,
              durationMinutes: null,
            },
          }),
        }),
      );
      setObservationText("");
      await refreshRecords();
      setNotice(
        "A megfigyelés a rögzítő és a forrás megkülönböztetésével mentődött.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function publishObservation(record: RecordItem) {
    if (!principal) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch("/api/v1/publications", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            resourceRef: { id: record.id, revision: record.revision },
          }),
        }),
      );
      await refreshRecords();
      setNotice(
        "A megfigyelés pontos revisionje mostantól látható az engedélyezett szülőknek.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function refreshMaterials() {
    const page = await readJson<{ items: Material[] }>(
      await fetch(`/api/v1/players/${playerId}/materials`, {
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    setMaterials(page.items);
  }

  async function createMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!principal || !materialTitle.trim() || !materialText.trim()) return;
    const source =
      records.find((record) => record.kind === "observation") ?? records[0];
    if (!source) {
      setError(
        "Az edzői anyaghoz előbb rögzíts egy megfigyelést vagy válassz egy másik forrást.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await readJson<Material>(
        await fetch(`/api/v1/players/${playerId}/materials`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            title: materialTitle.trim(),
            text: materialText.trim(),
            sourceRefs: [
              { id: source.id, revision: source.revision, span: null },
            ],
            supersedesRef: supersedesMaterial,
          }),
        }),
      );
      setMaterialTitle("");
      setMaterialText("");
      setSupersedesMaterial(null);
      await refreshMaterials();
      setNotice("Az edzői anyag új, nem publikált verzióként mentődött.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function publishMaterial(material: Material) {
    if (!principal) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch("/api/v1/publications", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            resourceRef: { id: material.id, revision: material.revision },
          }),
        }),
      );
      await refreshMaterials();
      setNotice(
        "A kiválasztott, pontos edzői anyagverzió megjelent a jogosult szülői nézetben.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function refreshReports() {
    const page = await readJson<{ items: Report[] }>(
      await fetch(`/api/v1/players/${playerId}/reports`, {
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    setReports(page.items);
    const extractionPages = await Promise.all(
      page.items.map((report) => loadReportExtractions(report.id)),
    );
    setExtractions(extractionPages.flat());
  }

  async function uploadReport(file: File | undefined) {
    if (!principal || !file) return;
    if (
      file.type !== "application/pdf" ||
      file.size < 1 ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Csak legfeljebb 10 MiB-os PDF tölthető fel.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      const digest = async (chunk: ArrayBuffer) =>
        Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", chunk)))
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      const sha256 = await digest(bytes);
      const upload = await readJson<{ id: string }>(
        await fetch(`/api/v1/players/${playerId}/uploads`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            size: file.size,
            mime: "application/pdf",
            sha256,
          }),
        }),
      );
      for (let index = 0; index * 1_048_576 < file.size; index += 1) {
        const chunk = bytes.slice(
          index * 1_048_576,
          Math.min((index + 1) * 1_048_576, file.size),
        );
        const chunkHash = await digest(chunk);
        await readJson(
          await fetch(
            `/api/v1/uploads/${encodeURIComponent(upload.id)}/chunks/${index}`,
            {
              method: "PUT",
              credentials: "same-origin",
              headers: {
                "x-habi-csrf": principal.csrfToken,
                "Idempotency-Key": idempotencyKey(),
                "X-Chunk-SHA256": chunkHash,
                "Content-Type": "application/octet-stream",
              },
              body: chunk,
            },
          ),
        );
      }
      await readJson(
        await fetch(
          `/api/v1/uploads/${encodeURIComponent(upload.id)}/finalize`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "x-habi-csrf": principal.csrfToken,
              "Idempotency-Key": idempotencyKey(),
            },
            body: JSON.stringify({}),
          },
        ),
      );
      await refreshReports();
      setNotice(
        "A PDF karanténba került. A helyi ellenőrzés befejezéséig a fájl nem tölthető le és nem használható fel.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function createManualExtraction(
    event: FormEvent<HTMLFormElement>,
    report: Report,
  ) {
    event.preventDefault();
    if (!principal || !extractFieldName.trim() || !extractRawValue.trim())
      return;
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/v1/reports/${report.id}/extractions`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            reportRef: { id: report.id, revision: report.revision },
            fields: [
              {
                field: extractFieldName.trim(),
                page: Number(extractPage),
                unit: null,
                rawValue: extractRawValue.trim(),
                interpretationDirection: null,
                normSource: null,
                review: {
                  status: "pending",
                  actorId: null,
                  rationale: "Ellenőrzésre vár.",
                  at: null,
                },
              },
            ],
          }),
        }),
      );
      setExtractFieldName("");
      setExtractRawValue("");
      setExtractReviewReason("");
      await refreshExtractions(report.id);
      setNotice(
        "A mező ellenőrzésre vár; az elküldött állapot nem jelenti a hitelesítést.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function refreshExtractions(reportId: string) {
    const items = await loadReportExtractions(reportId);
    setExtractions((current) => [
      ...current.filter((item) => item.reportRef.id !== reportId),
      ...items,
    ]);
  }

  async function reviewExtractedField(
    item: Extraction,
    field: Extraction["fields"][number],
    decision: "approve" | "reject",
  ) {
    if (!principal || !extractReviewReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/v1/extractions/${item.id}/review`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            expectedRevision: item.revision,
            fields: [
              {
                field: field.field,
                page: field.page,
                decision,
                rationale: extractReviewReason.trim(),
              },
            ],
          }),
        }),
      );
      await refreshExtractions(item.reportRef.id);
      setExtractReviewReason("");
      setNotice(
        decision === "approve"
          ? "A mező edzői ellenőrzése rögzítve."
          : "A mező elutasított; nem válik forrásként felhasználhatóvá.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function refreshPlans() {
    const page = await readJson<{ items: Plan[] }>(
      await fetch(`/api/v1/players/${playerId}/plans`, {
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    setPlans(page.items);
  }

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!principal || !planAction.trim() || !planWhy.trim() || !planStop.trim())
      return;
    const source =
      records.find((record) => record.kind === "observation") ?? records[0];
    if (!source) {
      setError("A tervhez előbb rögzíts vagy válassz egy látható forrást.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      await readJson(
        await fetch(`/api/v1/players/${playerId}/plans`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            sourceRefs: [
              { id: source.id, revision: source.revision, span: null },
            ],
            answerRef: null,
            actions: [
              {
                id: globalThis.crypto.randomUUID(),
                what: planAction.trim(),
                why: planWhy.trim(),
                ownerActorId: "seed-a-player-actor",
                dueAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
                stopCondition: planStop.trim(),
              },
            ],
          }),
        }),
      );
      setPlanAction("");
      setPlanWhy("");
      setPlanStop("");
      await refreshPlans();
      setNotice(
        "Az edzői segítségkérés és a vállalt következő lépés mentődött.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function decidePlan(plan: Plan, decision: "accept" | "decline") {
    if (!principal) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/v1/plans/${plan.id}/acceptance`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
            "If-Match": String(plan.revision),
          },
          body: JSON.stringify({ expectedRevision: plan.revision, decision }),
        }),
      );
      await refreshPlans();
      setNotice(
        decision === "accept"
          ? "A tervet elfogadtad; státusza aktív."
          : "A tervet elutasítottad.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function submitFollowUp(event: FormEvent<HTMLFormElement>, plan: Plan) {
    event.preventDefault();
    if (!principal || !followUpText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/v1/players/${playerId}/follow-ups`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            planRef: { id: plan.id, revision: plan.revision },
            actionId: plan.actions[0].id,
            occurredAt: new Date().toISOString(),
            context: {
              setting: "training",
              activity: null,
              durationMinutes: null,
            },
            sourceKind:
              principal.activeRole === "player"
                ? "self"
                : principal.activeRole === "parent"
                  ? "proxy"
                  : "observation",
            outcome: "unknown",
            text: followUpText.trim(),
            comparable: false,
            comparabilityReason:
              "Első helyi tesztfeljegyzés; összehasonlíthatóságot még nem állítunk.",
          }),
        }),
      );
      setFollowUpText("");
      setNotice("Az utánkövetés rögzítve lett.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function selectThread(thread: ThreadItem) {
    setQuestionThreadId(thread.id);
    setJob(null);
    setError(null);
    try {
      const messages = await readJson<{ items: ThreadMessage[] }>(
        await fetch(
          `/api/v1/threads/${encodeURIComponent(thread.id)}/messages`,
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        ),
      );
      setThreadMessages(messages.items.slice().reverse());
      setInterpretationAnswer(
        interpretations.find((item) => item.threadId === thread.id) ?? null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!principal || !questionText.trim()) return;
    if (questionSourceRefs.length === 0) {
      setError("Válassz legalább egy számodra látható forrást.");
      return;
    }
    setBusy(true);
    setError(null);
    const threadId = globalThis.crypto.randomUUID();
    try {
      const accepted = await readJson<{ jobId: string }>(
        await fetch(`/api/v1/players/${playerId}/interpretations`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            threadId,
            question: questionText.trim(),
            sourceRefs: questionSourceRefs,
            intent: "new_question",
            parentTurnId: null,
          }),
        }),
      );
      setQuestionThreadId(threadId);
      setQuestionText("");
      setQuestionSourceRefs([]);
      const messages = await readJson<{ items: ThreadMessage[] }>(
        await fetch(`/api/v1/threads/${threadId}/messages`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      );
      setThreadMessages(messages.items.slice().reverse());
      setThreads((current) => [
        {
          id: threadId,
          revision: 1,
          playerId,
          status: "open",
          openedAt: new Date().toISOString(),
          closedAt: null,
          latestActivityAt: new Date().toISOString(),
        },
        ...current.filter((thread) => thread.id !== threadId),
      ]);
      setJob({
        jobId: accepted.jobId,
        status: "queued",
        reasonCode: null,
        resultRef: null,
      });
      setNotice(
        "A kérdés biztonságosan sorba került. Ha a helyi AI vagy az internet nem érhető el, a munka várakozik; ezt nem jelentjük hibás tartalomként.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const activeJobId = job?.jobId;
  const activeJobStatus = job?.status;

  useEffect(() => {
    if (
      !activeJobId ||
      !["queued", "processing", "review"].includes(activeJobStatus ?? "")
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const next = await readJson<JobStatus>(
          await fetch(`/api/v1/jobs/${encodeURIComponent(activeJobId)}`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
        );
        if (cancelled) return;
        setJob(next);
      } catch {
        if (!cancelled)
          setNotice(
            "A státuszkapcsolat megszakadt. A kérés a szerveren várakozik; újrapróbáljuk ellenőrizni.",
          );
      }
      if (!cancelled) timer = setTimeout(() => void refresh(), 5000);
    };
    timer = setTimeout(() => void refresh(), 2500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJobId, activeJobStatus]);

  useEffect(() => {
    if (job?.status !== "ready" || !job.resultRef?.id) return;
    let cancelled = false;
    void fetch(
      `/api/v1/interpretations/${encodeURIComponent(job.resultRef.id)}`,
      { cache: "no-store", credentials: "same-origin" },
    )
      .then(readJson<InterpretationView>)
      .then((result) => {
        if (!cancelled) setInterpretationAnswer(result);
      })
      .catch(() => {
        if (!cancelled)
          setNotice(
            "A válasz részlete még nem érhető el. A feladat állapota megmarad; később újrapróbáljuk.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [job?.status, job?.resultRef?.id]);

  async function reviewGeneratedAnswer(
    item: InterpretationView,
    decision: "approved" | "rejected" | "needs_revision",
  ) {
    if (!principal || !item.answer || !reviewRationale.trim()) return;
    const claimReviews = item.answer.claims.map((claim) => ({
      claimId: claim.id,
      verdict:
        decision === "approved"
          ? "supported"
          : decision === "rejected"
            ? "unsupported"
            : "unclear",
      checkedSourceRefs: claim.evidenceRefs,
    }));
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/v1/interpretations/${item.id}/review`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-habi-csrf": principal.csrfToken,
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify({
            interpretationRevision: item.revision,
            decision,
            rationale: reviewRationale.trim(),
            claimReviews,
            sourceRevisionSet: item.answer.manifest.sourceRefs,
          }),
        }),
      );
      setReviewRationale("");
      const page = await readJson<{ items: InterpretationView[] }>(
        await fetch(`/api/v1/players/${playerId}/interpretations`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      );
      setInterpretations(page.items);
      setNotice(
        decision === "approved"
          ? "A válasz és a források coach által ellenőrizve és jóváhagyva."
          : "A válasz nem lett szülői vagy játékosi nézetben publikálva.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const visibleResults = latestResult
    ? [latestResult, ...sharedResults]
    : sharedResults;
  const practiceHistory = records.filter(
    (record) =>
      record.kind === "diary" &&
      record.text?.startsWith("Gyakorlat visszajelzés:"),
  );
  const questionSources: Array<{
    ref: QuestionSourceRef;
    label: string;
    detail: string;
  }> = [
    ...visibleResults.map((result) => ({
      ref: { id: result.id, revision: result.revision, span: null },
      label: "Napi állapotjelzés",
      detail: new Date(result.completedAt).toLocaleString("hu-HU", {
        timeZone: "Europe/Budapest",
      }),
    })),
    ...records.map((record) => ({
      ref: { id: record.id, revision: record.revision, span: null },
      label:
        record.kind === "observation"
          ? record.recordedBy.role === "coach"
            ? "Edzői megfigyelés"
            : "Szülői megfigyelés"
          : record.kind === "checkin_answer"
            ? "Napi válasz"
            : "Saját feljegyzés",
      detail: `${new Date(record.occurredAt).toLocaleString("hu-HU", {
        timeZone: "Europe/Budapest",
      })}${record.metric ? ` · ${instrument.items.find((item) => item.id === record.metric)?.text ?? record.metric}` : ""}${record.answerCode !== null && record.metric ? ` · ${instrument.items.find((item) => item.id === record.metric)?.choices.find((choice) => choice.code === record.answerCode)?.label ?? ""}` : ""}${record.text ? ` · ${record.text}` : ""}`,
    })),
  ];
  const questionSourceKey = (ref: QuestionSourceRef) =>
    `${ref.id}:${ref.revision}`;
  const toggleQuestionSource = (ref: QuestionSourceRef) => {
    const key = questionSourceKey(ref);
    setQuestionSourceRefs((current) =>
      current.some((item) => questionSourceKey(item) === key)
        ? current.filter((item) => questionSourceKey(item) !== key)
        : [...current, ref],
    );
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className="brand">Habi</p>
          <p className="eyebrow">
            Helyi tesztkörnyezet · csak szintetikus adatok
          </p>
        </header>

        <section
          className={`workspace-section ${styles.panel}`}
          aria-labelledby="test-title"
        >
          <p className="eyebrow">Első működő szerepköri folyamat</p>
          <h1 id="test-title">Napi állapotjelzés, mentett előzmények</h1>
          <p className={styles.intro}>
            A játékos rögzíti a saját válaszait. A jogosult szülő és edző
            ugyanazt a lezárt, változatlan visszajelzést látja.
          </p>
          <p className="sharing-note" role="status">
            {notice}
          </p>
          {error && (
            <p className={styles.error} role="alert">
              A kérés nem sikerült: {error}
            </p>
          )}

          {!principal ? (
            <fieldset className={styles.personas}>
              <legend>Szintetikus szerep kiválasztása</legend>
              {personas.map((persona) => (
                <button
                  key={persona.actorId}
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void signIn(persona)}
                >
                  {persona.label}
                </button>
              ))}
            </fieldset>
          ) : (
            <div className={styles.workspace}>
              <div className={styles.sessionBar}>
                <p>
                  Aktív szerep:{" "}
                  <strong>
                    {principal.activeRole === "player"
                      ? "Játékos"
                      : principal.activeRole === "parent"
                        ? "Szülő"
                        : "Edző"}
                  </strong>
                </p>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void signOut()}
                >
                  Kilépés a tesztből
                </button>
              </div>

              {principal.activeRole === "player" &&
                !session &&
                !latestResult && (
                  <button
                    className="primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void startCheckin()}
                  >
                    Napi állapotjelzés indítása
                  </button>
                )}

              {principal.activeRole === "player" && session && (
                <div className={styles.checkin}>
                  <h2>Napi kérdések</h2>
                  <p>
                    A kérdések válaszai külön-külön mentődnek. A befejezés
                    kifejezett művelet.
                  </p>
                  {instrument.items.map((item) => (
                    <fieldset className={styles.question} key={item.id}>
                      <legend>
                        {item.text}
                        {answeredMetrics.has(item.id) ? " · mentve" : ""}
                      </legend>
                      <div className={styles.choices}>
                        {item.choices.map((choice) => (
                          <button
                            key={choice.code}
                            type="button"
                            className="secondary"
                            disabled={busy || answeredMetrics.has(item.id)}
                            onClick={() =>
                              void submitAnswer(item.id, choice.code)
                            }
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  <p>{session.answers.length} válasz mentve az 5 kérdésből.</p>
                  <button
                    className="primary"
                    type="button"
                    disabled={busy || session.answers.length === 0}
                    onClick={() => void completeCheckin()}
                  >
                    Napi állapotjelzés befejezése
                  </button>
                </div>
              )}

              {principal.activeRole === "player" && (
                <section aria-labelledby="practice-library-title">
                  <h2 id="practice-library-title">
                    Gyakorlatok és kapaszkodók
                  </h2>
                  <p>
                    Rövid, önkéntes ötletek. Bármelyiket kihagyhatod vagy
                    félbehagyhatod; ezek nem diagnózisok és nem helyettesítik
                    egy megbízható felnőtt segítségét.
                  </p>
                  <ul className={styles.practiceList}>
                    {practiceCatalog.items.map((practice) => (
                      <li key={practice.id}>
                        <article className={styles.result}>
                          <h3>{practice.title}</h3>
                          <p>{practice.what}</p>
                          <p>{practice.how}</p>
                          <button
                            className="secondary"
                            type="button"
                            aria-expanded={selectedPracticeId === practice.id}
                            aria-controls={`practice-feedback-${practice.id}`}
                            onClick={() => {
                              setSelectedPracticeId((current) =>
                                current === practice.id ? null : practice.id,
                              );
                              setPracticeFeedback(null);
                            }}
                          >
                            {selectedPracticeId === practice.id
                              ? "Visszajelzés bezárása"
                              : "Visszajelzek erről"}
                          </button>
                          {selectedPracticeId === practice.id && (
                            <form
                              id={`practice-feedback-${practice.id}`}
                              className={styles.practiceFeedback}
                              onSubmit={(event) => void completePractice(event)}
                            >
                              <fieldset className={styles.question}>
                                <legend>Mi illik most rád?</legend>
                                {[
                                  "Kipróbáltam",
                                  "Részben hasznos volt",
                                  "Most nem nekem való",
                                ].map((choice) => (
                                  <label
                                    className={styles.practiceChoice}
                                    key={choice}
                                  >
                                    <input
                                      type="radio"
                                      name="practice-feedback"
                                      value={choice}
                                      checked={practiceFeedback === choice}
                                      onChange={() =>
                                        setPracticeFeedback(choice)
                                      }
                                    />
                                    {choice}
                                  </label>
                                ))}
                              </fieldset>
                              <button
                                className="primary"
                                type="submit"
                                disabled={busy || !practiceFeedback}
                              >
                                Visszajelzés mentése
                              </button>
                            </form>
                          )}
                        </article>
                      </li>
                    ))}
                  </ul>
                  <h3>Saját visszajelzéseid a gyakorlatokról</h3>
                  {practiceHistory.length === 0 ? (
                    <p>Még nincs elmentett gyakorlat-visszajelzésed.</p>
                  ) : (
                    <ul>
                      {practiceHistory.map((record) => (
                        <li key={record.id}>
                          <time dateTime={record.occurredAt}>
                            {new Date(record.occurredAt).toLocaleDateString(
                              "hu-HU",
                              { timeZone: "Europe/Budapest" },
                            )}
                          </time>
                          {" · "}
                          {record.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {principal.activeRole !== "player" && (
                <section aria-labelledby="shared-title">
                  <h2 id="shared-title">Megosztott napi válaszok</h2>
                  {visibleResults.length === 0 ? (
                    <p>Még nincs megosztott befejezett állapotjelzés.</p>
                  ) : (
                    visibleResults.map((result) => (
                      <article className={styles.result} key={result.id}>
                        <h3>
                          {new Date(result.completedAt).toLocaleString(
                            "hu-HU",
                            { timeZone: "Europe/Budapest" },
                          )}
                        </h3>
                        <ul>
                          {result.answerCodes.map((answer) => {
                            const item = instrument.items.find(
                              (entry) => entry.id === answer.metric,
                            );
                            const label =
                              item?.choices.find(
                                (choice) => choice.code === answer.code,
                              )?.label ?? "Ismeretlen válasz";
                            return (
                              <li key={answer.metric}>
                                {item?.text}: {label}
                              </li>
                            );
                          })}
                        </ul>
                        <p>{result.interpretation}</p>
                        <p>{result.suggestion}</p>
                      </article>
                    ))
                  )}
                </section>
              )}

              {principal.activeRole === "coach" && (
                <section aria-labelledby="plan-title">
                  <h2 id="plan-title">Edzői segítségkérés és terv</h2>
                  <form
                    className={styles.observationForm}
                    onSubmit={(event) => void submitPlan(event)}
                  >
                    <label htmlFor="plan-action">Következő lépés</label>
                    <textarea
                      id="plan-action"
                      maxLength={1000}
                      required
                      value={planAction}
                      onChange={(event) => setPlanAction(event.target.value)}
                    />
                    <label htmlFor="plan-why">Miért ezt próbáljuk?</label>
                    <textarea
                      id="plan-why"
                      maxLength={1000}
                      required
                      value={planWhy}
                      onChange={(event) => setPlanWhy(event.target.value)}
                    />
                    <label htmlFor="plan-stop">
                      Mikor állítsuk le vagy egyeztessünk újra?
                    </label>
                    <textarea
                      id="plan-stop"
                      maxLength={1000}
                      required
                      value={planStop}
                      onChange={(event) => setPlanStop(event.target.value)}
                    />
                    <button
                      className="primary"
                      type="submit"
                      disabled={
                        busy ||
                        !planAction.trim() ||
                        !planWhy.trim() ||
                        !planStop.trim()
                      }
                    >
                      Terv javaslata
                    </button>
                  </form>
                </section>
              )}

              {principal.activeRole === "parent" && (
                <section aria-labelledby="question-title">
                  <h2 id="question-title">
                    Kérdés az engedélyezett forrásokról
                  </h2>
                  <p>
                    Válaszd ki a felhasználni kívánt, számodra látható
                    forrásokat. A Mac helyi AI-workere kizárólag ezeket a
                    kiválasztott, ellenőrzött verziókat kapja meg. Kapcsolati
                    vagy helyi modellhiba esetén a kérés várakozik és
                    újrapróbálkozik.
                  </p>
                  {threads.length > 0 && (
                    <section aria-labelledby="thread-history-title">
                      <h3 id="thread-history-title">Korábbi beszélgetések</h3>
                      <ul className={styles.threadList}>
                        {threads.map((thread) => (
                          <li key={thread.id}>
                            <button
                              className="secondary"
                              type="button"
                              aria-pressed={questionThreadId === thread.id}
                              onClick={() => void selectThread(thread)}
                            >
                              {new Date(thread.latestActivityAt).toLocaleString(
                                "hu-HU",
                                { timeZone: "Europe/Budapest" },
                              )}
                              {thread.status === "closed"
                                ? " · lezárva"
                                : " · nyitott"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <form
                    className={styles.observationForm}
                    onSubmit={(event) => void submitQuestion(event)}
                  >
                    <label htmlFor="parent-question">
                      Mit szeretnél megérteni?
                    </label>
                    <fieldset className={styles.question}>
                      <legend>Felhasználható források</legend>
                      {questionSources.length === 0 ? (
                        <p>Nincs még kiválasztható, látható forrás.</p>
                      ) : (
                        questionSources.map(({ ref, label, detail }) => (
                          <label
                            className={styles.sourceChoice}
                            key={questionSourceKey(ref)}
                          >
                            <input
                              type="checkbox"
                              checked={questionSourceRefs.some(
                                (selected) =>
                                  questionSourceKey(selected) ===
                                  questionSourceKey(ref),
                              )}
                              onChange={() => toggleQuestionSource(ref)}
                            />
                            <span>
                              <strong>{label}</strong>
                              <small>{detail}</small>
                            </span>
                          </label>
                        ))
                      )}
                    </fieldset>
                    <textarea
                      id="parent-question"
                      maxLength={2000}
                      required
                      value={questionText}
                      onChange={(event) => setQuestionText(event.target.value)}
                    />
                    <button
                      className="primary"
                      type="submit"
                      disabled={
                        busy ||
                        !questionText.trim() ||
                        questionSourceRefs.length === 0
                      }
                    >
                      Kérdés sorba állítása
                    </button>
                  </form>
                  {job && (
                    <article className={styles.result} aria-live="polite">
                      <h3>Helyi AI feladat · {job.status}</h3>
                      <p>
                        {job.status === "queued"
                          ? "Várakozik a helyi workerre. Kapcsolati kiesés esetén nem minősül hibás eredménynek."
                          : job.status === "processing"
                            ? "A helyi worker feldolgozza a kérdést."
                            : job.status === "review"
                              ? "A válasz elkészült; edzői forrásellenőrzésre vár."
                              : job.status === "ready" &&
                                  interpretationAnswer?.answer?.status ===
                                    "no_evidence"
                                ? "A helyi modell nem talált ellenőrizhető, forrásolt választ. Ebből a rekordból nem vontunk le következtetést."
                                : job.status === "ready"
                                  ? "Az edző által jóváhagyott, forrásolt válasz elérhető."
                                  : "A munka állapotát a coach tudja áttekinteni."}
                      </p>
                      {jobReasonMessage(job.reasonCode) && (
                        <p>{jobReasonMessage(job.reasonCode)}</p>
                      )}
                      <p>Feladatazonosító: {job.jobId}</p>
                      <p>Beszélgetés: {questionThreadId}</p>
                      {interpretationAnswer?.answer && (
                        <div>
                          <h4>Forrásolt magyarázat</h4>
                          {interpretationAnswer.answer.unknowns.length > 0 && (
                            <p>
                              {interpretationAnswer.answer.unknowns.join(" ")}
                            </p>
                          )}
                          <ul>
                            {interpretationAnswer.answer.claims.map((claim) => (
                              <li key={claim.id}>
                                {claim.text}{" "}
                                <small>
                                  (források:{" "}
                                  {claim.evidenceRefs
                                    .map(
                                      (ref) =>
                                        `${ref.id} v${ref.revision}${ref.span ? `, ${ref.span}` : ""}`,
                                    )
                                    .join("; ")}
                                  )
                                </small>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  )}
                  {threadMessages.map((message) => (
                    <article className={styles.result} key={message.id}>
                      <p>{message.text}</p>
                      <p>
                        {message.recordedBy.role} ·{" "}
                        {new Date(message.submittedAt).toLocaleString("hu-HU")}
                      </p>
                    </article>
                  ))}
                </section>
              )}

              {principal.activeRole === "coach" && (
                <section aria-labelledby="material-title">
                  <h2 id="material-title">Edzői anyag publikálása</h2>
                  <p>
                    Minden mentés új, változtathatatlan verziót hoz létre. A
                    szülők csak a pontosan publikált verziót látják.
                  </p>
                  <form
                    className={styles.observationForm}
                    onSubmit={(event) => void createMaterial(event)}
                  >
                    {supersedesMaterial && (
                      <p role="status">
                        Új verzió készül a kiválasztott anyagból.
                      </p>
                    )}
                    <label htmlFor="material-heading">Cím</label>
                    <input
                      id="material-heading"
                      maxLength={200}
                      required
                      value={materialTitle}
                      onChange={(event) => setMaterialTitle(event.target.value)}
                    />
                    <label htmlFor="material-body">Edzői anyag</label>
                    <textarea
                      id="material-body"
                      maxLength={12000}
                      required
                      value={materialText}
                      onChange={(event) => setMaterialText(event.target.value)}
                    />
                    <button
                      className="primary"
                      type="submit"
                      disabled={
                        busy || !materialTitle.trim() || !materialText.trim()
                      }
                    >
                      Piszkozat mentése új verzióként
                    </button>
                  </form>
                  {materials.length === 0 ? (
                    <p>Nincs edzői anyag.</p>
                  ) : (
                    materials.map((material) => (
                      <article className={styles.result} key={material.id}>
                        <h3>
                          {material.title} · v{material.version} ·{" "}
                          {material.status === "draft"
                            ? "piszkozat"
                            : material.status}
                        </h3>
                        <p>{material.text}</p>
                        <p>
                          Források:{" "}
                          {material.sourceRefs
                            .map((ref) => `${ref.id} v${ref.revision}`)
                            .join(", ")}
                        </p>
                        {material.status === "draft" && (
                          <button
                            className="secondary"
                            type="button"
                            disabled={busy}
                            onClick={() => void publishMaterial(material)}
                          >
                            Ennek a verziónak a publikálása
                          </button>
                        )}
                        <button
                          className="secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setSupersedesMaterial({
                              id: material.id,
                              revision: material.revision,
                            });
                            setMaterialTitle(material.title);
                            setMaterialText(material.text);
                            document
                              .getElementById("material-heading")
                              ?.focus();
                          }}
                        >
                          Új verzió ebből
                        </button>
                      </article>
                    ))
                  )}
                </section>
              )}

              {principal.activeRole === "coach" && (
                <section aria-labelledby="ai-review-title">
                  <h2 id="ai-review-title">
                    Helyi AI-válaszok forrásellenőrzése
                  </h2>
                  {interpretations.filter(
                    (item) => item.answer && item.reviewState === "pending",
                  ).length === 0 ? (
                    <p>Nincs ellenőrzésre váró AI-válasz.</p>
                  ) : (
                    interpretations
                      .filter(
                        (item) => item.answer && item.reviewState === "pending",
                      )
                      .map((item) => (
                        <article className={styles.result} key={item.id}>
                          <h3>Válasz · {item.answerState}</h3>
                          <ul>
                            {item.answer?.claims.map((claim) => (
                              <li key={claim.id}>
                                {claim.text}
                                <ul>
                                  {claim.evidenceRefs.map((ref) => (
                                    <li key={`${ref.id}-${ref.revision}`}>
                                      Forrás {ref.id}, revision {ref.revision}
                                      {ref.span ? `, ${ref.span}` : ""}
                                    </li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ul>
                          <label htmlFor={`review-rationale-${item.id}`}>
                            Ellenőrzési indoklás
                          </label>
                          <textarea
                            id={`review-rationale-${item.id}`}
                            maxLength={2000}
                            required
                            value={reviewRationale}
                            onChange={(event) =>
                              setReviewRationale(event.target.value)
                            }
                          />
                          <div className={styles.choices}>
                            <button
                              className="primary"
                              type="button"
                              disabled={
                                busy ||
                                !reviewRationale.trim() ||
                                item.answer?.claims.some(
                                  (claim) => claim.evidenceRefs.length === 0,
                                )
                              }
                              onClick={() =>
                                void reviewGeneratedAnswer(item, "approved")
                              }
                            >
                              Források ellenőrizve, jóváhagyom
                            </button>
                            <button
                              className="secondary"
                              type="button"
                              disabled={busy || !reviewRationale.trim()}
                              onClick={() =>
                                void reviewGeneratedAnswer(
                                  item,
                                  "needs_revision",
                                )
                              }
                            >
                              Javítást kérek
                            </button>
                            <button
                              className="secondary"
                              type="button"
                              disabled={busy || !reviewRationale.trim()}
                              onClick={() =>
                                void reviewGeneratedAnswer(item, "rejected")
                              }
                            >
                              Elutasítom
                            </button>
                          </div>
                        </article>
                      ))
                  )}
                </section>
              )}

              {principal.activeRole === "parent" && (
                <section aria-labelledby="materials-visible-title">
                  <h2 id="materials-visible-title">Publikált edzői anyagok</h2>
                  {materials.length === 0 ? (
                    <p>Nincs az Ön számára publikált edzői anyag.</p>
                  ) : (
                    materials.map((material) => (
                      <article className={styles.result} key={material.id}>
                        <h3>
                          {material.title} · v{material.version}
                        </h3>
                        <p>{material.text}</p>
                        <p>
                          Hivatkozott források:{" "}
                          {material.sourceRefs
                            .map((ref) => `${ref.id} v${ref.revision}`)
                            .join(", ")}
                        </p>
                      </article>
                    ))
                  )}
                </section>
              )}

              <section aria-labelledby="plans-title">
                <h2 id="plans-title">Tervek és utánkövetés</h2>
                {plans.length === 0 ? (
                  <p>Még nincs javasolt segítségkérés.</p>
                ) : (
                  plans.map((plan) => (
                    <article className={styles.result} key={plan.id}>
                      <h3>Terv · {plan.status}</h3>
                      {plan.actions.map((action) => (
                        <div key={action.id}>
                          <p>
                            <strong>{action.what}</strong>
                          </p>
                          <p>{action.why}</p>
                          <p>Leállítási feltétel: {action.stopCondition}</p>
                        </div>
                      ))}
                      {principal.activeRole !== "coach" &&
                        plan.status === "proposed" && (
                          <div className={styles.choices}>
                            <button
                              className="primary"
                              type="button"
                              disabled={busy}
                              onClick={() => void decidePlan(plan, "accept")}
                            >
                              Elfogadom
                            </button>
                            <button
                              className="secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => void decidePlan(plan, "decline")}
                            >
                              Elutasítom
                            </button>
                          </div>
                        )}
                      {plan.status === "active" && (
                        <form
                          className={styles.observationForm}
                          onSubmit={(event) => void submitFollowUp(event, plan)}
                        >
                          <label htmlFor={`followup-${plan.id}`}>
                            Mi történt a vállalt lépéssel?
                          </label>
                          <textarea
                            id={`followup-${plan.id}`}
                            maxLength={4000}
                            required
                            value={followUpText}
                            onChange={(event) =>
                              setFollowUpText(event.target.value)
                            }
                          />
                          <button
                            className="secondary"
                            type="submit"
                            disabled={busy || !followUpText.trim()}
                          >
                            Utánkövetés mentése
                          </button>
                        </form>
                      )}
                    </article>
                  ))
                )}
              </section>

              {principal.activeRole !== "player" && (
                <section aria-labelledby="observation-title">
                  <h2 id="observation-title">Megfigyelés rögzítése</h2>
                  <form
                    className={styles.observationForm}
                    onSubmit={(event) => void submitObservation(event)}
                  >
                    <label htmlFor="observation-text">
                      {principal.activeRole === "parent"
                        ? "Szülői megfigyelés"
                        : "Edzői megfigyelés"}
                    </label>
                    <textarea
                      id="observation-text"
                      maxLength={4000}
                      required
                      value={observationText}
                      onChange={(event) =>
                        setObservationText(event.target.value)
                      }
                    />
                    <button
                      className="primary"
                      type="submit"
                      disabled={busy || !observationText.trim()}
                    >
                      Megfigyelés mentése
                    </button>
                  </form>
                </section>
              )}

              {principal.activeRole !== "player" && (
                <section aria-labelledby="report-title">
                  <h2 id="report-title">Jelentés feltöltése és ellenőrzése</h2>
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => void refreshReports()}
                  >
                    Jelentések állapotának frissítése
                  </button>
                  {principal.activeRole === "parent" && (
                    <div className={styles.observationForm}>
                      <label htmlFor="report-file">
                        PDF-jelentés (legfeljebb 10 MiB)
                      </label>
                      <input
                        id="report-file"
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={busy}
                        onChange={(event) => {
                          void uploadReport(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </div>
                  )}
                  {reports.length === 0 ? (
                    <p>Még nincs feltöltött jelentés.</p>
                  ) : (
                    reports.map((report) => {
                      const reportExtractions = extractions.filter(
                        (item) => item.reportRef.id === report.id,
                      );
                      return (
                        <article className={styles.result} key={report.id}>
                          <h3>
                            Jelentés ·{" "}
                            {report.status === "ready"
                              ? "ellenőrzött"
                              : report.status === "restricted"
                                ? report.scanStatus === "failed"
                                  ? "a biztonsági ellenőrzés elutasította"
                                  : "karanténban / ellenőrzésre vár"
                                : "törölt"}
                          </h3>
                          <p>
                            Azonosító: {report.id}. A fájl csak sikeres, friss
                            ClamAV ellenőrzés után lesz elérhető.
                          </p>
                          {report.status === "ready" && (
                            <a
                              href={`/api/v1/reports/${encodeURIComponent(report.id)}/download`}
                            >
                              Jelentés letöltése
                            </a>
                          )}
                          {report.status === "ready" &&
                            principal.activeRole === "coach" && (
                              <form
                                className={styles.observationForm}
                                onSubmit={(event) =>
                                  void createManualExtraction(event, report)
                                }
                              >
                                <h4>Mező rögzítése kézi ellenőrzésre</h4>
                                <label htmlFor={`extract-name-${report.id}`}>
                                  Mező
                                </label>
                                <input
                                  id={`extract-name-${report.id}`}
                                  maxLength={200}
                                  required
                                  value={extractFieldName}
                                  onChange={(event) =>
                                    setExtractFieldName(event.target.value)
                                  }
                                />
                                <label htmlFor={`extract-page-${report.id}`}>
                                  Oldal
                                </label>
                                <input
                                  id={`extract-page-${report.id}`}
                                  type="number"
                                  min="1"
                                  max="500"
                                  required
                                  value={extractPage}
                                  onChange={(event) =>
                                    setExtractPage(event.target.value)
                                  }
                                />
                                <label htmlFor={`extract-value-${report.id}`}>
                                  A jelentésből átírt érték
                                </label>
                                <input
                                  id={`extract-value-${report.id}`}
                                  maxLength={500}
                                  required
                                  value={extractRawValue}
                                  onChange={(event) =>
                                    setExtractRawValue(event.target.value)
                                  }
                                />
                                <button
                                  className="primary"
                                  type="submit"
                                  disabled={
                                    busy ||
                                    !extractFieldName.trim() ||
                                    !extractRawValue.trim()
                                  }
                                >
                                  Mező mentése ellenőrzésre
                                </button>
                              </form>
                            )}
                          {reportExtractions.map((item) => (
                            <div key={item.id}>
                              <h4>Kézi extraction · {item.status}</h4>
                              {item.fields.map((field) => (
                                <div key={`${field.field}-${field.page}`}>
                                  <p>
                                    {field.field} · oldal {field.page}:{" "}
                                    {field.rawValue} ·{" "}
                                    {field.review.status === "approved"
                                      ? "ellenőrizve"
                                      : field.review.status === "rejected"
                                        ? "elutasítva"
                                        : "ellenőrzésre vár"}
                                  </p>
                                  {principal.activeRole === "coach" &&
                                    field.review.status === "pending" && (
                                      <div className={styles.observationForm}>
                                        <label
                                          htmlFor={`extract-review-${item.id}`}
                                        >
                                          Ellenőrzési indoklás
                                        </label>
                                        <textarea
                                          id={`extract-review-${item.id}`}
                                          maxLength={2000}
                                          required
                                          value={extractReviewReason}
                                          onChange={(event) =>
                                            setExtractReviewReason(
                                              event.target.value,
                                            )
                                          }
                                        />
                                        <div className={styles.choices}>
                                          <button
                                            className="primary"
                                            type="button"
                                            disabled={
                                              busy ||
                                              !extractReviewReason.trim()
                                            }
                                            onClick={() =>
                                              void reviewExtractedField(
                                                item,
                                                field,
                                                "approve",
                                              )
                                            }
                                          >
                                            Értéket ellenőriztem
                                          </button>
                                          <button
                                            className="secondary"
                                            type="button"
                                            disabled={
                                              busy ||
                                              !extractReviewReason.trim()
                                            }
                                            onClick={() =>
                                              void reviewExtractedField(
                                                item,
                                                field,
                                                "reject",
                                              )
                                            }
                                          >
                                            Elutasítom
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </article>
                      );
                    })
                  )}
                </section>
              )}

              <section aria-labelledby="record-title">
                <h2 id="record-title">Látható megfigyelések</h2>
                {records.filter((record) => record.kind === "observation")
                  .length === 0 ? (
                  <p>Nincs megjeleníthető megfigyelés.</p>
                ) : (
                  records
                    .filter((record) => record.kind === "observation")
                    .map((record) => (
                      <article className={styles.result} key={record.id}>
                        <p>{record.text}</p>
                        <p>
                          Rögzítő szerepe: {record.recordedBy.role}.
                          Forrásbesorolás: {record.sharingClass}.
                        </p>
                        {principal.activeRole === "coach" &&
                          record.sharingClass === "coach" && (
                            <button
                              className="secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => void publishObservation(record)}
                            >
                              Ennek a revisionnek a publikálása szülőknek
                            </button>
                          )}
                      </article>
                    ))
                )}
              </section>

              <section aria-labelledby="timeline-title">
                <h2 id="timeline-title">Közös idővonal</h2>
                {timeline.length === 0 ? (
                  <p>Még nincs idővonal-esemény.</p>
                ) : (
                  <ol>
                    {timeline.map((item) => (
                      <li key={`${item.id}-${item.revision}`}>
                        <time dateTime={item.submittedAt}>
                          {new Date(item.submittedAt).toLocaleString("hu-HU", {
                            timeZone: "Europe/Budapest",
                          })}
                        </time>
                        {" · "}
                        {item.kind}
                        {" · "}
                        {item.actorRole}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {principal.activeRole === "player" && latestResult && (
                <article
                  className={styles.result}
                  aria-labelledby="result-title"
                >
                  <h2 id="result-title">Elmentett visszajelzés</h2>
                  <p>{latestResult.interpretation}</p>
                  <p>{latestResult.suggestion}</p>
                </article>
              )}
            </div>
          )}
        </section>
        <footer className={styles.footer}>
          Ez a helyi tesztoldal kizárólag szintetikus szerepekkel és rekordokkal
          használható. A valódi belépés később kapcsolódik.
        </footer>
      </div>
    </main>
  );
}
