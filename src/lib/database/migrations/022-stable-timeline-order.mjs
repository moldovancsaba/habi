export const timelineIndexFields = Object.freeze({
  checkin_results: "completedAt",
  messages: "submittedAt",
  follow_ups: "createdAt",
  interpretations: "updatedAt",
  habi_coach_turns: "createdAt",
  habi_coach_profile_events: "createdAt",
});

export const migration = Object.freeze({
  id: "022-stable-timeline-order",
  sourceFile: new URL("./022-stable-timeline-order.mjs", import.meta.url),
  async up(db) {
    // Existing record_timeline and event_timeline already have this exact order.
    for (const [name, field] of Object.entries(timelineIndexFields))
      await db
        .collection(name)
        .createIndex(
          { tenantId: 1, playerId: 1, [field]: -1, id: -1 },
          { name: "timeline_player_time_id" },
        );
  },
});
