import { indexesForCollection } from "../migration-schema.mjs";
import { mongoValidatorForCollection } from "../contract-validation.mjs";

export const migration = Object.freeze({
  id: "005-interpretation-reviews",
  sourceFile: new URL("./005-interpretation-reviews.mjs", import.meta.url),
  async up(db) {
    const name = "interpretation_reviews";
    const exists = await db
      .listCollections({ name }, { nameOnly: true })
      .hasNext();
    if (!exists)
      await db.createCollection(name, {
        validator: mongoValidatorForCollection(name),
        validationLevel: "strict",
        validationAction: "error",
      });
    else
      await db.command({
        collMod: name,
        validator: mongoValidatorForCollection(name),
        validationLevel: "strict",
        validationAction: "error",
      });
    await db.collection(name).createIndexes(indexesForCollection(name));
  },
});
