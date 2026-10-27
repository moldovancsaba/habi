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
  return {
    points,
    path: path.trim(),
    width: Math.max(600, 192 + (entries.length - 1) * 90),
  };
}
