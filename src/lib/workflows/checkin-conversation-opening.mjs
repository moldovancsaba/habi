/** Build a factual, player-reviewed opening from saved check-in answers. */
export function createCheckinConversationOpening(checkin, metricDefinitions) {
  if (!checkin || !Array.isArray(checkin.answerCodes)) return "";

  const answers = checkin.answerCodes.flatMap(({ metric, code }) => {
    const definition = metricDefinitions.find(([key]) => key === metric);
    const answer = definition?.[2]?.[code];
    return answer ? [`${definition[1]}: ${answer}`] : [];
  });

  if (answers.length === 0) return "";
  return `A legutóbbi állapotjelzésemben ezeket válaszoltam: ${answers.join("; ")}. Szeretnék beszélgetni arról, ami nekem fontos.`;
}
