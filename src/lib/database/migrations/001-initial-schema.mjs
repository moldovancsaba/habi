import { COLLECTIONS, indexesForCollection } from "../migration-schema.mjs";
import { mongoValidatorForCollection } from "../contract-validation.mjs";

export const migration = Object.freeze({
  id: "001-initial-schema",
  sourceFile: new URL("./001-initial-schema.mjs", import.meta.url),
  async up(db) {
    for (const name of COLLECTIONS) {
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
    }
  },
});
