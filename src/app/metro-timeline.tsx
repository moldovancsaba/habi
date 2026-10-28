"use client";
import { AiCoachButton } from "./ai-coach";
import styles from "./metro-timeline.module.css";
import {
  buildMetroGeometry,
  metroLaneCounts,
} from "../lib/client/metro-geometry.mjs";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import instrument from "../../contracts/instrument.json" with { type: "json" };
import { createSavedConversationExport } from "../lib/workflows/guided-conversations.mjs";

export type HabiRole = "player" | "parent" | "coach";
export type TimelineNode = {
  id: string;
  revision: number;
  submittedAt: string;
  actorRole: HabiRole;
  kind: string;
  playerId: string;
  resourceRef: { id: string; revision: number };
  processId: string;
  replyTo: string | null;
  relatedId: string | null;
  summary?: string;
};
export type TimelineProcess = { id: string; closedAt?: string | null };
export type TimelinePage = {
  nodes: TimelineNode[];
  edges: Array<{ from: string; to: string; kind: string }>;
  processes: TimelineProcess[];
  continuations: Array<{ processId: string; direction: "before" | "after" }>;
  nextCursor: string | null;
};
export type TimelineRecord = {
  id: string;
  kind?: string;
  text?: string | null;
  occurredAt?: string;
  completedAt?: string;
  revision?: number;
  source?: { kind: string };
  answerCodes?: Array<{ metric: string; code: number }>;
};

type Branch = {
  id: string;
  role: HabiRole;
  indices: number[];
  first: number;
  last: number;
  lane: number;
  sideLane: number;
  open: boolean;
};
type Route = { id: string; role: HabiRole; d: string };
type Station = {
  id: string;
  x: number;
  y: number;
  role: HabiRole;
};
type Geometry = {
  width: number;
  height: number;
  axis: number;
  routes: Route[];
  connectors: Route[];
  stations: Station[];
};

const roleLabels: Record<HabiRole, string> = {
  player: "Játékos",
  parent: "Szülő",
  coach: "Edző",
};
const rolePaths: Record<HabiRole, string> = {
  player:
    "M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8M5 21v-3a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v3",
  coach: "M8 5H5v16h14V5h-3M9 3h6v5H9ZM8 12h8M8 16h5",
  parent: "M21 11a9 8 0 0 1-13 7l-5 3 1-6A8 8 0 1 1 21 11",
};
const labels: Record<string, string> = {
  checkin: "Napi állapotjelzés",
  "checkin.completed": "Napi állapotjelzés",
  record: "Naplóbejegyzés",
  observation: "Megfigyelés",
  "thread.message": "Beszélgetés",
  "interpretation.ready": "Ellenőrzött magyarázat",
  "interpretation.no_evidence": "Nem találtunk forrásolt választ",
  "plan.proposed": "Edzői terv",
  "plan.accepted": "Elfogadott edzői terv",
  "plan.completed": "Lezárt edzői terv",
  "plan.follow_up": "Utánkövetés",
  message: "Beszélgetés",
  thread: "Beszélgetés",
  interpretation: "Magyarázat",
  plan: "Terv",
  report: "Riport",
  assessment: "Felmérés",
  publication: "Megosztás",
  follow_up: "Utánkövetés",
};

function makeBranches(page: TimelinePage, events: TimelineNode[]) {
  const parents = new Map<string, string>();
  const find = (id: string): string => {
    if (!parents.has(id)) parents.set(id, id);
    let root = id;
    while (parents.get(root) !== root) root = parents.get(root) ?? root;
    let item = id;
    while (parents.get(item) !== item) {
      const next = parents.get(item) ?? root;
      parents.set(item, root);
      item = next;
    }
    return root;
  };
  const join = (a: string, b: string) => {
    const x = find(a);
    const y = find(b);
    if (x !== y) {
      const first = x.localeCompare(y) < 0 ? x : y;
      const second = first === x ? y : x;
      parents.set(second, first);
    }
  };
  const ids = new Set(page.nodes.map((event) => event.id));
  for (const event of page.nodes) {
    find(event.id);
    join(event.id, `process:${event.processId}`);
    if (event.replyTo && ids.has(event.replyTo)) join(event.id, event.replyTo);
    if (event.relatedId && ids.has(event.relatedId))
      join(event.id, event.relatedId);
  }
  for (const edge of page.edges)
    if (ids.has(edge.from) && ids.has(edge.to)) join(edge.from, edge.to);
  const groups = new Map<
    string,
    { events: TimelineNode[]; indices: number[] }
  >();
  events.forEach((event, index) => {
    const key = find(event.id);
    const group = groups.get(key) ?? { events: [], indices: [] };
    group.events.push(event);
    group.indices.push(index);
    groups.set(key, group);
  });
  const processById = new Map(
    page.processes.map((process) => [process.id, process]),
  );
  const branches: Branch[] = [...groups].map(([id, group]) => {
    const origin = [...group.events].sort(
      (a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt),
    )[0];
    const conversation =
      ["message", "thread"].includes(origin.kind) ||
      origin.kind.startsWith("thread.") ||
      origin.kind.startsWith("interpretation.");
    return {
      id,
      role: origin.actorRole,
      indices: group.indices,
      first: Math.min(...group.indices),
      last: Math.max(...group.indices),
      lane: 0,
      sideLane: 0,
      open: conversation && !processById.get(origin.processId)?.closedAt,
    };
  });
  const allocate = (items: Branch[], key: "lane" | "sideLane") => {
    const laneEnds: number[] = [];
    for (const branch of items) {
      let lane = laneEnds.findIndex((end) => end < branch.first);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = branch.last;
      branch[key] = lane;
    }
  };
  allocate(branches, "lane");
  for (const side of ["left", "right"] as const)
    allocate(
      branches.filter(
        (branch) => (branch.role === "coach" ? "right" : "left") === side,
      ),
      "sideLane",
    );
  const byEvent = new Map<string, Branch>();
  for (const branch of branches)
    for (const index of branch.indices) byEvent.set(events[index].id, branch);
  return { branches, byEvent };
}

export function ActorBadge({ role }: { role: HabiRole }) {
  return (
    <span className={`role-badge actor-${role}`}>
      <span className="ui-icon" aria-hidden="true">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d={rolePaths[role]} />
        </svg>
      </span>
      <span>{roleLabels[role]}</span>
    </span>
  );
}

const checkinMetrics = new Map(instrument.items.map((item) => [item.id, item]));

function checkinAnswerLabel(metric: string, code: number) {
  const item = checkinMetrics.get(metric);
  const choice = item?.choices.find((candidate) => candidate.code === code);
  return {
    question: item?.text ?? "Állapotjelzés",
    answer: choice?.label ?? "Válasz rögzítve",
  };
}

function downloadTextFile(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function MetroTimeline({
  page,
  records,
  playerName,
  playerId,
  compact = false,
  onLoadMore,
  loadingMore = false,
}: {
  page: TimelinePage | null;
  records: TimelineRecord[];
  playerName: string;
  playerId: string;
  compact?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry>({
    width: 0,
    height: 0,
    axis: 0,
    routes: [],
    connectors: [],
    stations: [],
  });
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const events = useMemo(
    () =>
      [...(page?.nodes ?? [])].sort(
        (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
      ),
    [page],
  );
  const graph = useMemo(
    () => (page ? makeBranches(page, events) : null),
    [page, events],
  );
  const byResourceId = useMemo(
    () => new Map(records.map((record) => [record.id, record])),
    [records],
  );

  const measure = useCallback(() => {
    const host = root.current;
    if (!host || !page || !graph || !events.length) {
      setGeometry({
        width: 0,
        height: 0,
        axis: 0,
        routes: [],
        connectors: [],
        stations: [],
      });
      return;
    }
    const bounds = host.getBoundingClientRect();
    const spine = host.querySelector<HTMLElement>(".story-spine");
    const rail = host.querySelector<HTMLElement>(".story-rail-end");
    if (!bounds.width || !bounds.height || !spine || !rail) return;
    const list = host.querySelector<HTMLElement>(".story-list");
    if (!list) return;
    const css = getComputedStyle(list);
    const token = (name: string) =>
      Number.parseFloat(css.getPropertyValue(name)) || 0;
    const axis = spine.getBoundingClientRect().left - bounds.left;
    const railX = rail.getBoundingClientRect().left - bounds.left;
    const desktop = css.getPropertyValue("--story-layout").trim() === "desktop";
    const clearance = token("--story-clearance");
    const pitch = token("--story-pitch");
    const nodeSize = token("--metro-station-size");
    const radius = token("--story-corner");
    const anchors = events.map((event) => {
      const row = host.querySelector<HTMLElement>(
        `[data-event-id="${CSS.escape(event.id)}"]`,
      );
      const card = row?.querySelector<HTMLElement>(".story-card");
      const badge = row?.querySelector<HTMLElement>(
        ".event-header .role-badge",
      );
      if (!card || !badge) return null;
      const cardBounds = card.getBoundingClientRect(),
        badgeBounds = badge.getBoundingClientRect();
      return {
        y: badgeBounds.top + badgeBounds.height / 2 - bounds.top,
        edgeX:
          (desktop && row?.dataset.side === "left"
            ? cardBounds.right
            : cardBounds.left) - bounds.left,
      };
    });
    if (anchors.some((anchor) => !anchor)) return;
    setGeometry(
      buildMetroGeometry({
        page,
        events,
        branches: graph.branches,
        anchors,
        width: bounds.width,
        height: bounds.height,
        axis,
        railX,
        desktop,
        clearance,
        pitch,
        nodeSize,
        radius,
      }),
    );
  }, [events, graph, page]);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    observer?.observe(host);
    for (const card of host.querySelectorAll(".story-card"))
      observer?.observe(card);
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) schedule();
    });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [measure]);

  if (!events.length)
    return (
      <div className="empty-state">
        <p className="eyebrow">A TÖRTÉNET ELSŐ MEGÁLLÓJA</p>
        <p>Még nincs megjeleníthető esemény ehhez a játékoshoz.</p>
        <span className="route-motif route-open" aria-hidden="true">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48">
            <path d="M6 24H36" />
            <circle cx="36" cy="24" />
          </svg>
        </span>
      </div>
    );

  const lanes = metroLaneCounts(graph?.branches ?? []);
  return (
    <section
      className={`story-viewport ${styles.viewport}`}
      aria-label={`${playerName} idővonala`}
    >
      <div
        ref={root}
        className={`story-network${compact ? " story-compact" : ""}`}
        style={
          {
            "--story-lanes": lanes.all,
            "--story-side-lanes": Math.max(lanes.left, lanes.right),
          } as CSSProperties
        }
      >
        <span className="story-spine" aria-hidden="true" />
        <span className="story-rail-end" aria-hidden="true" />
        <svg
          className="story-routes"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          aria-hidden="true"
          focusable="false"
        >
          <title>Összetartozó események és szerepkörök metróvonala</title>
          <g>
            {geometry.routes.map((route) => (
              <path
                key={route.id}
                d={route.d}
                className={
                  route.id === "main"
                    ? "story-trunk"
                    : `story-branch actor-${route.role}`
                }
              />
            ))}
            {geometry.connectors.map((connector) => (
              <path
                key={`link-${connector.id}`}
                data-connector-id={connector.id}
                d={connector.d}
                className={`story-card-connector actor-${connector.role}`}
              />
            ))}
            {geometry.stations.map((station) => (
              <circle
                key={station.id}
                data-station-id={station.id}
                cx={station.x}
                cy={station.y}
                className={`story-event-station actor-${station.role}`}
              />
            ))}
          </g>
        </svg>
        <ol className="story-list">
          {events.map((event) => {
            const branch = graph?.byEvent.get(event.id);
            const record = byResourceId.get(event.resourceRef.id);
            const dateTime = new Date(event.submittedAt).toLocaleString(
              "hu-HU",
              {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Budapest",
              },
            );
            const title = labels[record?.kind ?? event.kind] ?? "Naplóesemény";
            const summary =
              event.summary?.trim() ||
              record?.text?.trim() ||
              (record?.answerCodes?.length ? "A napi válaszaid rögzítve." : "");
            const isOpen = openIds.has(event.id);
            return (
              <li
                key={event.id}
                className={`story-row actor-${event.actorRole}`}
                data-event-id={event.id}
                data-side={branch?.role === "coach" ? "right" : "left"}
              >
                <h3 className="story-date">{dateTime}</h3>
                <div className="story-card">
                  <article className="event-card">
                    <div className="event-meta event-header">
                      <ActorBadge role={event.actorRole} />
                      <span>{playerName}</span>
                      <span className="sr-only">
                        · játékosazonosító {playerId}
                      </span>
                      <AiCoachButton
                        context={{
                          kind:
                            event.kind === "thread.message"
                              ? "message"
                              : event.kind.startsWith("interpretation.")
                                ? "interpretation"
                                : event.kind.startsWith("plan.") &&
                                    event.kind !== "plan.follow_up"
                                  ? "plan"
                                  : event.kind === "plan.follow_up"
                                    ? "record"
                                    : record?.answerCodes
                                      ? "checkin_result"
                                      : record?.text
                                        ? "record"
                                        : "page",
                          id:
                            event.kind === "thread.message" ||
                            event.kind === "plan.follow_up" ||
                            event.kind.startsWith("interpretation.") ||
                            (event.kind.startsWith("plan.") &&
                              event.kind !== "plan.follow_up")
                              ? event.resourceRef.id
                              : (record?.id ?? "timeline"),
                          revision:
                            record?.revision ?? event.resourceRef.revision ?? 1,
                        }}
                      />
                    </div>
                    <details
                      id={`timeline-detail-${event.id}`}
                      open={isOpen}
                      onToggle={(toggleEvent) => {
                        const nowOpen = toggleEvent.currentTarget.open;
                        setOpenIds((current) =>
                          current.has(event.id) === nowOpen
                            ? current
                            : new Set(
                                nowOpen
                                  ? [...current, event.id]
                                  : [...current].filter(
                                      (id) => id !== event.id,
                                    ),
                              ),
                        );
                      }}
                    >
                      <summary className="event-preview">
                        <strong>{title}</strong>
                        <span>{summary}</span>
                      </summary>
                      <div className="event-details">
                        {event.summary ? <p>{event.summary}</p> : null}
                        {record?.text ? <p>{record.text}</p> : null}
                        {record?.source && (
                          <p className="event-meta">
                            {record.source.kind === "proxy"
                              ? "A játékos elmondása · más rögzítette"
                              : record.source.kind === "self"
                                ? "A játékos saját beszámolója"
                                : "A rögzítő saját megfigyelése"}
                          </p>
                        )}
                        {record && createSavedConversationExport(record) ? (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              downloadTextFile(
                                createSavedConversationExport(record) ?? "",
                                "Habi-vezetett-beszelgetes.txt",
                              )
                            }
                          >
                            Beszélgetés letöltése
                          </button>
                        ) : null}
                        {record?.answerCodes?.length ? (
                          <dl className="event-checkin-answers">
                            {record.answerCodes.map((answer) => {
                              const display = checkinAnswerLabel(
                                answer.metric,
                                answer.code,
                              );
                              return (
                                <div key={answer.metric}>
                                  <dt>{display.question}</dt>
                                  <dd>{display.answer}</dd>
                                </div>
                              );
                            })}
                          </dl>
                        ) : null}
                        <p className="event-meta">
                          Rögzítette: {roleLabels[event.actorRole]} · {dateTime}
                        </p>
                      </div>
                    </details>
                  </article>
                </div>
              </li>
            );
          })}
        </ol>
        {page?.nextCursor && onLoadMore ? (
          <div className="story-more">
            <button
              type="button"
              className="secondary"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore
                ? "Korábbi események betöltése…"
                : "Korábbi események betöltése"}
            </button>
            {loadingMore && (
              <span role="status">A napló folytatását töltjük.</span>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
