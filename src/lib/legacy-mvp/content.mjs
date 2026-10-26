import "server-only";
import { readFile } from "node:fs/promises";

let seedPromise;

function missingCatalogKeys(seed, current, prefix = "") {
  const missing = {};
  for (const [key, value] of Object.entries(seed)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (current?.[key] === undefined) {
      missing[path] = value;
    } else if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current[key] &&
      typeof current[key] === "object" &&
      !Array.isArray(current[key])
    ) {
      Object.assign(missing, missingCatalogKeys(value, current[key], path));
    }
  }
  return missing;
}

async function readSeed() {
  seedPromise ??= readFile(
    new URL("./content-seed.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);
  return seedPromise;
}

export async function readLegacyCatalog(db) {
  const seed = await readSeed();
  const collection = db.collection("habi_content");
  await collection.updateOne(
    { _id: "active" },
    { $setOnInsert: { ...seed, createdAt: new Date() } },
    { upsert: true },
  );

  let document = await collection.findOne(
    { _id: "active" },
    { projection: { _id: 0, createdAt: 0 } },
  );
  const missing = {
    ...missingCatalogKeys(seed.messages, document?.messages, "messages"),
    ...missingCatalogKeys(seed.data, document?.data, "data"),
  };
  if (Object.keys(missing).length > 0) {
    await collection.updateOne({ _id: "active" }, { $set: missing });
    document = await collection.findOne(
      { _id: "active" },
      { projection: { _id: 0, createdAt: 0 } },
    );
  }
  return document;
}
