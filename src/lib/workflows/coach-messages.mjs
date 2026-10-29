import { ownerScope, requireCoachPlayer } from "./coach-memory.mjs";
export const messageSourceId = (id) => `coach-message-${id}`;
const plain = (text) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const questionStart =
  /^(?:mi\b|mit\b|mikor\b|hogyan\b|hogy\b|milyen\b|mennyi\b|menjek\b|mehetek\b|lehet\b|vajon\b|what\b|why\b|how\b|should\b|could\b)/;
export function messageUnderstanding(text, role, proposed) {
  const q = plain(text.trim());
  const feedback =
    /nem segitett|nem segit|ezt mar|rovidebb|roviden|ismetled|ismetles|hosszabb|hasznos volt|bevalt|nem valt be|helpful|shorter/.test(
      q,
    );
  const correction =
    /pontositas|helyesbit|ugy ertettem|nem .{0,100}hanem|correction/.test(q);
  const preference = /szeretem|jobban szeret|szeretnek|prefer/.test(q);
  const goal = /celom|az a cel|szeretnek elerni|my goal/.test(q);
  const hypothesis = /^(?:ha\b|talan\b|azt hiszem\b|maybe\b|if\b)/.test(q);
  const question = text.includes("?") || questionStart.test(q);
  const report =
    /koz erzet|kozerzet|vagyok|erzem|erez|jobban|jobb |rosszabb|kiderult|elfelejt|reggeliz|ettem|aludt|edzett|feel|forgot|slept|better/.test(
      q,
    );
  const acts = [
    ...new Set([
      ...(question ? ["question"] : []),
      ...(correction ? ["correction"] : []),
      ...(feedback ? ["feedback"] : []),
      ...(preference ? ["preference"] : []),
      ...(goal ? ["goal"] : []),
      ...(hypothesis ? ["hypothesis"] : []),
      ...(!question && report ? ["update"] : []),
    ]),
  ];
  const subject =
    feedback || preference
      ? "author"
      : role === "player"
        ? "player"
        : feedback ||
            preference ||
            /\bvagyok\b|\berzem\b|\bnekem\b|\bnem ettem\b/.test(q)
          ? "author"
          : /kozerzete|elfelejtett|aludt|edzett|neki|jatek(os|a)/.test(q)
            ? "player"
            : "unknown";
  const validKinds = [
    "update",
    "correction",
    "feedback",
    "preference",
    "goal",
    "hypothesis",
  ];
  const proposedNotes = Array.isArray(proposed?.notes) ? proposed.notes : [];
  const notes = proposedNotes
    .filter((n) => {
      if (
        !n ||
        typeof n.quote !== "string" ||
        !text.includes(n.quote) ||
        !n.quote.trim() ||
        !validKinds.includes(n.kind)
      )
        return false;
      const start = text.indexOf(n.quote),
        end = start + n.quote.length;
      // Never extract a bare positive phrase from a negated/conditional question.
      const before = text.slice(0, start).trimEnd(),
        after = text.slice(end).trimStart();
      if (before && !/[,.!?;]$/.test(before)) return false;
      if (after && !/^[,.!?;]/.test(after)) return false;
      const sentenceStart =
        Math.max(
          text.lastIndexOf(".", start - 1),
          text.lastIndexOf("?", start - 1),
          text.lastIndexOf("!", start - 1),
        ) + 1;
      const nextStop = text.slice(end).search(/[.!?]/u);
      const sentence = text.slice(
        sentenceStart,
        nextStop < 0 ? text.length : end + nextStop + 1,
      );

      return (
        n.kind === "hypothesis" ||
        (!sentence.includes("?") &&
          !questionStart.test(plain(sentence.trim())) &&
          !hypothesis)
      );
    })
    .slice(0, 5)
    .map((n) => ({
      quote: n.quote.trim(),
      kind: n.kind,
      timeText:
        typeof n.timeText === "string" && text.includes(n.timeText)
          ? n.timeText.slice(0, 40)
          : null,
      corrects: Array.isArray(n.corrects) ? n.corrects.slice(0, 5) : [],
    }));
  if (!notes.length && question) {
    const sentences = text.match(/[^.!?]+[.!?]?/gu) ?? [];
    if (sentences.length > 1)
      for (const sentence of sentences) {
        if (
          !sentence.includes("?") &&
          !questionStart.test(plain(sentence.trim()))
        )
          notes.push(...messageUnderstanding(sentence.trim(), role).notes);
      }
  }
  if (
    !notes.length &&
    !question &&
    (report || feedback || preference || goal || correction || hypothesis)
  ) {
    const kind = correction
      ? "correction"
      : feedback
        ? "feedback"
        : goal
          ? "goal"
          : preference
            ? "preference"
            : hypothesis
              ? "hypothesis"
              : "update";
    for (const quote of text.split(/,\s*(?=kiderült\b|de\b)/i).slice(0, 5))
      notes.push({
        quote: quote.trim(),
        kind,
        timeText: /\btegnap\b/i.test(quote)
          ? "tegnap"
          : /\bma\b/i.test(quote)
            ? "ma"
            : null,
        corrects: [],
      });
  }
  return {
    acts: [...new Set([...acts, ...notes.map((n) => n.kind)])].slice(0, 8)
      .length
      ? [...new Set([...acts, ...notes.map((n) => n.kind)])].slice(0, 8)
      : ["other"],
    subject:
      subject === "author"
        ? "author"
        : ["player", "author"].includes(proposed?.subject)
          ? proposed.subject
          : subject,
    notes: notes.slice(0, 5),
  };
}
export function reportedDay(at, relative) {
  if (!["ma", "tegnap"].includes(relative)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const date = new Date(
    `${get("year")}-${get("month")}-${get("day")}T12:00:00Z`,
  );
  if (relative === "tegnap") date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
export async function coachMessageHistory({
  db,
  principal,
  playerId,
  before = /** @type {string | null} */ (null),
}) {
  await requireCoachPlayer(db, principal, playerId);
  const scope =
      principal.role === "coach"
        ? { tenantId: principal.tenantId, playerId }
        : ownerScope(principal, playerId),
    query = { ...scope };
  if (before) {
    const cursor = await db
      .collection("habi_coach_turns")
      .findOne({ ...scope, id: before });
    if (!cursor) return { items: [], nextCursor: null };
    query.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { $lt: cursor.id } },
    ];
  }
  const events = await db
    .collection("habi_coach_profile_events")
    .find(scope)
    .toArray();
  const turns = await db
    .collection("habi_coach_turns")
    .find(query)
    .sort({ createdAt: -1, id: -1 })
    .limit(41)
    .toArray();
  return {
    items: turns.slice(0, 40).map((t) => ({
      id: t.id,
      threadId: t.threadId,
      canManage: t.actorId === principal.actorId && t.role === principal.role,
      text: t.question,
      at: t.createdAt,
      role: t.role,
      ignored: events.some(
        (e) => e.kind === "forget" && e.targetId === messageSourceId(t.id),
      ),
      understanding: messageUnderstanding(
        t.question,
        t.role,
        t.answer?.messageUnderstanding,
      ),
    })),
    nextCursor: turns.length > 40 ? turns[39].id : null,
  };
}
