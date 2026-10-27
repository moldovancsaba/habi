import { mongoValidatorForCollection } from "../contract-validation.mjs";
import { indexesForCollection } from "../migration-schema.mjs";
export const migration = Object.freeze({
  id: "018-contextual-ai-coach",
  sourceFile: new URL("./018-contextual-ai-coach.mjs", import.meta.url),
  async up(db) {
    for (const name of [
      "habi_coach_threads",
      "habi_coach_turns",
      "habi_coach_profiles",
      "habi_coach_profile_events",
    ]) {
      if (!(await db.listCollections({ name }, { nameOnly: true }).hasNext())) {
        try {
          await db.createCollection(name, {
            validator: mongoValidatorForCollection(name),
            validationLevel: "strict",
            validationAction: "error",
          });
        } catch (error) {
          if (error.code !== 48) throw error;
        }
      } else
        await db.command({
          collMod: name,
          validator: mongoValidatorForCollection(name),
          validationLevel: "strict",
          validationAction: "error",
        });
      await db.collection(name).createIndexes(indexesForCollection(name));
    }
    await db.command({
      collMod: "jobs",
      validator: mongoValidatorForCollection("jobs"),
      validationLevel: "strict",
      validationAction: "error",
    });
  },
});
