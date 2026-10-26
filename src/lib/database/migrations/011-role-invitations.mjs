import { mongoValidatorForCollection } from "../contract-validation.mjs";
import { migration as ssoBrowserOwnerSessions } from "./010-sso-browser-owner-sessions.mjs";

const DEFINITIONS = [
  {
    name: "habi_role_invitations",
    indexes: [
      { key: { id: 1 }, name: "habi_role_invitation_id_unique", unique: true },
      {
        key: { tokenHash: 1 },
        name: "habi_role_invitation_token_unique",
        unique: true,
      },
      {
        key: { expiresAt: 1 },
        name: "habi_role_invitation_expiry_ttl",
        expireAfterSeconds: 0,
      },
    ],
  },
];

export const migration = Object.freeze({
  id: "011-role-invitations",
  sourceFile: new URL("./011-role-invitations.mjs", import.meta.url),
  async up(db) {
    // Reapply the versioned owner-session validator to allow the verified SSO
    // identity and permission snapshot used by the invite claim/admin gates.
    await ssoBrowserOwnerSessions.up(db);
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
