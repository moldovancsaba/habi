// stdin: {question, role, sources, now, previous}; stdout: {guidance, conversation, understanding}. Uses the repo's own functions.
import { coachQuestionGuidance, trainingGuidanceSource } from "../../../src/lib/workflows/coach-guidance.mjs";
import { coachConversation } from "../../../src/lib/workflows/coach-conversation.mjs";
import { messageUnderstanding } from "../../../src/lib/workflows/coach-messages.mjs";
let raw = ""; for await (const c of process.stdin) raw += c;
const { question, role, sources, now, previous, sourceRefs } = JSON.parse(raw);
const guidance = coachQuestionGuidance({ question, role, sources, now: new Date(now) });
const conversation = coachConversation({ question, previous, sources, sourceRefs, questions: guidance?.questions ?? [] });
console.log(JSON.stringify({ guidance, conversation, understanding: messageUnderstanding(question, role), guidanceSource: trainingGuidanceSource() }));
