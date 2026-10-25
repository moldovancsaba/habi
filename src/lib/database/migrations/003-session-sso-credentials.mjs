import { mongoValidatorForCollection } from "../contract-validation.mjs";

const COLLECTION = "session_sso_credentials";
const INDEXES = [
  { key: { id: 1 }, name: "session_sso_credential_id_unique", unique: true },
  {
    key: { sessionId: 1 },
    name: "session_sso_credential_session_unique",
    unique: true,
  },
  {
    key: { expiresAt: 1 },
    name: "session_sso_credential_expiry_ttl",
    expireAfterSeconds: 0,
  },
  {
    key: { refreshLeaseExpiresAt: 1 },
    name: "session_sso_credential_refresh_lease",
  },
];

export const migration = Object.freeze({
  id: "003-session-sso-credentials",
  sourceFile: new URL("./003-session-sso-credentials.mjs", import.meta.url),
  async up(db) {
    const validator = mongoValidatorForCollection(COLLECTION);
    if (
      !(await db
        .listCollections({ name: COLLECTION }, { nameOnly: true })
        .hasNext())
    ) {
      await db.createCollection(COLLECTION, {
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    } else {
      await db.command({
        collMod: COLLECTION,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    }
    await db.collection(COLLECTION).createIndexes(INDEXES);
  },
});
