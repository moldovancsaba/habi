"use client";

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
  metricGraphicLevel,
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
  const [metric, setMetric] = useState("energy");
  const [now, setNow] = useState<number | null>(null);
  const id = useId();
  useEffect(() => {
    setNow(Date.now());
  }, []);
  const definition =
    checkinMetrics.find(([key]) => key === metric) ?? checkinMetrics[0];
  const chart = buildCheckinChart(
    checkins,
    metric,
    period,
    now ?? Number.NEGATIVE_INFINITY,
  );
  const valid = chart.points.filter((point) => point.value !== null);
  return (
    <section className={styles.trends} aria-labelledby={`${id}-heading`}>
      <div className={styles.heading}>
        <h3 id={`${id}-heading`}>Állapotjelzések alakulása</h3>
        <div className={styles.periodControl}>
          <label htmlFor={`${id}-period`}>Időszak</label>
          <select
            id={`${id}-period`}
            value={period}
            onChange={(event) => setPeriod(Number(event.target.value))}
          >
            {[14, 28, 42].map((days) => (
              <option key={days} value={days}>
                {days} nap
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className={styles.note}>
        A mentett válaszok időrendben. A kimaradt válaszokat és napokat nem
        kötjük össze.
      </p>
      <fieldset className={styles.metrics} aria-label="Megjelenített kérdés">
        {checkinMetrics.map(([key], index) => {
          const latest = buildCheckinChart(
            checkins,
            key,
            period,
            now ?? Number.NEGATIVE_INFINITY,
          )
            .points.filter((point) => point.value !== null)
            .at(-1);
          return (
            <button
              type="button"
              key={key}
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
              style={{ "--metric": `var(--${key})` } as CSSProperties}
            >
              <MetricGraphic metric={key} code={latest?.value} />
              <span>{names[index]}</span>
            </button>
          );
        })}
      </fieldset>
      <h4>{definition[1]}</h4>
      {valid.length ? (
        <>
          <section
            className={styles.viewport}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the chart horizontally.
            tabIndex={0}
            aria-label="Állapotjelzések metróvonala, vízszintesen görgethető"
          >
            <svg
              width={chart.width}
              height="292"
              viewBox={`0 0 ${chart.width} 292`}
              role="img"
              aria-labelledby={`${id}-chart-title`}
              style={{ color: `var(--${metric})` }}
            >
              <title id={`${id}-chart-title`}>
                {definition[1]} · {valid.length} rögzített válasz. A pontos
                időpontok és válaszok a grafikon alatti listában is elérhetők.
              </title>
              {definition[2].map((answer, index) => (
                <g key={answer}>
                  <line
                    className={styles.grid}
                    x1="150"
                    x2={chart.width - 16}
                    y1={32 + index * 64}
                    y2={32 + index * 64}
                  />
                  <text
                    className={styles.axis}
                    x="136"
                    y={37 + index * 64}
                    textAnchor="end"
                  >
                    {answer}
                  </text>
                </g>
              ))}
              <path d={chart.path} className={styles.route} />
              {chart.points.map((point) => (
                <g key={point.id}>
                  {point.y !== null && (
                    <circle
                      className={styles.station}
                      cx={point.x}
                      cy={point.y}
                      r="4"
                    >
                      <title>
                        {new Date(point.date).toLocaleString("hu-HU")} ·{" "}
                        {definition[2][point.value ?? 0]}
                      </title>
                    </circle>
                  )}
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
                </g>
              ))}
            </svg>
          </section>
          <p className={styles.note}>
            {summarizeRecordedAnswers(valid, definition[2])}
          </p>
          <details className={styles.details}>
            <summary>Pontos válaszok és időpontok</summary>
            <ul>
              {valid.map((point) => (
                <li key={point.id}>
                  <time dateTime={point.date}>
                    {new Date(point.date).toLocaleString("hu-HU")}
                  </time>{" "}
                  · {definition[2][point.value ?? 0]}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className={styles.note}>
          {now === null
            ? "Állapotjelzések betöltése…"
            : "Ehhez a kérdéshez nincs rögzített válasz ebben az időszakban."}
        </p>
      )}
    </section>
  );
}
