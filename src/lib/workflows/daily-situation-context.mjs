const SITUATIONS = Object.freeze({
  focus: {
    situationId: "too-fast",
    title: "A mai figyelmemről beszélgetek",
  },
  mood: {
    situationId: "afraid-to-try",
    title: "A mai hangulatomról beszélgetek",
  },
});

/** Offer only authored routes directly tied to an answered check-in metric. */
export function getDailySituationOptions(checkin, metricDefinitions) {
  if (
    !checkin ||
    typeof checkin.id !== "string" ||
    !Array.isArray(checkin.answerCodes)
  )
    return [];

  return checkin.answerCodes.flatMap(({ metric, code }) => {
    const route = SITUATIONS[metric];
    const definition = metricDefinitions.find(([key]) => key === metric);
    const answer = definition?.[2]?.[code];
    if (!route || !definition || !answer || ![2, 3].includes(code)) return [];
    return [
      {
        ...route,
        checkinId: checkin.id,
        completedAt: checkin.completedAt,
        metric,
        question: definition[1],
        answer,
      },
    ];
  });
}
