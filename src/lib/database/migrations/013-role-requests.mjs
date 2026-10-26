import { mongoValidatorForCollection } from "../contract-validation.mjs";
import { migration as ssoBrowserOwnerSessions } from "./010-sso-browser-owner-sessions.mjs";

export const migration = Object.freeze({
  id: "013-role-requests",
  sourceFile: new URL("./013-role-requests.mjs", import.meta.url),
  async up(db) {
    await ssoBrowserOwnerSessions.up(db);
    if (
      await db
        .listCollections({ name: "habi_role_invitations" }, { nameOnly: true })
        .hasNext()
    ) {
      await db.command({
        collMod: "habi_role_invitations",
        validator: mongoValidatorForCollection("habi_role_invitations"),
        validationLevel: "strict",
        validationAction: "error",
      });
    }
    const name = "habi_role_requests";
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
      { key: { id: 1 }, name: "habi_role_request_id_unique", unique: true },
      {
        key: { tenantId: 1, actorId: 1, role: 1, status: 1 },
        name: "habi_role_request_pending_unique",
        unique: true,
        partialFilterExpression: { status: "pending" },
      },
      {
        key: { tenantId: 1, status: 1, createdAt: 1 },
        name: "habi_role_request_admin_queue",
      },
    ]);
  },
});
