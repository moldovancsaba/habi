/** @type {ReadonlyArray<readonly [string, string, readonly string[]]>} */
export const checkinMetrics = [
  [
    "energy",
    "Mennyi energiád van?",
    ["Sok", "Megfelelő", "Kevés", "Kimerültem"],
  ],
  ["sleep", "Hogyan aludtál?", ["Kiválóan", "Jól", "Keveset", "Rosszul"]],
  [
    "focus",
    "Mennyire tudsz figyelni?",
    ["Nagyon jól", "Jól", "Nehezen", "Alig"],
  ],
  [
    "mood",
    "Hogy érzed magad?",
    ["Nagyon jól", "Jól", "Lehangoltan", "Feszült"],
  ],
  [
    "load",
    "Mennyit edzettél?",
    ["Nem edzettem", "Keveset", "Közepesen", "Sokat"],
  ],
];

export function metricGraphicLevel(metric, code) {
  if (
    !checkinMetrics.some(([key]) => key === metric) ||
    !Number.isInteger(code) ||
    code < 0 ||
    code > 3
  )
    return null;
  return metric === "load" ? code + 1 : 4 - code;
}

function calendarDay(timestamp) {
  const date = new Date(timestamp);
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  );
}

/**
 * @param {Array<{id: string, completedAt?: string, answerCodes?: Array<{metric: string, code: number}>}>} checkins
 * @param {string} metric
 * @param {number} period
 * @param {number} now
 */
export function buildCheckinChart(checkins, metric, period, now) {
  const cutoff = now - period * 86400000;
  const entries = checkins
    .filter(
      (item) =>
        Number.isFinite(Date.parse(item.completedAt)) &&
        Date.parse(item.completedAt) >= cutoff &&
        Date.parse(item.completedAt) <= now,
    )
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.completedAt) - Date.parse(b.completedAt) ||
        a.id.localeCompare(b.id),
    );
  const points = entries.map((item, index) => {
    const value = item.answerCodes?.find(
      (answer) => answer.metric === metric,
    )?.code;
    const code =
      metricGraphicLevel(metric, value) === null ? null : (value ?? null);
    return {
      id: item.id,
      date: item.completedAt ?? "",
      value: code,
      x: 160 + index * 90,
      y: code === null ? null : 32 + code * 64,
    };
  });
  return {
    points,
    path: metroRoutePath(points),
    width: Math.max(600, 192 + (entries.length - 1) * 90),
  };
}

export function metroRoutePath(points) {
  let previous = null;
  let path = "";
  for (const point of points) {
    if (point.y === null) {
      previous = null;
      continue;
    }
    if (!previous || calendarDay(point.date) - calendarDay(previous.date) > 1) {
      path += ` M ${point.x} ${point.y}`;
    } else if (previous.y === point.y) {
      path += ` H ${point.x}`;
    } else {
      const middle = (previous.x + point.x) / 2;
      const direction = point.y > previous.y ? 1 : -1;
      path += ` H ${middle - 8} Q ${middle} ${previous.y} ${middle} ${previous.y + direction * 8} V ${point.y - direction * 8} Q ${middle} ${point.y} ${middle + 8} ${point.y} H ${point.x}`;
    }
    previous = point;
  }
  return path.trim();
}

/** @param {Array<{id:string,completedAt?:string,answerCodes?:Array<{metric:string,code:number}>}>} checkins */
export function projectDailyCheckins(checkins) {
  const days = new Map();
  for (const entry of [...checkins]
    .filter((e) => Number.isFinite(Date.parse(e.completedAt ?? "")))
    .sort(
      (a, b) =>
        Date.parse(a.completedAt ?? "") - Date.parse(b.completedAt ?? "") ||
        a.id.localeCompare(b.id),
    )) {
    const day = calendarDay(entry.completedAt);
    const full =
      new Set(
        entry.answerCodes
          ?.filter((a) => metricGraphicLevel(a.metric, a.code) !== null)
          .map((a) => a.metric),
      ).size === 5;
    const current = days.get(day);
    if (!current || full || !current.full) days.set(day, { entry, full });
  }
  return [...days.values()].map(({ entry }) => entry);
}

/**
 * @param {Array<{id:string,completedAt?:string,sessionRef?:{id:string},answerCodes?:Array<{metric:string,code:number}>}>} results
 * @param {Array<{id:string,kind?:string,sessionId?:string|null,metric?:string|null,answerCode?:number|null,submittedAt?:string,occurredAt?:string}>} records
 */
export function mergePartialCheckins(results, records) {
  const completed = new Set(
    results.map((item) => item.sessionRef?.id).filter(Boolean),
  );
  const sessions = new Map();
  for (const record of records) {
    if (
      record.kind !== "checkin_answer" ||
      !record.sessionId ||
      completed.has(record.sessionId) ||
      metricGraphicLevel(record.metric, record.answerCode) === null
    )
      continue;
    const entry = sessions.get(record.sessionId) ?? {
      id: record.sessionId,
      completedAt: "",
      answerCodes: [],
    };
    const at = record.submittedAt ?? record.occurredAt ?? "";
    if (at > entry.completedAt) entry.completedAt = at;
    entry.answerCodes.push({ metric: record.metric, code: record.answerCode });
    sessions.set(record.sessionId, entry);
  }
  return [...results, ...sessions.values()];
}
