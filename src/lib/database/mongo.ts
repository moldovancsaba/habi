import "server-only";

import { MongoClient, ServerApiVersion, type Db } from "mongodb";
import { readAtlasConfig } from "./config.mjs";

type MongoGlobal = typeof globalThis & {
  _habiMongoClientPromise?: Promise<MongoClient>;
};

const mongoGlobal = globalThis as MongoGlobal;

function getClientPromise(): Promise<MongoClient> {
  const { uri } = readAtlasConfig(process.env);
  if (mongoGlobal._habiMongoClientPromise) {
    return mongoGlobal._habiMongoClientPromise;
  }

  const client = new MongoClient(uri, {
    appName: "habi-web",
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    maxConnecting: 2,
    connectTimeoutMS: 5_000,
    serverSelectionTimeoutMS: 5_000,
    waitQueueTimeoutMS: 3_000,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  const promise = client.connect().catch(async () => {
    if (mongoGlobal._habiMongoClientPromise === promise) {
      delete mongoGlobal._habiMongoClientPromise;
    }
    await client.close().catch(() => undefined);
    throw new Error("DEPENDENCY_UNAVAILABLE");
  });
  mongoGlobal._habiMongoClientPromise = promise;
  return promise;
}

export async function getDatabase(): Promise<Db> {
  const { database } = readAtlasConfig(process.env);
  const client = await getClientPromise();
  return client.db(database);
}

export async function checkDatabaseConnection(): Promise<void> {
  const database = await getDatabase();
  await database.command({ ping: 1 });
}
