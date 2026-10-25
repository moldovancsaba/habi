import { indexesForCollection } from "../migration-schema.mjs";

export const migration = Object.freeze({
  id: "007-publication-uniqueness",
  sourceFile: new URL("./007-publication-uniqueness.mjs", import.meta.url),
  async up(db) {
    await db
      .collection("publications")
      .createIndexes(indexesForCollection("publications"));
  },
});
