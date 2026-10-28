/** Conversation state is derived only from verified turns in the same private thread.
 * It describes the exchange, never invents new facts about the player.
 */
export const conversationQuestionKey = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const key = (ref) => `${ref.id}:${ref.revision}`;
export function coachConversation({
  question,
  previous,
  sources,
  sourceRefs,
  questions = [],
  answer,
}) {
  const texts = (value) =>
    (value?.claims ?? [])
      .filter((c) => c.kind !== "inference")
      .map((c) => conversationQuestionKey(c.text))
      .filter(Boolean);
  const currentTexts = texts(answer);
  const seenRefs = new Set(
    previous.flatMap((turn) => (turn.sourceRefs ?? []).map(key)),
  );
  const unseenPersonal = sourceRefs.some(
    (ref) =>
      sources.some(
        (source) =>
          key(source) === key(ref) &&
          !["authored_content", "derived_profile"].includes(source.kind),
      ) && !seenRefs.has(key(ref)),
  );

  const duplicate =
    !unseenPersonal &&
    currentTexts.length > 0 &&
    previous.some((turn) => {
      const oldTexts = new Set(texts(turn.answer));
      return currentTexts.every((text) => oldTexts.has(text));
    });
  const matching = previous.filter(
    (turn) =>
      conversationQuestionKey(turn.question) ===
      conversationQuestionKey(question),
  );
  if (!matching.length)
    return duplicate
      ? {
          repeated: true,
          suppressRepeatedAnswer: true,
          lead: "A mostani kérdésed más, de a válaszhoz ugyanazok a korábban bemutatott adatok kerültek elő. Nem ismétlem meg őket, és ezekből nem állítok új összefüggést. Pontosítsuk, mire keresel magyarázatot.",
          questions: [
            "Melyik részhez szeretnél más magyarázatot vagy további információt?",
          ],
        }
      : null;
  const last = matching.at(-1);
  const lastIndex = previous.indexOf(last);
  if (
    !duplicate &&
    previous
      .slice(lastIndex + 1)
      .some(
        (turn) =>
          conversationQuestionKey(turn.question) !==
          conversationQuestionKey(question),
      )
  )
    return {
      repeated: true,
      suppressRepeatedAnswer: false,
      hasNewUserContext: true,
      lead: "Közben más részletet is írtál. Most azzal együtt nézem újra a kérdésedet; a korábbi választ nem másolom ide újra.",
      questions: [],
    };

  const priorRefs = new Set((last.sourceRefs ?? []).map(key));
  const newEvidence = sourceRefs.filter((ref) => {
    const source = sources.find((s) => key(s) === key(ref));
    return (
      source &&
      !["authored_content", "derived_profile"].includes(source.kind) &&
      !priorRefs.has(key(ref))
    );
  });
  if (newEvidence.length)
    return {
      repeated: true,
      suppressRepeatedAnswer: false,
      lead: "Az előző válasz óta más vagy újabb forrás is kapcsolódik a kérdésedhez. Nézzük meg, mit tesz hozzá; az előző választ önmagában nem tekintem új bizonyítéknak.",
      questions: [],
    };
  // The first answer may ask several questions. On repetition, focus on one
  // unresolved question; later repetitions explore what the user needs instead.
  const askedInContinuations = new Set(
    previous.flatMap((turn) => turn.conversation?.questions ?? []),
  );
  const candidates = [
    ...new Set([...questions, ...(last.answer?.clarifyingQuestions ?? [])]),
  ];
  const remaining = candidates.find((q) => !askedInContinuations.has(q));
  const focus =
    remaining ??
    (matching.length < 3
      ? "Mi maradt bizonytalan: a válasz jelentése, az indoklása vagy a következő lépés?"
      : "Mi miatt térsz vissza ehhez a kérdéshez — mi hiányzott eddig a válaszomból?");
  return {
    repeated: true,
    suppressRepeatedAnswer: true,
    lead:
      matching.length === 1
        ? "Visszatértél ugyanahhoz a kérdéshez. A kérdéshez most is ugyanazok a források állnak rendelkezésre, ezért nem ismétlem meg az egész választ. Inkább pontosítsunk egy dolgot."
        : remaining
          ? "Maradt még egy rész, amit nem tisztáztunk; erre térnék rá. Új adat nélkül nem változtatom meg a korábbi megállapításokat."
          : "Látom, hogy az eddigi válaszok még nem adták meg, amit keresel. Nem lenne hasznos ugyanazt újra leírnom. Segíts megérteni, mire lenne szükséged.",
    questions: [focus],
  };
}
