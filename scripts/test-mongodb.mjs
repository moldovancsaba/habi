import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";

const host = "127.0.0.1";
const port = Number(process.env.HABI_TEST_MONGODB_PORT ?? 27099);
const replicaSet = process.env.HABI_TEST_MONGODB_REPLICA_SET ?? "habiTestRs";
const dbPath = resolve(
  process.env.HABI_TEST_MONGODB_DATA_DIR ?? "/tmp/habi-local-test-mongodb",
);
const uri = `mongodb://${host}:${port}/?replicaSet=${encodeURIComponent(replicaSet)}`;

async function portIsFree() {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.listen(port, host, () => server.close(() => resolvePromise(true)));
  });
}

async function connectDirect() {
  const client = new MongoClient(
    `mongodb://${host}:${port}/?directConnection=true`,
    {
      appName: "habi-local-test-bootstrap",
      connectTimeoutMS: 1_000,
      serverSelectionTimeoutMS: 1_000,
    },
  );
  await client.connect();
  return client;
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await connectDirect();
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }
  throw lastError ?? new Error("MONGO_START_TIMEOUT");
}

async function start() {
  const free = await portIsFree();
  if (!free) {
    const client = await connectDirect().catch(() => null);
    if (!client) throw new Error("TEST_MONGODB_PORT_IN_USE");
    try {
      const hello = await client.db("admin").command({ hello: 1 });
      if (hello.setName !== replicaSet)
        throw new Error("TEST_MONGODB_DIFFERENT_REPLICA_SET");
      process.stdout.write(`Already running: ${uri}\n`);
      return;
    } finally {
      await client.close();
    }
  }
  await mkdir(dbPath, { recursive: true });
  const launched = spawnSync(
    "mongod",
    [
      "--replSet",
      replicaSet,
      "--port",
      String(port),
      "--dbpath",
      dbPath,
      "--bind_ip",
      host,
      "--fork",
      "--logpath",
      resolve(dbPath, "mongod.log"),
    ],
    { encoding: "utf8" },
  );
  if (launched.status !== 0) throw new Error("TEST_MONGODB_START_FAILED");
  const client = await waitForServer();
  try {
    const hello = await client.db("admin").command({ hello: 1 });
    if (hello.setName !== replicaSet) {
      await client
        .db("admin")
        .command({
          replSetInitiate: {
            _id: replicaSet,
            members: [{ _id: 0, host: `${host}:${port}` }],
          },
        });
    }
  } finally {
    await client.close();
  }

  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = new MongoClient(uri, {
      appName: "habi-local-test-bootstrap",
      serverSelectionTimeoutMS: 500,
    });
    try {
      await candidate.connect();
      const hello = await candidate.db("admin").command({ hello: 1 });
      ready = hello.isWritablePrimary === true;
    } catch {
      ready = false;
    } finally {
      await candidate.close().catch(() => undefined);
    }
    if (ready) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  if (!ready) throw new Error("TEST_MONGODB_PRIMARY_TIMEOUT");
  process.stdout.write(`Started isolated synthetic test replica: ${uri}\n`);
}

async function stop() {
  const client = await connectDirect().catch(() => null);
  if (!client) {
    process.stdout.write("Test MongoDB is not running.\n");
    return;
  }
  try {
    const hello = await client.db("admin").command({ hello: 1 });
    if (hello.setName !== replicaSet)
      throw new Error("TEST_MONGODB_DIFFERENT_REPLICA_SET");
    await client
      .db("admin")
      .command({ shutdown: 1, force: true })
      .catch(() => undefined);
  } finally {
    await client.close();
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await portIsFree()) {
      process.stdout.write(
        "Stopped the isolated synthetic test replica. Database files remain in the configured temporary directory.\n",
      );
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("TEST_MONGODB_STOP_FAILED");
}

const command = process.argv[2];
if (command === "start") await start();
else if (command === "stop") await stop();
else throw new Error("Usage: node scripts/test-mongodb.mjs start|stop");
