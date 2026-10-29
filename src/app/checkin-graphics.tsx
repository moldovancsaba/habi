"use client";
import { AiCoachButton } from "./ai-coach";

import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  buildCheckinChart,
  checkinMetrics,
  latestCompletion,
  metricGraphicLevel,
  metroRoutePath,
  projectDailyCheckins,
} from "../lib/workflows/checkin-chart.mjs";
import { summarizeRecordedAnswers } from "../lib/workflows/goal-export.mjs";
import styles from "./checkin-graphics.module.css";

type Checkin = {
  id: string;
  completedAt?: string;
  answerCodes?: Array<{ metric: string; code: number }>;
};
const names = ["Energia", "Alvás", "Figyelem", "Hangulat", "Edzésterhelés"];

export function MetricGraphic({
  metric,
  code,
}: {
  metric: string;
  code?: number | null;
}) {
  const level = metricGraphicLevel(metric, code);
  let shape: ReactNode;
  if (level === null) {
    shape = (
      <>
        <circle cx="32" cy="32" r="22" className="icon-outline" />
        <path d="M23 32h18" className="icon-outline" />
      </>
    );
  } else if (metric === "energy") {
    shape = (
      <>
        <rect
          x="12"
          y="8"
          width="36"
          height="48"
          rx="7"
          className="icon-outline"
        />
        <rect x="25" y="3" width="10" height="5" rx="2" className="icon-fill" />
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x="18"
            y={44 - i * 10}
            width="24"
            height="7"
            rx="2"
            className={i < level ? "icon-fill" : "icon-muted"}
          />
        ))}
      </>
    );
  } else if (metric === "sleep") {
    const moons = [
      "M32 10 A22 22 0 1 0 32 54 A29 29 0 0 1 32 10",
      "M32 10 A22 22 0 0 0 32 54 Z",
      "M32 10 A22 22 0 1 0 32 54 A12 22 0 0 0 32 10",
      "M32 10 A22 22 0 1 0 32 54 A22 22 0 1 0 32 10",
    ];
    shape = (
      <>
        <circle cx="32" cy="32" r="22" className="icon-muted" />
        <path d={moons[level - 1]} className="icon-fill" />
      </>
    );
  } else if (metric === "focus") {
    shape = [0, 1, 2, 3].map((i) => (
      <rect
        key={i}
        x={7 + i * 13}
        y={43 - i * 11}
        width="9"
        height={13 + i * 11}
        rx="3"
        className={i < level ? "icon-fill" : "icon-muted"}
      />
    ));
  } else if (metric === "mood") {
    shape = (
      <>
        <circle cx="32" cy="32" r="23" className="icon-outline" />
        <circle cx="24" cy="26" r="2.5" className="icon-fill" />
        <circle cx="40" cy="26" r="2.5" className="icon-fill" />
        <path
          d={
            [
              "M22 43 Q32 30 42 43",
              "M23 39 L41 39",
              "M22 36 Q32 45 42 36",
              "M21 34 Q32 51 43 34",
            ][level - 1]
          }
          className="icon-outline"
        />
      </>
    );
  } else {
    shape = [0, 1, 2, 3].map((i) => (
      <rect
        key={i}
        x={10 + (i % 2) * 24}
        y={10 + Math.floor(i / 2) * 24}
        width="20"
        height="20"
        rx="5"
        className={i < level ? "icon-fill" : "icon-muted"}
      />
    ));
  }
  return (
    <span className={`metric-icon metric-${metric}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false" aria-hidden="true">
        {shape}
      </svg>
    </span>
  );
}

export default function CheckinTrends({ checkins }: { checkins: Checkin[] }) {
  const [period, setPeriod] = useState(14);
  const [metric, setMetric] = useState("all");
  const [view, setView] = useState("metro");
  const [projection, setProjection] = useState("daily");
  const [day, setDay] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const id = useId();
  const latest = latestCompletion(checkins);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a newly completed check-in must move the chart's clock past it.
  useEffect(() => setNow(Date.now()), [latest]);
  const entries =
    projection === "daily" ? projectDailyCheckins(checkins) : checkins;
  const selected =
    metric === "all"
      ? checkinMetrics
      : checkinMetrics.filter(([key]) => key === metric);
  const series = selected.map(([key, label, options]) => {
    const chart = buildCheckinChart(
      entries,
      key,
      period,
      now ?? Number.NEGATIVE_INFINITY,
    );
    const lane =
      metric === "all"
        ? (checkinMetrics.findIndex(([k]) => k === key) - 2) * 6
        : 0;
    const points = chart.points.map((point) => ({
      ...point,
      y:
        point.value === null
          ? null
          : 32 +
            (metric === "all" && key === "load"
              ? 3 - point.value
              : point.value) *
              64 +
            lane,
    }));
    return {
      key,
      label,
      options,
      points,
      path: metroRoutePath(points),
      width: chart.width,
    };
  });
  const allPoints = series[0]?.points ?? [];
  const dayKey = (date: string) => new Date(date).toLocaleDateString("sv-SE");
  const days = [...new Set(allPoints.map((point) => dayKey(point.date)))];
  const chosen = days.includes(day) ? day : (days.at(-1) ?? "");
  const daily = checkins
    .filter(
      (entry) => entry.completedAt && dayKey(entry.completedAt) === chosen,
    )
    .sort(
      (a, b) =>
        Date.parse(b.completedAt ?? "") - Date.parse(a.completedAt ?? ""),
    );
  const width = series[0]?.width ?? 600;
  const labels =
    metric === "all" ? ["4", "3", "2", "1"] : (selected[0]?.[2] ?? []);
  return (
    <section className={styles.trends} aria-labelledby={`${id}-heading`}>
      <div className={styles.heading}>
        <h3 id={`${id}-heading`}>Állapotjelzések alakulása</h3>
        <AiCoachButton
          context={{
            kind: "chart",
            id: metric,
            metric,
            days: period,
            revision: 1,
          }}
        />
        <div className={styles.periodControl}>
          <label htmlFor={`${id}-period`}>Időszak</label>
          <select
            id={`${id}-period`}
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
          >
            {[14, 28, 42].map((days) => (
              <option key={days} value={days}>
                {days} nap
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={styles.heading}>
        <div className={styles.periodControl}>
          <label htmlFor={`${id}-view`}>Nézet</label>
          <select
            id={`${id}-view`}
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            <option value="metro">Metróvonalak</option>
            <option value="distribution">Válaszok megoszlása</option>
          </select>
        </div>
        <div className={styles.periodControl}>
          <label htmlFor={`${id}-projection`}>Alkalmak</label>
          <select
            id={`${id}-projection`}
            value={projection}
            onChange={(e) => setProjection(e.target.value)}
          >
            <option value="daily">Naponta egy jelzés</option>
            <option value="sessions">Minden kitöltés</option>
          </select>
        </div>
      </div>
      <p className={styles.note}>
        {projection === "daily"
          ? "Naponta a legutolsó teljes kitöltést mutatjuk; ha nincs teljes, a legutolsó részleges alkalmat. A válaszokat nem keverjük különböző alkalmakból."
          : "Minden ténylegesen rögzített alkalom külön állomás, időrendben."}{" "}
        A hiányzó napokat és válaszokat nem kötjük össze.
      </p>
      <fieldset className={styles.metrics} aria-label="Megjelenített kérdés">
        <button
          type="button"
          aria-pressed={metric === "all"}
          onClick={() => setMetric("all")}
        >
          Minden terület együtt
        </button>
        {checkinMetrics.map(([key], index) => {
          const latest = buildCheckinChart(
            entries,
            key,
            period,
            now ?? Number.NEGATIVE_INFINITY,
          )
            .points.filter((p) => p.value !== null)
            .at(-1);
          return (
            <button
              type="button"
              key={key}
              aria-pressed={metric === key}
              style={{ "--metric": `var(--${key})` } as CSSProperties}
              onClick={() => setMetric(key)}
            >
              <MetricGraphic metric={key} code={latest?.value} />
              <span>{names[index]}</span>
            </button>
          );
        })}
      </fieldset>
      <h4>
        {metric === "all"
          ? "A területek közös metróhálózata"
          : selected[0]?.[1]}
      </h4>
      {allPoints.length ? (
        view === "metro" ? (
          <>
            <section
              className={styles.viewport}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need horizontal chart scrolling.
              tabIndex={0}
              aria-label="Állapotjelzések metróvonala, vízszintesen görgethető"
            >
              <svg
                width={width}
                height="292"
                viewBox={`0 0 ${width} 292`}
                role="img"
                aria-labelledby={`${id}-chart-title`}
              >
                <title id={`${id}-chart-title`}>
                  A mentett állapotjelzések. Egy nap oszlopával megnyithatod
                  annak pontos válaszait.
                </title>
                {labels.map((label, index) => (
                  <g key={label}>
                    <line
                      className={styles.grid}
                      x1="150"
                      x2={width - 16}
                      y1={32 + index * 64}
                      y2={32 + index * 64}
                    />
                    <text
                      className={styles.axis}
                      x="136"
                      y={37 + index * 64}
                      textAnchor="end"
                    >
                      {label}
                    </text>
                  </g>
                ))}
                {series.map((line) => (
                  <g key={line.key} style={{ color: `var(--${line.key})` }}>
                    <path className={styles.route} d={line.path} />
                    {line.points
                      .filter((p) => p.y !== null)
                      .map((p) => (
                        <circle
                          key={p.id}
                          className={styles.station}
                          cx={p.x}
                          cy={p.y ?? 0}
                          r="4"
                        >
                          <title>
                            {new Date(p.date).toLocaleString("hu-HU")} ·{" "}
                            {line.label}: {line.options[p.value ?? 0]}
                          </title>
                        </circle>
                      ))}
                  </g>
                ))}
                {allPoints.map((point) => (
                  <g key={point.id}>
                    <text
                      className={styles.axis}
                      x={point.x}
                      y="260"
                      textAnchor="middle"
                    >
                      {new Date(point.date).toLocaleDateString("hu-HU", {
                        month: "short",
                        day: "numeric",
                      })}
                    </text>
                    <text
                      className={styles.axis}
                      x={point.x}
                      y="280"
                      textAnchor="middle"
                    >
                      {new Date(point.date).toLocaleTimeString("hu-HU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </text>
                    <foreignObject
                      x={point.x - 22}
                      y="8"
                      width="44"
                      height="232"
                    >
                      <button
                        className={styles.dayTarget}
                        type="button"
                        aria-label={`${new Date(point.date).toLocaleString("hu-HU")} válaszai`}
                        aria-pressed={chosen === dayKey(point.date)}
                        onClick={() => setDay(dayKey(point.date))}
                      />
                    </foreignObject>
                  </g>
                ))}
              </svg>
            </section>
            <details className={styles.details}>
              <summary>Mit jelentenek a szintek?</summary>
              <p>
                A számok válaszkategóriák, nem teljesítménypontszámok. A
                magasabb edzésterhelés több edzést jelent. Az együtt futó
                vonalak külön sávjai az átfedést csökkentik.
              </p>
              {selected.map(([key, label, options]) => (
                <p key={key}>
                  {label} ·{" "}
                  {options
                    .map(
                      (answer, index) =>
                        `${key === "load" ? index + 1 : 4 - index}: ${answer}`,
                    )
                    .join(" · ")}
                </p>
              ))}
            </details>
          </>
        ) : (
          <div>
            {series.map((line) => {
              const points = line.points.filter((p) => p.value !== null);
              return (
                <section key={line.key}>
                  <h4>
                    {line.label} · {points.length} válasz
                  </h4>
                  {line.options.map((answer, code) => (
                    <label className={styles.distribution} key={answer}>
                      <span>{answer}</span>
                      <meter
                        min={0}
                        max={Math.max(1, points.length)}
                        value={points.filter((p) => p.value === code).length}
                        aria-label={`${answer}: ${points.filter((p) => p.value === code).length} a ${points.length} válaszból`}
                      />
                      <span>
                        {points.filter((p) => p.value === code).length}
                      </span>
                    </label>
                  ))}
                </section>
              );
            })}
          </div>
        )
      ) : (
        <p className={styles.note}>
          {now === null
            ? "Állapotjelzések betöltése…"
            : "Ebben az időszakban nincs rögzített válasz."}
        </p>
      )}
      {allPoints.length > 0 && (
        <>
          <label htmlFor={`${id}-day`}>
            Melyik napot nézzük meg közelebbről?
          </label>
          <select
            id={`${id}-day`}
            value={chosen}
            onChange={(e) => setDay(e.target.value)}
          >
            {days
              .slice()
              .reverse()
              .map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
          <section aria-live="polite">
            <h4>{chosen} · az adott nap összes kitöltése</h4>
            {daily.map((entry) => (
              <article key={entry.id}>
                <time dateTime={entry.completedAt}>
                  {new Date(entry.completedAt ?? "").toLocaleString("hu-HU")}
                </time>
                <dl>
                  {checkinMetrics.map(([key, label, options]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        {options[
                          entry.answerCodes?.find((a) => a.metric === key)
                            ?.code ?? -1
                        ] ?? "Nincs válasz"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </section>
          <details className={styles.details}>
            <summary>Pontos válaszok és időpontok</summary>
            {series.map((line) => (
              <section key={line.key}>
                <h4>{line.label}</h4>
                <p>
                  {summarizeRecordedAnswers(
                    line.points.filter((p) => p.value !== null),
                    line.options,
                  )}
                </p>
                <ul>
                  {line.points
                    .filter((p) => p.value !== null)
                    .map((point) => (
                      <li key={point.id}>
                        {new Date(point.date).toLocaleString("hu-HU")} ·{" "}
                        {line.options[point.value ?? 0]}
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
