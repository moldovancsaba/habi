import { indexesForCollection } from "../migration-schema.mjs";
import { mongoValidatorForCollection } from "../contract-validation.mjs";

export const migration = Object.freeze({
  id: "006-coach-materials",
  sourceFile: new URL("./006-coach-materials.mjs", import.meta.url),
  async up(db) {
    const name = "coach_materials";
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
