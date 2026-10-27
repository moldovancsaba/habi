import content from "../content/coach-assessments-v1.json" with {
  type: "json",
};
import { HabiApiError } from "../api/error-response.mjs";
import { createRecord } from "./records.mjs";
import { isValidApiInput } from "../api/input-validation.mjs";

export function buildCoachAssessment(input) {
  const topic = content.topics.find((item) => item.id === input?.topicId);
  if (
    !isValidApiInput("CoachAssessmentInput", input) ||
    !topic ||
    !["questionnaire", "interview", "cognitive"].includes(input.mode) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !Number.isFinite(Date.parse(`${input.date}T12:00:00Z`))
  )
    throw new HabiApiError("INVALID_INPUT");
  const text = (key, max = 700) => {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > max)
      throw new HabiApiError("INVALID_INPUT");
    return value.trim();
  };
  const lines = [
    `Edzői felmérés · ${topic.title} · ${input.mode === "questionnaire" ? "Kérdőív" : input.mode === "interview" ? "Interjú" : "CogMap eredmény"}`,
    `Dátum: ${input.date}`,
    `Tartalom: ${content.version} · ${content.language} · ${content.translationVersion} · ${topic.id}`,
    `Körülmények, nyelv és segítség: ${text("context") || "Nincs megadva"}`,
  ];
  const items = content.items.filter((item) => item.construct_id === topic.id);
  if (input.mode === "questionnaire") {
    if (
      !items.length ||
      !Array.isArray(input.answers) ||
      input.answers.length !== items.length
    )
      throw new HabiApiError("INVALID_INPUT");
    const labels =
      topic.domain === "personality"
        ? [
            "Egyáltalán nem jellemző",
            "Nem jellemző",
            "Vegyes / semleges",
            "Jellemző",
            "Nagyon jellemző",
          ]
        : ["Soha", "Ritkán", "Néha", "Gyakran", "Szinte mindig"];
    items.forEach((item, i) => {
      const answer = input.answers[i];
      if (
        answer !== null &&
        (!Number.isInteger(answer) || answer < 1 || answer > 5)
      )
        throw new HabiApiError("INVALID_INPUT");
      lines.push(
        `${item.id} · v${item.version} · ${item.reverse ? "fordított megfogalmazás" : "eredeti megfogalmazás"}\n${item.text}\nVálasz: ${answer === null ? "Tudatosan kihagyva / nem alkalmazható" : labels[answer - 1]}`,
      );
    });
    if (input.answers.every((a) => a === null) && !text("example"))
      throw new HabiApiError("INVALID_INPUT");
  } else if (input.mode === "interview") {
    if (!text("example")) throw new HabiApiError("INVALID_INPUT");
    if (input.scenarioId) {
      const scenario = content.scenarios.find(
        (item) =>
          item.id === input.scenarioId && item.construct_id === topic.id,
      );
      if (!scenario) throw new HabiApiError("INVALID_INPUT");
      lines.push(
        `Helyzet: ${scenario.context}\n${scenario.prompt}\n${scenario.followups.join("\n")}`,
      );
    } else lines.push(`Interjúkérdés: ${topic.interview}`);
  } else {
    if (
      topic.domain !== "cognitive" ||
      !text("value", 100) ||
      !text("scale", 150) ||
      !text("source", 500) ||
      !text("reference", 500)
    )
      throw new HabiApiError("INVALID_INPUT");
    lines.push(
      `Eredeti riportérték: ${text("value", 100)}\nSkála, mértékegység: ${text("scale", 150)}\nForrás, verzió, oldal: ${text("source", 500)}\nÖsszehasonlítás alapja: ${text("reference", 500)}`,
    );
  }
  lines.push(
    `A játékos saját szavai: ${text("example") || "Nincs megadva"}`,
    `Edzői megfigyelés: ${text("reflection") || "Nincs megadva"}`,
    `Korlát: ${topic.boundary || "A válaszokat a körülményekkel együtt értelmezd."}`,
    "Nincs pontozás vagy diagnosztikus minősítés.",
  );
  const result = lines.join("\n\n");
  if (result.length > 4000) throw new HabiApiError("INVALID_INPUT");
  return result;
}

export async function createCoachAssessment(args) {
  if (args.principal.role !== "coach") throw new HabiApiError("ACCESS_DENIED");
  let input;
  try {
    input = await args.request.json();
  } catch {
    throw new HabiApiError("INVALID_INPUT");
  }
  const record = {
    kind: "observation",
    text: buildCoachAssessment(input),
    occurredAt: (args.now ?? new Date()).toISOString(),
    timeZone: "UTC",
    sourceKind: input.mode === "cognitive" ? "observation" : "proxy",
    sessionId: null,
    metric: null,
    answerCode: null,
    context: {
      setting: "training",
      activity: `coach-assessment:${input.topicId}:${content.version}`,
      durationMinutes: null,
    },
  };
  return createRecord({
    ...args,
    request: new Request(args.request.url, {
      method: "POST",
      headers: args.request.headers,
      body: JSON.stringify(record),
    }),
  });
}
