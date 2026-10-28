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
