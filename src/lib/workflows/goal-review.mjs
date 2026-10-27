const REVIEW_PREFIX = "Saját cél újranézés · ";

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function nextGoalReviewDate(today, days) {
  if (!validDay(today) || ![7, 14, 28].includes(days)) return null;
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function latestGoalReviewDate(records, goalId) {
  const prefix = `${REVIEW_PREFIX}${goalId} · `;
  const latest = (records ?? [])
    .filter((record) => record.text?.startsWith(prefix))
    .slice()
    .sort((a, b) =>
      String(b.occurredAt ?? "").localeCompare(String(a.occurredAt ?? "")),
    )[0];
  const value = latest?.text?.slice(prefix.length).trim();
  return validDay(value) ? value : null;
}

export function isGoalReviewDue(reviewDate, today) {
  return validDay(reviewDate) && validDay(today) && reviewDate <= today;
}
