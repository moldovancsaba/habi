# Coach messages, feedback and conversational memory

Every submitted message is stored as its original text before a generation job is queued. Questions, reports, preferences, goals, corrections and response feedback share this durable history. They remain private to the tenant, player, author and viewing role that submitted them.

The message history is available from the AI coach's **Üzenetelőzmények** tab. It survives reopening and new conversations, supports pagination, shows attributed notes and lets the author exclude a message from future context without erasing the audit record. The profile view continues to support explicit corrections and recommendation feedback.

## Understanding and retrieval

`coach-messages.mjs` conservatively indexes exact clauses. A question is not a fact; hypothetical statements remain hypotheses. Author response preferences are separate from player reports. Original wording and negation are retained. “Ma” and “tegnap” resolve relative to the message's Budapest calendar date; unspecified times stay unspecified. This is conservative indexing, not model training or a claim that an arbitrary message has been semantically understood.

An explicit correction can retire a uniquely identifiable private note. Ambiguous corrections do not silently overwrite records. Audit sources remain readable; retired and excluded sources cannot be used as active profile evidence. Queued jobs are checked again before generation and completion. Earlier assistant answers that depend on excluded messages are also withheld from later model context.

## Conversational generation

Version 2 worker context carries the latest original message, real user/assistant role history, attributed recent notes and author preferences. It bypasses the earlier fixed check-in rewrite and conversational answer variants. The chatbot API returns ordinary text rather than a mandatory answer template. The interface displays that text directly with related history available separately.

Repeated, structurally invalid and selected unsupported outputs are retried once, then fail honestly with the original message preserved. These checks cannot establish factual or language quality. No canned completed answer hides a failed generation. Service maintenance has its own visible waiting state and does not consume the normal retry budget.

`HG_SHARED_AI_MODEL=auto` continues to follow the service's model selection. Optional `HG_SHARED_AI_DIALOGUE_MODEL` selects an explicitly permitted existing model; no model is hardcoded or installed by Habi. Synthetic live evaluations set `HG_SHARED_AI_REQUEST_PURPOSE=test`; production traffic leaves it unset. Never log real prompts, replies or credentials during diagnostics.

## Migration and compatibility

Migration 019 additively updates validators for natural replies, message understanding, exclusion events and maintenance deferrals. Original messages are not rewritten or copied to a new collection. Existing claim-based answers and historical source identifiers remain readable. API contract version is 2.5.0.

## Verification on 2026-10-28

- Application suite: 229 passed, including durable updates, correction specificity, exclusion, actor/role isolation and maintenance retry accounting.
- Worker suite: 56 passed, including actual role ordering, raw conversational output, unchanged claim validation, explicit test-purpose headers and preservation of automatic model selection.
- Browser acceptance passed: update, correction, feedback, visible original clauses, preserved unrelated profile details, exclusion, reload, a new conversation retaining preferences, excluded messages absent from the actual provider request, and parent denial of coach history. It uses a synthetic provider; its scripted replies are fixtures, not evidence of conversational quality. The check also found and fixed initial history loading and a composer race during new-chat creation.
- Lint, TypeScript checking, production build and whitespace checks passed.
- Live Hungarian evaluations of the existing small models failed: repeated or malformed Hungarian, coach/player confusion and invented explanations. A further short Hungarian system prompt still produced unsupported text. The user requested keeping the current models; no request for an upgrade was sent to another task.

**Release gate remains open:** these changes are not deployed while live Hungarian conversation quality fails. Local fixtures and automated checks must not be represented as an end-to-end language-quality pass. Re-evaluate genuine multi-turn exchanges against the existing service before enabling this generation path in production. Include updates, corrections, response feedback, repeated questions, reload/new conversation, exclusion and private-role access.

## Continued implementation: context fidelity and reproducible evaluation

- Source selection now keeps author preferences separate from player reports, retains complete attributed records, and retains complete recent conversation turns. It never clips half a clause or sends an orphan assistant answer. Large records that cannot fit are omitted entirely. Previous questions can remain attributed message sources without becoming player facts.
- Related source links now include only records actually included in the model request, plus the current message. Excluded, retired, unpinned and oversized omitted records are not presented as support. Numeric checks likewise cannot use dropped records as authorization.
- Automatic model selection now uses the selected model's discovered context window when budgeting the request. It still follows the service ranking; no production override was introduced.
- Fragmentary responses are retried and rejected instead of being saved as completed support. This is a structural check, not a semantic-quality guarantee.
- `worker/evaluations/coach_hungarian.py` is a repeatable opt-in synthetic live evaluation covering a question, new wellbeing/meal information, a meal correction, shorter-response feedback and a repeated question. It always marks gateway traffic as test. It prints synthetic transcripts for human review and never labels successful API execution as language-quality approval.
- New live evidence with the current models remains below the release requirement: the automatic model produced incomplete fragments; the explicit existing Qwen model produced malformed Hungarian and misrepresented the sleep report in its initial answer. The context and citation fixes do not establish useful support quality. The production model configuration remains unchanged.

Run the synthetic evaluation from the repository root with the existing scoped worker environment loaded:

```sh
PYTHONPATH=worker worker/.venv/bin/python worker/evaluations/coach_hungarian.py
```

Use `--model` only for an existing permitted model. Review the transcript for role accuracy, current updates, corrections, unsupported conclusions, repetition and useful follow-up. The harness uses synthetic memory transitions; browser/API/database acceptance is separately required for persistence.

Continuation verification: 64 worker tests passed and the synthetic browser/API/worker flow passed again, including correction specificity, original history, exclusion, reload, cross-chat preferences and role isolation. Near-duplicate checking now compares words and shared phrases to catch a recycled long answer with only a few nouns changed. The additional live Qwen evaluation repeated that pattern and failed on response feedback; this remains a failed language-quality evaluation, not a production approval. `--role player`, `--role parent` and `--role coach` select role-specific synthetic evaluation messages.

## New Hungarian route check · 2026-10-28

Authenticated live discovery now exposes `text_chat_hu` to Habi's existing key. Its independent automatic selection is `hf.co/unsloth/Qwen3-4B-Instruct-2507-GGUF:Q3_K_M`, digest `a4981cf368a06e6ad0d6e1c3117c468297e613b1fae864f50be6bb88e1b66eeb`. The English `text_chat` default is unchanged. Habi's current shared client still hardcodes `text_chat`; a model pin on that task cannot access the Hungarian-only model.

The service marks the new job experimental and `quality_gate_passed: false`. Its published result is 17/24 structured cases and 3/6 usable chat replies; this is service evidence, not Habi acceptance. The tested runtime is context 1024/batch 8, output default 128 and maximum 192 tokens. Serialized UTF-8 message size is restricted to `min(1000, 1024 - output_tokens - 256)` bytes. With a 128-token answer, messages must fit 640 bytes including role framing. The existing full Habi system prompt and conversation context cannot simply be forwarded to this route.

Five small synthetic contextual samples were sent directly through `text_chat_hu`, `model: auto`, temperature 0 and 128 output tokens using Habi's own key and `X-Request-Purpose: test`. All jobs returned responses and were explicitly deleted after consumption. This verifies API access, not the complete Habi browser/database flow or a long multi-turn conversation.

The first pass failed Habi's support expectations: the initial answer treated yesterday's check-in as a current condition, invented an explanation and ended with `finish_reason: length`; the update answer claimed to be Csaba's coach; the corrected meal was recognized but the response was unnatural; the repeated question produced invented explanations about why dinner was missed and another length-truncated answer. These results do not justify enabling unattended coaching or changing production settings.

A focused second pass added explicit assistant/coach separation, date preservation and a two-sentence limit. Both responses finished normally, but neither establishes readiness: the first remained awkward and treated the dated report as a current assessment; the update reply invented the date “2024. március 15.” and asserted an unsupported causal connection. Seven samples were checked in total (five initial and two focused), all synthetic and deleted from the service after consumption. No production route, model setting or backend policy was changed.

The checks are reproducible with `worker/evaluations/hungarian_route.py` (or `--focused`) using the scoped worker environment. The probe fixes the task to `text_chat_hu`, follows its automatic model selection, checks the documented UTF-8 byte budget, sends the test-purpose header, polls terminal status, flags truncation/timeouts as incomplete execution and deletes consumed jobs. A complete response always remains subject to human quality review.
