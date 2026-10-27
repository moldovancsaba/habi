/** Format only the player's own preparation fields; never send or infer content. */
export function createTrustedAdultMessage({ person, topic, ask }) {
  if (![person, topic, ask].some((value) => value.trim())) return "";
  return [
    "Beszélgetésre készülök egy megbízható felnőttel",
    person.trim() ? `Kivel: ${person.trim()}` : "Kivel: Kihagyva",
    topic.trim()
      ? `Miről szeretnék beszélni: ${topic.trim()}`
      : "Miről szeretnék beszélni: Kihagyva",
    ask.trim()
      ? `Milyen segítséget kérnék: ${ask.trim()}`
      : "Milyen segítséget kérnék: Kihagyva",
  ].join("\n");
}
