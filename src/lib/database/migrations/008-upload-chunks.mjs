export const migration = Object.freeze({
  id: "008-upload-chunks",
  sourceFile: new URL("./008-upload-chunks.mjs", import.meta.url),
  async up(db) {
    const name = "upload_chunks";
    const validator = {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "tenantId",
          "uploadId",
          "index",
          "size",
          "sha256",
          "bytes",
          "expiresAt",
        ],
        additionalProperties: false,
        properties: {
          _id: { bsonType: "objectId" },
          tenantId: { bsonType: "string" },
          uploadId: { bsonType: "string" },
          index: { bsonType: "int", minimum: 0, maximum: 9 },
          size: { bsonType: "int", minimum: 1, maximum: 1048576 },
          sha256: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
          bytes: { bsonType: "binData" },
          expiresAt: { bsonType: "date" },
        },
      },
    };
    if (!(await db.listCollections({ name }, { nameOnly: true }).hasNext()))
      await db.createCollection(name, {
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    else
      await db.command({
        collMod: name,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    await db.collection(name).createIndexes([
      {
        key: { tenantId: 1, uploadId: 1, index: 1 },
        name: "upload_chunk_unique",
        unique: true,
      },
      {
        key: { expiresAt: 1 },
        name: "upload_chunk_expiry",
        expireAfterSeconds: 0,
      },
    ]);
  },
});
