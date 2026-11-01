# Habi delivery plan — 1 November 2026

Baseline: `673d6c7`. Scope: [missing-functions audit](missing-functions-audit-2026-11-01.md), F01–F13 and source experiences S01–S03. This document is a proposed execution plan, not implementation or approval to activate previously deferred scope.

## Intended outcome

A player or parent records information, asks about a specific source, receives useful support, requests coach help when needed, agrees a sourced action, and later reports its outcome. Coaches can find and handle all recorded activity for their players. Approved professional knowledge is genuinely reused. The source guides and report experiences have visible, navigable product equivalents.

Deliver this as seven small releases. Each release includes UI, API, storage, history integration and verification for its own flow; a backend-only milestone is not a delivered feature. Begin source-content mapping and AI evaluation during release 0, so the most visible product gaps are not postponed until the end.

## Release 0 — Establish the delivery checklist and acceptance cases

**Tickets**

- D00.1: Turn every F/S audit item into a tracked delivery row: source reference, user journey, visible entry point, dependencies, acceptance case, release commit and evidence. Begin at missing/partial; never inherit “done” from the earlier inventory.
- D00.2: Resolve all 22 API coverage mismatches explicitly: implement required commands, document a supported replacement, or deprecate an obsolete operation. Add a route/method coverage check to prevent new drift. Do not add empty endpoints just to satisfy the check.
- D00.3: Reopen the original available guide/report attachments and inventory their sections, templates, drills and examples against product content. Record unavailable source files as unavailable, without inventing their content. Establish which content/version is authoritative and its existing review status.
- D00.4: Prepare synthetic acceptance cases with one player, two parents, two coaches and another family/tenant. Include a disputed answer, correction, interrupted assessment, withdrawn source, pending job and more than 100 knowledge entries. Add same-timestamp timeline pagination coverage.
- D00.5: Prepare a Hungarian conversation rubric and unseen test threads. Separate facts, naturalness, usefulness, repetition, role/date accuracy and persistence. Keep the current Hungarian route and models as the baseline.

**Exit evidence:** every finding has an acceptance case; contract replacements are identified; the original-content mapping shows exactly which sections are present, missing or unavailable. This release closes tracking gaps, not the feature findings themselves.

## Release 1 — Preserve and correct what users submit

**Covers F05, F06, F09; enables F04/F07/F13.**

- D01.1: Persist coach assessment attempts and explicitly submitted answers. Implement start, answer, complete and interrupt commands with revision/idempotency checks. Final completion produces the existing readable assessment record. Preserve interrupted attempts as history; they cannot resume under the current specification. Keep existing final-only records readable and do not fabricate attempts for them.
- D01.2: Add “Correct this record” for authorised journal/observation records. Create a linked replacement, preserve the original and authorship, show original/current views, and update eligible AI context and profile derivation. Extend the existing lineage model rather than silently editing saved text.
- D01.3: Add cancel on pending AI turns/jobs. Persist cancellation, release or invalidate worker ownership safely, and prevent an in-flight result from reviving cancelled work. Keep the original question visible.
- D01.4: Add timeline entries and contextual source links for all three workflows. Ensure the coach sees each recorded step with its actual author and state.

**Acceptance:** save two assessment answers, lose the browser session, and verify those answers and the interruption survive; complete a new attempt. Correct an observation and confirm old text remains inspectable but is not treated as the current fact. Cancel queued and processing jobs and reload; no later answer becomes ready. Retrying any command creates one logical action.

## Release 2 — Close the human-support loop

**Covers F04, F07, F12 and the plan-facing part of F13. Depends on release 1 lineage.**

- D02.1: Add “Ask a coach for help” to an exact answer/source. Create a handoff linked to that revision and its shared human thread. Add an open-request queue; either eligible coach may acknowledge/respond. Reading the transcript remains distinct from acknowledging a request.
- D02.2: Add answer-specific readability/usefulness/preference feedback and claim disputes. Preserve exact answer/revision/claim references. A disputed claim opens review with rationale; a professional correction enters the correction/review path. Keep recommendation feedback separate.
- D02.3: Convert a coach safety badge into a handleable in-app case: original message, acknowledgement, recorded action, follow-up and resolution history. Define whether a coach takes responsibility without creating an exclusive right to see or help. Preserve the existing authored player responses. Do not claim push/email or continuous monitoring.
- D02.4: Link handoff → human discussion → proposed action → acceptance → follow-up. Mark plans whose supporting evidence is invalidated as requiring review, preserve accepted-action history, and provide a reasoned reassessment flow. Do not silently cancel commitments.

**Acceptance:** player/parent asks for help; coach A acknowledges; coach B contributes; a plan is accepted and a parent/player adds follow-up. Every link opens the correct original revision. A claim dispute reaches review. A safety case can be acknowledged and followed up without rewriting the message. Withdrawing a source produces a visible plan-review requirement.

## Release 3 — Make professional knowledge and guides usable

**Covers F02, F10, S01 and the knowledge part of F13. Depends on release 0 source mapping and release 1 lineage.**

- D03.1: Add immutable approved knowledge versions, source/version/span provenance, applicability, exclusions, review rationale and activation. A candidate status change alone is not activation.
- D03.2: Add authorised retrieval of active knowledge versions to relevant AI requests. Pin versions actually supplied and used. Withdrawal removes a version from new retrieval and propagates to dependent answers/plans through the shared invalidation mechanism.
- D03.3: Add server-side search and cursor pagination through the entire knowledge library; include draft/review/active/withdrawn states appropriate to the role.
- D03.4: Build a coach-guide index from the actual source map: domain → subattribute → definition → observation cues → questions → drills/short session → limits → source. Reuse reviewed existing content, mark unavailable/review-pending sections explicitly, and expose contextual AI and source links.
- D03.5: Give player journeys clear entry cards for goals, routines, guided support, reflections and preparation. Preserve existing data and behaviour while making them findable; do not build duplicate versions of these tools.

**Acceptance:** approve a new eligible knowledge item, retrieve its exact active version in a relevant answer, withdraw it and verify it is excluded with dependants flagged. Find an item older than the newest 100. Select any mapped guide section and see its content/source/status; no catalogue-count substitution for missing guide sections. Test finding the existing player tools on mobile.

## Release 4 — Deliver useful contextual conversation and report explanation

**Covers F01, F11 and the agreed parts of S02. Depends on releases 1–3 for reliable context, useful content and correction lineage. Evaluation starts in release 0.**

- D04.1: Pass the exact displayed context: selected day, period, metric, daily/all-session mode and visible record revisions. Extend this principle to report page/field, guide section, plan/action and assessment answer. Date and source attribution must survive context packing.
- D04.2: Define a conversation response plan from current intent, what changed, relevant verified facts, prior unanswered questions, preferences and useful reviewed content. Use the existing model for bounded language generation where it passes evaluation. Protect factual content and authored safety responses. Randomly rotating templates is not a fix for repetition.
- D04.3: For repeated questions, detect whether the user wants clarification, reassurance, a correction or another angle. Acknowledge the repeat and add useful clarification or a focused question. Do not merely restate the five check-in values.
- D04.4: Ground suggestions in eligible guide/practice content and actual user outcomes, with source, uncertainty, action choice and later feedback. Preserve the distinction between general optional practices and accepted individual plans.
- D04.5: Build the report journey: original PDF/page, reviewed field, plain-language glossary, available interpretation, uncertainty, related observation/drill and optional handoff. Provide the reviewed entry/import and printable/exportable summary paths identified in the source map. Do not fabricate scoring, position rankings, benchmarks or norms that the source cannot justify.
- D04.6: Measure dropped context and latency. The present 608-byte Hungarian prompt budget can exclude essential history; select a compact, faithful response plan and verify the actual payload. If the existing model still fails naturalness/usefulness, record the failing cases and the limit honestly. A model change or context-capacity expansion needs its own evaluated provider capability, not a delivery claim based on prompting alone.

**Acceptance:** use held-out multi-turn threads covering questions, updates, breakfast→dinner correction, shorter-response preference, repeated questions, conflicting accounts, selected chart days and report terms. Answers must use the right person/date, respect corrections and never invent source facts. Proposed quality gate: zero critical factual/access/safety errors; at least 90% of evaluated turns judged useful, understandable and contextually responsive by the designated Hungarian reviewer; all repeated-question cases show an appropriate contextual reaction. These are proposed thresholds, not current results. API success and regex flags alone cannot close F01.

## Release 5 — Complete data lifecycle and the external knowledge workflow

**Covers F08 and F03. Data-lifecycle design starts in release 0; external knowledge depends on release 3.**

- D05.1: Add data-request entry and status for an authorised user: copy, rectification, restriction and deletion. Implement identity/representation checks, allowed scope and human handling where scope is ambiguous. Add scoped export, job/context restrictions, source/derivative deletion handling and recorded completion. Preserve deletion decisions across restore. Use approved retention rules; a stored policy ID is not an executor.
- D05.2: Implement external general-knowledge requests as a distinct flow: user/topic need → permitted general template → release check → finite budget reservation → provider request → received/refused/failed/uncertain status → professional review → knowledge candidate/version. Keep private source content out of this payload.
- D05.3: Add visible budget/service-unavailable recovery, request deduplication and operator handling for uncertain delivery. Reuse an approved capable provider if available; otherwise expose unavailable status until the required provider capability/budget exists. The Hungarian chat route is not an implicit substitute for this flow.

**Acceptance:** run a complete synthetic copy/restriction/deletion case, including pending work and restore reconciliation. Run a general-knowledge request whose reviewed result becomes an active retrievable version; also test blocked payload, exhausted budget and uncertain delivery. Do not test deletion on real participant records as a routine release check.

## Release 6 — Source programmes and final parity acceptance

**Covers S03 if its previously deferred scope is explicitly commissioned; completes the final reconciliation for S01/S02.**

- D06.1: Map the eight-session source masterclass and proposed weekly/six-week/year programme experiences to reviewed modules, sequence, participant action, facilitator notes and outcome review. Do not automatically activate programmes just because their example exists.
- D06.2: For commissioned programmes, implement the programme/session lifecycle, scheduling, progression, assigned responsibilities, skipped/adapted sessions and outcome review using the existing goal/action/follow-up foundation. Keep authored programmes distinct from AI-generated long-horizon prescriptions.
- D06.3: Run source-example parity walks in player, parent and coach roles on desktop and mobile. Record every source section as delivered, changed by a later decision, unavailable source, or still deferred. No “all delivered” label with unclassified rows.

**Acceptance:** for an authorised programme, complete a session, adapt or skip another, reload, inspect history and review an outcome. If programme scope remains deferred, preserve that status and report the remainder rather than pretending the audit is fully closed.

## Cross-release delivery rules

- **Coach oversight:** every successful player-scoped action and its resulting state must appear in the unified history with attribution and a usable detail link. Add acknowledgement queues where a person needs to act; timeline visibility alone is not task handling. Preserve read-only observation of other authors' AI threads.
- **Delivery state:** planned → implemented → locally verified → deployed → production checked → accepted. Store exact evidence per state. A production health check is not authenticated workflow acceptance.
- **Contracts/migrations:** update API, DTO and storage versions together. Use forward migrations, preserve old snapshots, idempotency and revision fencing. Never rewrite historical content to make it fit a new feature.
- **Verification:** run relevant workflow/database tests, role-isolation and meaningful failure cases, lint/typecheck/build, then synthetic browser → API → database → response acceptance. Check deployed SHA/health separately. Authenticated production checks require a legitimate available session; if unavailable, record that limitation.
- **AI evaluation:** run the replay suite before routing/prompt/model changes and add unseen tests. Record actual rule/model/fallback path, time and quality separately. No personal prompts/replies in operational telemetry.
- **Release/reporting:** commit and release each coherent feature slice through the established repository flow. Update the delivery row with the concrete user-visible result, exact commit, migration/worker restart needs and known limits. Do not hide incomplete functionality behind an unchanged earlier “delivered” claim.

## Coverage and dependency map

| Audit finding | Main release | Prerequisite |
| --- | --- | --- |
| F01 Conversation usefulness | 4 | 0 evaluation; 1 corrections; 3 reviewed content |
| F02 Reusable approved knowledge | 3 | 0 source mapping; 1 lineage |
| F03 External knowledge requests | 5 | 3 knowledge lifecycle; provider/budget capability |
| F04 Coach handoff | 2 | 1 exact-source lineage |
| F05 Assessment attempts | 1 | 0 acceptance cases |
| F06 Record corrections | 1 | 0 contract reconciliation |
| F07 Answer/claim feedback | 2 | 1 source/answer lineage |
| F08 Data requests/lifecycle | 5 | 0 policy/execution map; cross-domain lineage |
| F09 Job cancellation | 1 | existing job leases/fencing |
| F10 Full knowledge search | 3 | 0 large-library fixture |
| F11 Exact visible context | 4 | 1 stable source revisions |
| F12 Safety-case handling | 2 | existing authored responses and access policy |
| F13 Dependent plan validity | 2 and 3 | 1 lineage; 3 knowledge versions |
| S01 Full guide experience | 3 | original available sources and reviewed content mapping |
| S02 Rich report experience | 4 | 3 glossary/guide; reviewed report fields |
| S03 Programmes/masterclass | 6 | explicit commissioning of deferred scope; reviewed content |

## First concrete implementation batch

Start D00.1–D00.5, then implement **assessment attempts, linked record corrections and cancellation** as release 1. In the same preparation period, establish the source-guide map and conversation baseline so releases 3–4 are based on the actual missing content and measured failures. The next report should show working flows and remaining rows, not another blanket completion statement.

No calendar commitment is invented here: reliable duration estimates require the initial source inventory, reproduction of the workflow gaps and the available content-review capacity. The order and acceptance gates are actionable now.
