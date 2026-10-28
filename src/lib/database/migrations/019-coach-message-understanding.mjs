import { mongoValidatorForCollection } from "../contract-validation.mjs";
export const migration = Object.freeze({
  id: "019-coach-message-understanding",
  sourceFile: new URL("./019-coach-message-understanding.mjs", import.meta.url),
  async up(db) {
    // Additive optional reply/understanding fields; original messages are untouched.
    for (const name of [
      "habi_coach_turns",
      "habi_coach_profile_events",
      "turns",
      "interpretations",
    ])
      await db.command({
        collMod: name,
        validator: mongoValidatorForCollection(name),
        validationLevel: "strict",
        validationAction: "error",
      });
  },
});
