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
