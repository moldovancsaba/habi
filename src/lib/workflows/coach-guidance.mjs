import content from "../content/coach-guidance-v1.json" with { type: "json" };
const normal = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
export function isTrainingAttendanceQuestion(question) {
  const q = normal(question);
  if (/\bmikor\b|hanykor|kezdodik|kezdodes/.test(q)) return false;
  return (
    /edz|trening|train|practice/.test(q) &&
    /menj|mehe|menni|edzhet|kihagy|reszt vegy|should|attend|skip/.test(q)
  );
}
export function trainingGuidanceSource() {
  const item = content["training-attendance"];
  return {
    id: "habi-guidance-training-attendance",
    revision: content.version,
    span: null,
    kind: "authored_content",
    title: item.title,
    text: [
      item.player,
      item.other,
      item.selfInOtherRole,
      item.boundary,
      ...item.sources.map((s) => `${s.title}: ${s.url}`),
    ].join("\n\n"),
    at: "",
    role: "Habi",
  };
}
function calendarDay(at) {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function coachQuestionGuidance({
  question,
  role,
  sources,
  now = new Date(),
}) {
  if (!isTrainingAttendanceQuestion(question)) return null;
  const item = content["training-attendance"],
    guide = trainingGuidanceSource();
  const self = /\bmenjek\b|\bmehetek\b|\bedzhetek\b|should i/.test(
    normal(question),
  );
  const text =
    role === "player" ? item.player : self ? item.selfInOtherRole : item.other;
  const checkins = sources
    .filter(
      (s) =>
        s.kind === "checkin_results" &&
        Number.isFinite(Date.parse(s.at)) &&
        Date.parse(s.at) <= now.getTime(),
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const today = calendarDay(now),
    hasCurrentCheckin = checkins.some((s) => calendarDay(s.at) === today);
  const freshness = hasCurrentCheckin
    ? "Van mai állapotjelzés, de a közérzetet, esetleges új panaszokat és a mai programot külön kell tisztázni."
    : checkins.length
      ? `A legutóbbi itt elérhető állapotjelzés ${new Date(checkins[0].at).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })} készült. Ezt nem kezelem mai állapotként.`
      : "Ebben a beszélgetésben nincs mai állapotjelzés. A korábbi jegyzetekből nem tételezek fel mai közérzetet.";
  return {
    claim: {
      id: "attendance-guidance-v1",
      text,
      kind: "general",
      evidenceRefs: [{ id: guide.id, revision: guide.revision, span: null }],
      review: null,
    },
    unknowns: [freshness],
    questions: [
      ...(role !== "player" && self
        ? ["Magadról kérdezel, vagy a kiválasztott játékosról?"]
        : []),
      role === "player" || self
        ? "Ma hogyan érzed magad — van fájdalom, rosszullét vagy új panasz?"
        : "A játékos ma hogyan érzi magát — van fájdalom, rosszullét vagy új panasz?",
      ...(role === "player" || !self
        ? ["Mi az edzővel megbeszélt mai program?"]
        : []),
    ],
    asOfDate: today,
    hasCurrentCheckin,
  };
}
