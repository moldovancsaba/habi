"use client";
import { AiCoachButton } from "./ai-coach";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type Marker = {
  id: string;
  x: number;
  y: number;
  role: HabiRole;
  open: boolean;
};
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
  markers: Marker[];
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

function routePath(points: Array<[number, number]>, radius: number) {
  const n = (value: number) => Number(value.toFixed(3));
  const commands: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i];
    if (i === 0) {
      commands.push(`M${n(x)},${n(y)}`);
      continue;
    }
    const previous = points[i - 1];
    const next = points[i + 1];
    if (next) {
      const a = Math.abs(x - previous[0]) + Math.abs(y - previous[1]);
      const b = Math.abs(next[0] - x) + Math.abs(next[1] - y);
      const turn =
        (x - previous[0]) * (next[1] - y) !== (y - previous[1]) * (next[0] - x);
      const r = turn ? Math.max(0, Math.min(radius, a / 2, b / 2)) : 0;
      if (r) {
        const entry: [number, number] = [
          x - Math.sign(x - previous[0]) * r,
          y - Math.sign(y - previous[1]) * r,
        ];
        const exit: [number, number] = [
          x + Math.sign(next[0] - x) * r,
          y + Math.sign(next[1] - y) * r,
        ];
        commands.push(
          entry[0] === previous[0] ? `V${n(entry[1])}` : `H${n(entry[0])}`,
          `Q${n(x)},${n(y)} ${n(exit[0])},${n(exit[1])}`,
        );
        continue;
      }
    }
    commands.push(x === previous[0] ? `V${n(y)}` : `H${n(x)}`);
  }
  return commands.join(" ");
}

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
  const root = useRef<HTMLElement>(null);
  const [geometry, setGeometry] = useState<Geometry>({
    width: 0,
    height: 0,
    axis: 0,
    routes: [],
    markers: [],
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
        markers: [],
        stations: [],
      });
      return;
    }
    const bounds = host.getBoundingClientRect();
    const spine = host.querySelector<HTMLElement>(".story-spine");
    const rail = host.querySelector<HTMLElement>(".story-rail-end");
    if (!bounds.width || !bounds.height || !spine || !rail) return;
    const css = getComputedStyle(host);
    const token = (name: string) =>
      Number.parseFloat(css.getPropertyValue(name)) || 0;
    const axis = spine.getBoundingClientRect().left - bounds.left;
    const railX = rail.getBoundingClientRect().left - bounds.left;
    const desktop = css.getPropertyValue("--story-layout").trim() === "desktop";
    const clearance = token("--story-clearance");
    const pitch = token("--story-pitch");
    const nodeSize = token("--metro-station-size");
    const radius = token("--story-corner");
    const centers = events.map((event) => {
      const row = host.querySelector<HTMLElement>(
        `[data-event-id="${CSS.escape(event.id)}"]`,
      );
      const card = row?.querySelector<HTMLElement>(".story-card");
      return card
        ? card.getBoundingClientRect().top -
            bounds.top +
            Math.min(clearance, 24)
        : 0;
    });
    const sides = {
      left: Math.max(
        0,
        ...graph.branches
          .filter((branch) => branch.role !== "coach")
          .map((branch) => branch.sideLane + 1),
      ),
      right: Math.max(
        0,
        ...graph.branches
          .filter((branch) => branch.role === "coach")
          .map((branch) => branch.sideLane + 1),
      ),
    };
    const branchX = (branch: Branch) => {
      if (!desktop)
        return (
          axis +
          Math.min(
            pitch,
            (railX - axis - nodeSize) / (graph.branches.length + 1),
          ) *
            (branch.lane + 1)
        );
      const side = branch.role === "coach" ? "right" : "left";
      const step = Math.min(
        pitch,
        (Math.abs(railX - axis) - nodeSize) / (sides[side] + 1),
      );
      return axis + (side === "right" ? 1 : -1) * step * (branch.sideLane + 1);
    };
    const routes: Route[] = [];
    const markers: Marker[] = [];
    const stations: Station[] = [];
    if (centers.length)
      routes.push({
        id: "main",
        role: "player",
        d: `M${axis.toFixed(3)},${(centers[0] - clearance).toFixed(3)} V${((centers.at(-1) ?? 0) + clearance).toFixed(3)}`,
      });
    for (const branch of graph.branches) {
      const x = branchX(branch);
      const top = centers[branch.first] - clearance;
      const bottom = centers[branch.last] + clearance;
      const topOpen = branch.open;
      const bottomOpen =
        page.nextCursor !== null && branch.last === events.length - 1;
      const points: Array<[number, number]> = topOpen
        ? [
            [x, top],
            [x, bottom],
          ]
        : [
            [axis, top],
            [x, top],
            [x, bottom],
          ];
      if (!bottomOpen) points.push([axis, bottom]);
      routes.push({
        id: branch.id,
        role: branch.role,
        d: routePath(points, radius),
      });
      markers.push({
        id: `${branch.id}:top`,
        x: topOpen ? x : axis,
        y: top,
        role: branch.role,
        open: topOpen,
      });
      markers.push({
        id: `${branch.id}:bottom`,
        x: bottomOpen ? x : axis,
        y: bottom,
        role: branch.role,
        open: bottomOpen,
      });
      for (const index of branch.indices) {
        const event = events[index];
        stations.push({
          id: event.id,
          x,
          y: centers[index],
          role: event.actorRole,
        });
      }
    }
    setGeometry({
      width: bounds.width,
      height: bounds.height,
      axis,
      routes,
      markers,
      stations,
    });
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
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
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

  return (
    <section
      ref={root}
      className={`story-network${compact ? " story-compact" : ""}`}
      aria-label={`${playerName} idővonala`}
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
          {geometry.markers.map((marker) => (
            <circle
              key={marker.id}
              cx={marker.x}
              cy={marker.y}
              className={
                marker.open
                  ? `story-terminal actor-${marker.role}`
                  : "story-junction"
              }
            />
          ))}
          {geometry.stations.map((station) => (
            <circle
              key={station.id}
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
          const dateTime = new Date(event.submittedAt).toLocaleString("hu-HU", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
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
                  <div className="event-meta">
                    <ActorBadge role={event.actorRole} />
                    <span>{playerName}</span>
                    <span className="sr-only">
                      · játékosazonosító {playerId}
                    </span>
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
                                : [...current].filter((id) => id !== event.id),
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
    </section>
  );
}
