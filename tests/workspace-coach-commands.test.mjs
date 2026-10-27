import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile(
  "workspace.tsx",
  await readFile(new URL("../src/app/workspace.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

// Exercise the actual UI handlers with synthetic state and HTTP responses.
function command(name, { role = "coach", checkin = null, busy = false } = {}) {
  let handler;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      handler = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(handler, `Missing workspace handler: ${name}`);
  const requests = [];
  const feedback = [];
  const context = {
    active: { activeRole: role, actorId: "coach-1", csrfToken: "csrf" },
    playerId: "player-1",
    question: "Mire figyeljünk?",
    planDraft: "Gyakorlás",
    planOwnerId: "",
    planWhy: "",
    planDue: "",
    planStop: "",
    questionSource: checkin,
    busy,
    crypto: { randomUUID },
    setBusy() {},
    setNotice() {},
    setQuestionFeedback(value) {
      feedback.push(value);
    },
    setQuestionJob() {},
    setSubmittedQuestion() {},
    setQuestionAnswer() {},
    setQuestionStatusUnavailable() {},
    setQuestion() {},
    setPlans() {},
    setPlanDraft() {},
    messageFor: (error) => error.message,
    async fetch(url, options) {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ jobId: "job-1" }) };
    },
  };
  const { outputText } = ts.transpileModule(handler.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  return {
    requests,
    feedback,
    run: runInNewContext(`${outputText}\n${name}`, context),
  };
}

for (const checkin of [null, { id: "checkin-1", revision: 2 }]) {
  test(`coach question requests player-wide context ${checkin ? "with" : "without"} a check-in`, async () => {
    const action = command("askQuestion", { checkin });
    await action.run();
    assert.equal(action.requests.length, 1);
    assert.deepEqual(action.requests[0].body.sourceRefs, []);
    assert.equal(action.feedback.at(-1).kind, "success");
  });
}

test("parent question still requires an explicit check-in source", async () => {
  const missing = command("askQuestion", { role: "parent" });
  await missing.run();
  assert.equal(missing.requests.length, 0);
  assert.equal(missing.feedback.at(-1).kind, "error");

  const sourced = command("askQuestion", {
    role: "parent",
    checkin: { id: "checkin-1", revision: 2 },
  });
  await sourced.run();
  assert.deepEqual(sourced.requests[0].body.sourceRefs, [
    { id: "checkin-1", revision: 2, span: null },
  ]);
});

test("coach plan retains its required revision-pinned source", async () => {
  const action = command("createSharedPlan", {
    checkin: { id: "checkin-1", revision: 2 },
  });
  await action.run();
  assert.equal(action.requests.length, 1);
  assert.deepEqual(action.requests[0].body.sourceRefs, [
    { id: "checkin-1", revision: 2, span: null },
  ]);
});

test("coach plan without a source and a busy question do not submit", async () => {
  const plan = command("createSharedPlan");
  await plan.run();
  assert.equal(plan.requests.length, 0);
  const question = command("askQuestion", {
    checkin: { id: "checkin-1", revision: 2 },
    busy: true,
  });
  await question.run();
  assert.equal(question.requests.length, 0);
});

test("shared product commands fence revisions and reuse an uncertain write key only until success", async () => {
  const requests = [];
  let fail = true;
  const context = {
    exports: {},
    crypto: { randomUUID },
    fetch: async (_path, options) => {
      requests.push(options);
      if (fail) {
        fail = false;
        throw new Error("connection interrupted");
      }
      return { ok: true, json: async () => ({ saved: true }) };
    },
  };
  const compiled = ts.transpileModule(
    await readFile(
      new URL("../src/app/product-request.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(compiled, context);
  const write = () =>
    context.exports.productRequest(
      "/api/v1/plans/test/pause",
      "csrf",
      { expectedRevision: 4 },
      "POST",
    );
  await assert.rejects(write, /connection interrupted/);
  await write();
  await write();
  assert.equal(requests[0].headers["If-Match"], "4");
  assert.equal(requests[0].headers["x-habi-csrf"], "csrf");
  assert.equal(
    requests[0].headers["Idempotency-Key"],
    requests[1].headers["Idempotency-Key"],
  );
  assert.notEqual(
    requests[1].headers["Idempotency-Key"],
    requests[2].headers["Idempotency-Key"],
  );
  await context.exports.productRequest(
    "/api/v1/plans/test",
    "csrf",
    undefined,
    "GET",
  );
  assert.equal(requests[3].headers["Idempotency-Key"], undefined);
  assert.equal(requests[3].headers["x-habi-csrf"], undefined);
});
