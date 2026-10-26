import { mongoValidatorForCollection } from "../contract-validation.mjs";

export const migration = Object.freeze({
  id: "012-player-display-names",
  sourceFile: new URL("./012-player-display-names.mjs", import.meta.url),
  async up(db) {
    for (const name of ["players", "habi_role_invitations"]) {
      const collections = db.listCollections({ name }, { nameOnly: true });
      if (!(await collections.hasNext())) continue;
      await db.command({
        collMod: name,
        validator: mongoValidatorForCollection(name),
        validationLevel: "strict",
        validationAction: "error",
      });
    }
  },
});
