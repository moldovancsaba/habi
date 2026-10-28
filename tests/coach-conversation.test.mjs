import assert from "node:assert/strict";
import test from "node:test";
import { coachConversation } from "../src/lib/workflows/coach-conversation.mjs";
const ref = { id: "checkin", revision: 1, span: null };
const sources = [{ ...ref, kind: "checkin_results" }];
const question = "Menjek ma edzésre?";
const questions = ["Hogy vagy ma?", "Mi a mai program?"];
const first = {
  question,
  sourceRefs: [ref],
  answer: { clarifyingQuestions: questions },
};
const reply = (previous, extra = {}) =>
  coachConversation({
    question,
    previous,
    sources,
    sourceRefs: [ref],
    questions,
    ...extra,
  });
test("first question gets a full answer; repetition continues without inventing new facts", () => {
  assert.equal(reply([]), null);
  const next = reply([first], { question: "menjek ma EDZÉSRE!!!" });
  assert.equal(next.suppressRepeatedAnswer, true);
  assert.equal(next.questions.length, 1);
  assert.equal(next.questions[0], questions[0]);
  assert.match(next.lead, /ugyanazok a források/);
});
test("third request advances to another unresolved point rather than the same script", () => {
  const second = { ...first, conversation: reply([first]) };
  const third = reply([first, second]);
  assert.notEqual(third.lead, second.conversation.lead);
  assert.notDeepEqual(third.questions, second.conversation.questions);
  assert.equal(third.questions[0], questions[1]);
  const fourth = reply([first, second, { ...first, conversation: third }]);
  assert.notDeepEqual(fourth.questions, third.questions);
});
test("new source revisions trigger a fresh answer, while generated profile snapshots do not", () => {
  const fresh = { ...ref, revision: 2, kind: "checkin_results" };
  assert.equal(
    reply([first], { sources: [fresh], sourceRefs: [fresh] })
      .suppressRepeatedAnswer,
    false,
  );
  const profile = { id: "profile-new", revision: 1, kind: "derived_profile" };
  assert.equal(
    reply([first], {
      sources: [...sources, profile],
      sourceRefs: [ref, profile],
    }).suppressRepeatedAnswer,
    true,
  );
});
test("applies to arbitrary topics and leaves new user information for the model", () => {
  const other = { ...first, question: "Mit mutat az alvás?" };
  assert.ok(reply([other], { question: "Mit mutat az alvas?" }));
  assert.equal(
    reply([first], { question: "Ma rosszul aludtam és fáj a lábam." }),
    null,
  );
  assert.equal(reply([first], { question: "Ne menjek ma edzésre?" }), null);
});

test("intervening user replies are new conversation context even without new saved records", () => {
  const followup = {
    ...first,
    question: "Ma fáradt vagyok, de nem fáj semmim.",
  };
  const result = reply([first, followup]);
  assert.equal(result.suppressRepeatedAnswer, false);
  assert.equal(result.hasNewUserContext, true);
});

test("duplicate model output under a different question is not reposted as a fresh answer", () => {
  const answer = {
    claims: [{ kind: "direct", text: "Hogyan aludtál? Keveset" }],
  };
  const previous = [{ ...first, answer }];
  assert.equal(
    reply(previous, { question: "És a figyelem?", answer })
      .suppressRepeatedAnswer,
    true,
  );
  const fresh = { ...ref, revision: 2, kind: "checkin_results" };
  assert.equal(
    reply(previous, {
      question: "És ma?",
      answer,
      sources: [fresh],
      sourceRefs: [fresh],
    }),
    null,
  );
});
