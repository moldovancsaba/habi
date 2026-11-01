import { mongoValidatorForCollection } from "../contract-validation.mjs";
export const migration = Object.freeze({
  id: "020-durable-assessment-attempts",
  sourceFile: new URL("./020-durable-assessment-attempts.mjs", import.meta.url),
  async up(db) {
    await db.command({
      collMod: "assessment_attempts",
      validator: mongoValidatorForCollection("assessment_attempts"),
      validationLevel: "strict",
      validationAction: "error",
    });
    await db
      .collection("assessment_attempts")
      .createIndex(
        { tenantId: 1, playerId: 1, createdAt: -1, id: -1 },
        { name: "assessment_player_history" },
      );
  },
});
