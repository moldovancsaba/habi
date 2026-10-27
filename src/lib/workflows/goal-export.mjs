function formatDate(value) {
  if (!value) return "Dátum nélkül";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Dátum nélkül"
    : new Intl.DateTimeFormat("hu-HU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function createGoalExport({
  goal,
  goalText,
  status,
  records,
  includeHistory = false,
}) {
  const localizedStatus =
    {
      active: "aktív",
      paused: "félretett",
      closed: "lezárt",
      habit: "szokásként folytatott",
    }[status] ?? status;
  const lines = [
    "HABI · A saját vállalásom",
    "",
    goalText,
    `Állapot: ${localizedStatus}`,
    `Rögzítve: ${formatDate(goal?.occurredAt)}`,
  ];

  if (includeHistory) {
    const history = (records ?? [])
      .filter((record) => {
        const text = record.text ?? "";
        return (
          text.startsWith(`Saját cél módosítva · ${goal?.id} ·`) ||
          text.startsWith(`Saját cél állapot · ${goal?.id} ·`) ||
          text.startsWith(`Saját cél visszatekintés · ${goal?.id} ·`) ||
          (text.startsWith("Gyakorlat:") &&
            text.split("\n").includes(`Kapcsolódó saját cél · ${goal?.id}`))
        );
      })
      .sort((a, b) =>
        String(a.occurredAt ?? "").localeCompare(String(b.occurredAt ?? "")),
      );
    lines.push("", "A célhoz tartozó előzmények:");
    if (history.length === 0) lines.push("Nincs rögzített előzmény.");
    for (const record of history) {
      const text = record.text ?? "";
      const prefixes = [
        [`Saját cél módosítva · ${goal?.id} ·`, "Módosítás"],
        [`Saját cél állapot · ${goal?.id} ·`, "Állapotváltozás"],
        [`Saját cél visszatekintés · ${goal?.id} ·`, "Visszatekintés"],
      ];
      const [prefix, label] = prefixes.find(([candidate]) =>
        text.startsWith(candidate),
      ) ?? ["", "Előzmény"];
      const detail = text.slice(prefix.length).trim();
      lines.push(`${formatDate(record.occurredAt)} · ${label}: ${detail}`);
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function summarizeRecordedAnswers(points, options) {
  const valid = (points ?? [])
    .filter(
      (point) =>
        Number.isInteger(point.value) &&
        point.value >= 0 &&
        point.value < options.length,
    )
    .slice()
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
  if (valid.length === 0) return "Ebben az időszakban nincs rögzített válasz.";

  const counts = new Map();
  for (const point of valid) {
    const label = options[point.value];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const distribution = options
    .map((label) => [label, counts.get(label) ?? 0])
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label}: ${count}`)
    .join(" · ");
  const latest = valid.at(-1);
  const latestLabel = options[latest.value];
  return `${valid.length} rögzített válasz (${distribution}). Legutóbbi válasz: ${latestLabel} · ${formatDate(latest.date)}.`;
}
