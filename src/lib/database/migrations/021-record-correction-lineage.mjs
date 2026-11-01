import { mongoValidatorForCollection } from "../contract-validation.mjs";
export const migration = Object.freeze({
  id: "021-record-correction-lineage",
  sourceFile: new URL("./021-record-correction-lineage.mjs", import.meta.url),
  async up(db) {
    await db.command({
      collMod: "records",
      validator: mongoValidatorForCollection("records"),
      validationLevel: "strict",
      validationAction: "error",
    });
    await db.collection("records").createIndex(
      { tenantId: 1, playerId: 1, supersedesId: 1 },
      {
        name: "record_single_correction_successor",
        unique: true,
        partialFilterExpression: { supersedesId: { $type: "string" } },
      },
    );
  },
});
