"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BodyText,
  GdsInline,
  GdsStack,
  SectionPanel,
  SemanticButton,
  Select as GdsSelect,
  StateBlock,
  Textarea as GdsTextarea,
  TextInput as GdsTextInput,
} from "@sovereignsquad/gds/client";
import content from "../lib/content/coach-assessments-v1.json";
import { AiCoachButton } from "./ai-coach";
import { commandMessage, productRequest } from "./product-request";

type Fields = {
  date: string;
  context: string;
  example: string;
  reflection: string;
  scenarioId: string;
  value: string;
  scale: string;
  source: string;
  reference: string;
};
type Attempt = {
  id: string;
  revision: number;
  status: string;
  actorId?: string;
  createdAt: string;
  expiresAt: string;
  capture: Fields & { topicId: string; mode: string };
  submittedItems: Array<{ itemId: string; value: number | null }>;
  resultRef: { id: string; revision: number } | null;
};
const initialFields = (): Fields => ({
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
const statusLabels: Record<string, string> = {
  started: "Elkezdve, nincs lezárva",
  completed: "Befejezve",
  interrupted: "Megszakítva",
  expired: "Lejárt",
};
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
    (s) => s.construct_id === topic.id,
  );
  const [fields, setFields] = useState<Fields>(initialFields);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const scope = useRef(playerId);
  scope.current = playerId;
  const load = useCallback(async () => {
    const result = await productRequest(
      `/api/v1/players/${encodeURIComponent(playerId)}/assessment-attempts`,
      csrfToken,
      undefined,
      "GET",
    );
    if (scope.current === playerId) setHistory(result.items);
  }, [playerId, csrfToken]);
  useEffect(() => {
    let current = true;
    void load()
      .catch((e) => {
        if (current) setError(commandMessage(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [load]);
  const active = attempt?.status === "started";
  const questionControls = useRef<HTMLElement>(null);
  const nextItem = items.find(
    (i) => !attempt?.submittedItems.some((a) => a.itemId === i.id),
  );
  useEffect(() => {
    if (active && nextItem && !busy)
      questionControls.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus();
  }, [active, nextItem, busy]);
  async function send(path: string, body: unknown) {
    const fingerprint = path + JSON.stringify(body);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const result = await productRequest(
      path,
      csrfToken,
      body,
      "POST",
      pending.current.key,
    );
    pending.current = null;
    return result as Attempt;
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      onSaved();
    } catch (e) {
      setError(commandMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const base = `/api/v1/assessment-attempts/${encodeURIComponent(attempt?.id ?? "")}`;
  const field = (key: keyof Fields, label: string, required = false) =>
    key === "date" ? (
      <GdsTextInput
        key={key}
        label={label}
        type="date"
        required={required}
        disabled={busy || active}
        value={fields[key]}
        onChange={(e) => setFields({ ...fields, [key]: e.currentTarget.value })}
      />
    ) : (
      <GdsTextarea
        key={key}
        label={label}
        required={required}
        disabled={busy}
        maxLength={key === "source" || key === "reference" ? 500 : 700}
        value={fields[key]}
        onChange={(e) => setFields({ ...fields, [key]: e.currentTarget.value })}
      />
    );
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
  return (
    <SectionPanel title="Kérdőívek, helyzetek és riportértékek">
      <GdsStack gap="md">
        <BodyText>
          Minden beküldött válasz külön mentődik. A megszakított alkalom
          előzménye megmarad; új alkalom indítható.
        </BodyText>
        <AiCoachButton
          context={{ kind: "assessment", id: topic.id, revision: 1 }}
        />
        <GdsSelect
          label="Felmérés típusa"
          disabled={busy || active}
          value={mode}
          onChange={(v) => {
            if (v) setMode(v);
          }}
          data={[
            { value: "questionnaire", label: "Kérdőívek" },
            { value: "interview", label: "Interjú és helyzetek" },
            { value: "cognitive", label: "CogMap eredmények" },
          ]}
        />
        <GdsSelect
          label="Témakör"
          disabled={busy || active}
          value={topic.id}
          onChange={(v) => {
            if (v) setTopicId(v);
          }}
          data={choices.map((t) => ({ value: t.id, label: t.title }))}
        />
        <BodyText>{topic.definition}</BodyText>
        <BodyText>{topic.boundary}</BodyText>
        {field("date", "Alkalom dátuma", true)}
        {field("context", "Körülmények, nyelv és segítség")}
        {error && (
          <GdsStack gap="xs">
            <StateBlock
              variant="error"
              title="A művelet most nem sikerült"
              action={
                <SemanticButton
                  action="refresh"
                  label="Állapot újratöltése"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (attempt)
                        setAttempt(
                          await productRequest(
                            base,
                            csrfToken,
                            undefined,
                            "GET",
                          ),
                        );
                      await load();
                    })
                  }
                />
              }
            />
            <BodyText>{error}</BodyText>
          </GdsStack>
        )}
        <div role="status" aria-live="polite">
          <GdsStack gap="xs">
            {notice && <StateBlock variant="success" title={notice} />}
            {attempt && (
              <BodyText>
                {statusLabels[attempt.status] ?? attempt.status} ·{" "}
                {attempt.submittedItems.length} beküldött válasz
              </BodyText>
            )}
          </GdsStack>
        </div>
        {!active ? (
          <SemanticButton
            action="add"
            label="Alkalom indítása"
            loading={busy}
            onClick={() =>
              void run(async () => {
                const a = await send(
                  `/api/v1/players/${encodeURIComponent(playerId)}/assessment-attempts`,
                  { topicId: topic.id, mode, ...fields },
                );
                setAttempt(a);
                setNotice("Az alkalom elkezdődött.");
              })
            }
          />
        ) : (
          <>
            {mode === "questionnaire" && nextItem && (
              <SectionPanel title={nextItem.text}>
                <GdsStack
                  component="fieldset"
                  aria-label={nextItem.text}
                  gap="sm"
                  ref={questionControls}
                >
                  {labels.map((label, index) => (
                    <SemanticButton
                      key={label}
                      action="submit"
                      label={label}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          setAttempt(
                            await send(`${base}/answers`, {
                              expectedRevision: attempt.revision,
                              itemId: nextItem.id,
                              value: index + 1,
                            }),
                          );
                          setNotice("A válasz elmentve.");
                        })
                      }
                    />
                  ))}
                  <SemanticButton
                    action="submit"
                    label="Ezt a kérdést kihagyom"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setAttempt(
                          await send(`${base}/answers`, {
                            expectedRevision: attempt.revision,
                            itemId: nextItem.id,
                            value: null,
                          }),
                        );
                        setNotice("A kihagyás elmentve.");
                      })
                    }
                  />
                </GdsStack>
              </SectionPanel>
            )}
            {mode === "interview" && (
              <>
                <BodyText>{topic.interview}</BodyText>
                <GdsSelect
                  label="Helyzet"
                  disabled={busy}
                  value={fields.scenarioId || null}
                  clearable
                  onChange={(v) =>
                    setFields({ ...fields, scenarioId: v ?? "" })
                  }
                  data={scenarios.map((s) => ({
                    value: s.id,
                    label: s.context,
                  }))}
                />
                {scenarios.find((s) => s.id === fields.scenarioId) && (
                  <BodyText>
                    {scenarios.find((s) => s.id === fields.scenarioId)?.prompt}
                  </BodyText>
                )}
              </>
            )}
            {mode === "cognitive" && (
              <>
                {field("value", "Eredeti riportérték", true)}
                {field("scale", "Skála, mértékegység", true)}
                {field("source", "Forrás, verzió, oldal", true)}
                {field("reference", "Összehasonlítás alapja", true)}
              </>
            )}
            {field("example", "A játékos saját szavai", mode === "interview")}
            {field("reflection", "Edzői megfigyelés")}
            <GdsInline gap="sm">
              <SemanticButton
                action="save"
                label="Alkalom befejezése"
                disabled={
                  busy || (mode === "questionnaire" && Boolean(nextItem))
                }
                onClick={() =>
                  void run(async () => {
                    const { date: _date, ...capture } = fields;
                    setAttempt(
                      await send(`${base}/complete`, {
                        expectedRevision: attempt.revision,
                        fields: capture,
                      }),
                    );
                    setFields(initialFields());
                    setNotice("A felmérés elmentve.");
                  })
                }
              />
              <SemanticButton
                action="close"
                label="Alkalom megszakítása"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setAttempt(
                      await send(`${base}/interrupt`, {
                        expectedRevision: attempt.revision,
                      }),
                    );
                    setNotice(
                      "Az alkalom megszakítva; a beküldött válaszok megmaradtak.",
                    );
                  })
                }
              />
            </GdsInline>
          </>
        )}
        <SectionPanel title="Korábbi alkalmak">
          <GdsStack gap="sm">
            {loading && (
              <StateBlock variant="loading" title="Alkalmak betöltése" />
            )}
            {!loading && !history.length && (
              <StateBlock variant="empty" title="Még nincs mentett alkalom" />
            )}
            {history.map((a) => (
              <SectionPanel
                key={a.id}
                title={
                  content.topics.find((t) => t.id === a.capture?.topicId)
                    ?.title ?? "Korábbi alkalom"
                }
              >
                <BodyText>
                  {new Date(a.createdAt).toLocaleString("hu-HU")} ·{" "}
                  {statusLabels[a.status]} · {a.submittedItems.length} beküldött
                  válasz
                </BodyText>
                {a.submittedItems.map((answer) => (
                  <BodyText key={answer.itemId}>
                    {content.items.find((i) => i.id === answer.itemId)?.text ??
                      answer.itemId}{" "}
                    ·{" "}
                    {answer.value === null
                      ? "Tudatosan kihagyva"
                      : String(answer.value)}
                  </BodyText>
                ))}
                {a.resultRef && (
                  <AiCoachButton
                    context={{
                      kind: "record",
                      id: a.resultRef.id,
                      revision: a.resultRef.revision,
                    }}
                    label="Kérdés a mentett felmérésről"
                  />
                )}
                {a.status !== "completed" && (
                  <BodyText>
                    A megszakított vagy elhagyott alkalom nem folytatható; új
                    alkalmat indíthatsz.
                  </BodyText>
                )}
              </SectionPanel>
            ))}
          </GdsStack>
        </SectionPanel>
      </GdsStack>
    </SectionPanel>
  );
}
