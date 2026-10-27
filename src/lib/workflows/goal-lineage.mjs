const GOAL_PREFIX = "Saját cél:";
const REPLACEMENT_PREFIX = "Saját célcsere · ";

export function isOwnGoalRecord(record) {
  return (
    record?.kind === "diary" &&
    (record.text?.startsWith(GOAL_PREFIX) ||
      record.text?.startsWith(REPLACEMENT_PREFIX))
  );
}

export function ownGoalText(record) {
  if (record?.text?.startsWith(GOAL_PREFIX))
    return record.text.slice(GOAL_PREFIX.length).trim();
  if (record?.text?.startsWith(REPLACEMENT_PREFIX)) {
    const idSeparator = record.text.indexOf(" · ", REPLACEMENT_PREFIX.length);
    return idSeparator < 0
      ? ""
      : record.text.slice(idSeparator + " · ".length).trim();
  }
  return "";
}

export function replacedGoalId(record) {
  if (!record?.text?.startsWith(REPLACEMENT_PREFIX)) return null;
  const start = REPLACEMENT_PREFIX.length;
  const separator = record.text.indexOf(" · ", start);
  return separator > start ? record.text.slice(start, separator) : null;
}

export function ownGoalLineageStatus(goal, goals, records) {
  const successor = goals
    .filter((candidate) => replacedGoalId(candidate) === goal.id)
    .sort((a, b) =>
      String(a.occurredAt ?? "").localeCompare(String(b.occurredAt ?? "")),
    )
    .at(-1);
  if (successor) return "superseded";

  const events = records
    .filter((record) =>
      record.text?.startsWith(`Saját cél állapot · ${goal.id} ·`),
    )
    .sort((a, b) =>
      String(b.occurredAt ?? "").localeCompare(String(a.occurredAt ?? "")),
    );
  const state = events[0]?.text?.split(" · ").at(-1);
  if (state) return state;
  const legacyText = ownGoalText(goal);
  return records.some((record) => record.text === `Cél lezárva: ${legacyText}`)
    ? "closed"
    : "active";
}
