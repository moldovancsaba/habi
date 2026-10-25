import { requestHabiApi } from "./api-client.mjs";
import { adaptTimelinePage } from "./timeline-view-model.mjs";
import { isTimelinePageResponse } from "./timeline-response-validator.mjs";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function buildTimelinePath(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw new Error("TIMELINE_QUERY_INVALID");
  }
  const allowed = new Set(["playerId", "kind", "cursor", "limit"]);
  if (Object.keys(query).some((key) => !allowed.has(key))) {
    throw new Error("TIMELINE_QUERY_INVALID");
  }

  const params = new URLSearchParams();
  if (query.playerId !== undefined) {
    if (
      typeof query.playerId !== "string" ||
      !ID_PATTERN.test(query.playerId)
    ) {
      throw new Error("TIMELINE_QUERY_INVALID");
    }
    params.set("playerId", query.playerId);
  }
  if (query.kind !== undefined) {
    if (
      typeof query.kind !== "string" ||
      query.kind.length < 1 ||
      query.kind.length > 50
    ) {
      throw new Error("TIMELINE_QUERY_INVALID");
    }
    params.set("kind", query.kind);
  }
  if (query.cursor !== undefined) {
    if (
      typeof query.cursor !== "string" ||
      query.cursor.length < 1 ||
      query.cursor.length > 2000
    ) {
      throw new Error("TIMELINE_QUERY_INVALID");
    }
    params.set("cursor", query.cursor);
  }
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50) {
      throw new Error("TIMELINE_QUERY_INVALID");
    }
    params.set("limit", String(query.limit));
  }
  const suffix = params.toString();
  return suffix ? `/v1/timeline?${suffix}` : "/v1/timeline";
}

/** Fetch the canonical timeline endpoint, validate its pinned DTO, then adapt it. */
export async function loadTimelinePage(query, options = {}) {
  const path = buildTimelinePath(query);
  const dto = await requestHabiApi(path, {
    ...options,
    method: "GET",
    validateResponse: isTimelinePageResponse,
  });
  return adaptTimelinePage(dto);
}
