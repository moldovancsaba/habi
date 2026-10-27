import { mongoValidatorForCollection } from "../contract-validation.mjs";

export const migration = Object.freeze({
  id: "014-experience-drafts",
  sourceFile: new URL("./014-experience-drafts.mjs", import.meta.url),
  async up(db) {
    const name = "habi_experience_drafts";
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
    await db.collection(name).createIndexes([
      { key: { id: 1 }, name: "habi_experience_draft_id_unique", unique: true },
      {
        key: { tenantId: 1, playerId: 1, actorId: 1, draftKey: 1 },
        name: "habi_experience_draft_owner_key_unique",
        unique: true,
      },
    ]);
  },
});
