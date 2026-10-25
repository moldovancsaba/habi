import { isTimelinePageResponse } from "./timeline-response-validator.mjs";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ROLES = new Set(["player", "parent", "coach"]);

function isId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isDateTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function requirePage(page) {
  if (!isTimelinePageResponse(page)) {
    throw new Error("TIMELINE_PAGE_INVALID");
  }
}

function requireEvent(event) {
  if (
    !event ||
    typeof event !== "object" ||
    !isId(event.id) ||
    !Number.isSafeInteger(event.revision) ||
    event.revision < 1 ||
    !isDateTime(event.submittedAt) ||
    !isId(event.playerId) ||
    !ROLES.has(event.actorRole) ||
    typeof event.kind !== "string" ||
    event.kind.length < 1 ||
    event.kind.length > 50 ||
    !isId(event.processId) ||
    !(event.replyTo === null || isId(event.replyTo)) ||
    !(event.relatedId === null || isId(event.relatedId))
  ) {
    throw new Error("TIMELINE_EVENT_INVALID");
  }
}

function processIndex(processes) {
  const index = new Map();
  for (const process of processes) {
    if (!process || typeof process !== "object" || !isId(process.id)) {
      throw new Error("TIMELINE_PROCESS_INVALID");
    }
    if (Object.hasOwn(process, "closedAt")) {
      if (process.closedAt !== null && !isDateTime(process.closedAt)) {
        throw new Error("TIMELINE_PROCESS_INVALID");
      }
    }
    index.set(process.id, process);
  }
  return index;
}

/**
 * Adapt an authorized server TimelinePage to the prototype timeline model's
 * field names. The adapter uses only server-supplied event/process state and
 * deliberately excludes storage-only tenant, retention, and audit fields.
 */
export function adaptTimelinePage(page) {
  requirePage(page);
  const processes = processIndex(page.processes);
  const events = page.nodes.map((node) => {
    requireEvent(node);
    const view = {
      id: node.id,
      revision: node.revision,
      at: node.submittedAt,
      role: node.actorRole,
      type: node.kind,
      playerId: node.playerId,
      sourceKind: node.sourceKind,
      resourceRef: Object.freeze({
        id: node.resourceRef.id,
        revision: node.resourceRef.revision,
      }),
      processId: node.processId,
      replyTo: node.replyTo,
      relatedId: node.relatedId,
    };
    const process = processes.get(node.processId);
    if (process && Object.hasOwn(process, "closedAt")) {
      view.closedAt = process.closedAt;
    } else if (Object.hasOwn(node, "closedAt")) {
      view.closedAt = node.closedAt;
    }
    return Object.freeze(view);
  });

  const result = {
    events: Object.freeze(events),
    edges: Object.freeze([...page.edges]),
    continuations: Object.freeze([...page.continuations]),
    nextCursor: page.nextCursor,
    snapshotAt: page.snapshotAt,
  };
  if (Object.hasOwn(page, "accessRevision")) {
    result.accessRevision = page.accessRevision;
  }
  return Object.freeze(result);
}
