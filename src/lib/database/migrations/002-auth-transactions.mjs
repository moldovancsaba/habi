import {
  INTERNAL_COLLECTIONS,
  indexesForCollection,
} from "../migration-schema.mjs";
import { mongoValidatorForCollection } from "../contract-validation.mjs";

export const migration = Object.freeze({
  id: "002-auth-transactions",
  sourceFile: new URL("./002-auth-transactions.mjs", import.meta.url),
  async up(db) {
    for (const name of INTERNAL_COLLECTIONS) {
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
