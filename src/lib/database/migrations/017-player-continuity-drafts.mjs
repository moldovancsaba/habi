import { mongoValidatorForCollection } from "../contract-validation.mjs";
export const migration = Object.freeze({
  id: "017-player-continuity-drafts",
  sourceFile: new URL("./017-player-continuity-drafts.mjs", import.meta.url),
  async up(db) {
    await db.command({
      collMod: "habi_experience_drafts",
      validator: mongoValidatorForCollection("habi_experience_drafts"),
      validationLevel: "strict",
      validationAction: "error",
    });
  },
});
