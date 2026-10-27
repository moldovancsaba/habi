import { mongoValidatorForCollection } from "../contract-validation.mjs";

export const migration = Object.freeze({
  id: "016-sso-owner-session-display-name",
  sourceFile: new URL(
    "./016-sso-owner-session-display-name.mjs",
    import.meta.url,
  ),
  async up(db) {
    const name = "habi_sso_owner_sessions";
    if (!(await db.listCollections({ name }, { nameOnly: true }).hasNext())) {
      throw new Error("SSO_OWNER_SESSION_COLLECTION_MISSING");
    }
    await db.command({
      collMod: name,
      validator: mongoValidatorForCollection(name),
      validationLevel: "strict",
      validationAction: "error",
    });
  },
});
