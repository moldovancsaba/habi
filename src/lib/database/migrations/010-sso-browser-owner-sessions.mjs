import { mongoValidatorForCollection } from "../contract-validation.mjs";
import { migration as authTransactions } from "./002-auth-transactions.mjs";

const DEFINITIONS = [
  {
    name: "habi_sso_owner_links",
    indexes: [
      {
        key: { ownerHash: 1 },
        name: "habi_sso_owner_link_owner_unique",
        unique: true,
      },
    ],
  },
  {
    name: "habi_sso_owner_sessions",
    indexes: [
      {
        key: { tokenHash: 1 },
        name: "habi_sso_owner_session_token_unique",
        unique: true,
      },
      {
        key: { expiresAt: 1 },
        name: "habi_sso_owner_session_expiry_ttl",
        expireAfterSeconds: 0,
      },
    ],
  },
  {
    name: "habi_sso_owner_handoffs",
    indexes: [
      {
        key: { tokenHash: 1 },
        name: "habi_sso_owner_handoff_token_unique",
        unique: true,
      },
      {
        key: { bindingHash: 1 },
        name: "habi_sso_owner_handoff_binding_unique",
        unique: true,
        partialFilterExpression: { bindingHash: { $type: "string" } },
      },
      {
        key: { expiresAt: 1 },
        name: "habi_sso_owner_handoff_expiry_ttl",
        expireAfterSeconds: 0,
      },
    ],
  },
];

export const migration = Object.freeze({
  id: "010-sso-browser-owner-sessions",
  sourceFile: new URL("./010-sso-browser-owner-sessions.mjs", import.meta.url),
  async up(db) {
    await authTransactions.up(db);
    for (const { name, indexes } of DEFINITIONS) {
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
      await db.collection(name).createIndexes(indexes);
    }
  },
});
