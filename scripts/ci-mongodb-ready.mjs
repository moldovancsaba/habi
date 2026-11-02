import { MongoClient } from "mongodb";

// CI-only bootstrap for the ephemeral, loopback-only Mongo started by the workflow.
// No production connection string or external database can be selected here.
if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true")
  throw new Error("GITHUB_CI_ONLY");
const client = new MongoClient("mongodb://127.0.0.1:27099/?directConnection=true", {
  serverSelectionTimeoutMS: 500,
  connectTimeoutMS: 500,
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await client.db("admin").command({ ping: 1 });
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw new Error("CI_MONGO_START_TIMEOUT");
  await client.db("admin").command({
    replSetInitiate: { _id: "habiTestRs", members: [{ _id: 0, host: "127.0.0.1:27099" }] },
  });
  ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await client.db("admin").command({ hello: 1 })).isWritablePrimary) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("CI_MONGO_PRIMARY_TIMEOUT");
  console.log("Ephemeral localhost replica set ready.");
} finally {
  await client.close();
}
