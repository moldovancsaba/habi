export async function findTenantDocument(collection, tenantId, id) {
  if (!tenantId || !id) throw new Error("TENANT_SCOPE_REQUIRED");
  return collection.findOne({ tenantId, id });
}

export function listTenantDocuments(
  collection,
  tenantId,
  filter = {},
  options = {},
) {
  if (!tenantId) throw new Error("TENANT_SCOPE_REQUIRED");
  if (Object.hasOwn(filter, "tenantId") && filter.tenantId !== tenantId) {
    throw new Error("TENANT_SCOPE_MISMATCH");
  }
  return collection.find({ ...filter, tenantId }, options);
}

export async function compareAndSwapDocument({
  collection,
  tenantId,
  id,
  expectedRevision,
  changes,
  now = new Date(),
}) {
  if (!tenantId || !id) throw new Error("TENANT_SCOPE_REQUIRED");
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new Error("CHANGES_INVALID");
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("REVISION_INVALID");
  }
  for (const immutableField of [
    "_id",
    "id",
    "tenantId",
    "schemaVersion",
    "revision",
    "createdAt",
  ]) {
    if (Object.hasOwn(changes, immutableField))
      throw new Error("IMMUTABLE_FIELD");
  }

  const result = await collection.findOneAndUpdate(
    { tenantId, id, revision: expectedRevision },
    {
      $set: {
        ...changes,
        revision: expectedRevision + 1,
        updatedAt: now.toISOString(),
      },
    },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("REVISION_CONFLICT");
  return result;
}
