import { mongoValidatorForCollection } from "../contract-validation.mjs";
import { indexesForCollection } from "../migration-schema.mjs";

export const migration = Object.freeze({
  id: "015-monthly-reflections",
  sourceFile: new URL("./015-monthly-reflections.mjs", import.meta.url),
  async up(db) {
    const name = "monthly_reflections";
    const validator = mongoValidatorForCollection(name);
    if (!(await db.listCollections({ name }, { nameOnly: true }).hasNext())) {
      await db.createCollection(name, {
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    } else {
      await db.command({
        collMod: name,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    }
    await db.collection(name).createIndexes(indexesForCollection(name));
  },
});
