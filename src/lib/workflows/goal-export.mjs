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
  const lines = [
    "HABI · A saját vállalásom",
    "",
    goalText,
    `Állapot: ${status}`,
    `Rögzítve: ${formatDate(goal?.occurredAt)}`,
  ];

  if (includeHistory) {
    const history = (records ?? [])
      .filter((record) => {
        const text = record.text ?? "";
        return (
          text.startsWith(`Saját cél módosítva · ${goal?.id} ·`) ||
          text.startsWith(`Saját cél állapot · ${goal?.id} ·`) ||
          text.startsWith(`Saját cél visszatekintés · ${goal?.id} ·`)
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
