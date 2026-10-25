import { mongoValidatorForCollection } from "../contract-validation.mjs";

export const migration = Object.freeze({
  id: "004-checkin-result-session-revision",
  sourceFile: new URL(
    "./004-checkin-result-session-revision.mjs",
    import.meta.url,
  ),
  async up(db) {
    const results = db.collection("checkin_results");
    const sessions = db.collection("checkin_sessions");
    const cursor = results.find({ sessionRevision: { $exists: false } });
    for await (const result of cursor) {
      const session = await sessions.findOne({
        tenantId: result.tenantId,
        id: result.sessionId,
      });
      if (!session) throw new Error("CHECKIN_RESULT_SESSION_NOT_FOUND");
      const backfilled = await results.updateOne(
        { _id: result._id, sessionRevision: { $exists: false } },
        { $set: { sessionRevision: session.revision } },
      );
      if (backfilled.modifiedCount !== 1) {
        throw new Error("CHECKIN_RESULT_SESSION_REVISION_BACKFILL_FAILED");
      }
    }
    await db.command({
      collMod: "checkin_results",
      validator: mongoValidatorForCollection("checkin_results"),
      validationLevel: "strict",
      validationAction: "error",
    });
  },
});
