# Habi: full conversation against implementation — 2026-10-29

## Evidence and scope

Reviewed all 23 conversation turns from the first request to review five commits through the request to connect the Hungarian route, including the screenshots, intermediate promises and the subsequent instruction that coaches must see activity at every level. Compared the code with the preserved legacy Habi commit `538c76518484ec269e2ddd3418fbb945e7ff5a67`, the Habigoal wireframes under `/Users/Shared/Projects/prototype/habigoal/wireframes` and the inventory in `legacy-feature-migration.md`.

An earlier “delivered” message is not acceptance evidence. The rows below distinguish a code path, a verified flow and a remaining limitation. The owner's latest coach-oversight instruction supersedes the earlier promise that an AI transcript is invisible to coaches unless explicitly submitted for review. Formal approval of an inference remains a separate action; reading a transcript is not approval.

## Original requests and actual paths

| Request from the conversation | Actual implementation | Audit finding / action |
| --- | --- | --- |
| Review the initial five commits and fix delivered work | Source-bound shared plan writes, broader interpretation retrieval, metric/metro mapping | Present. Shared plan creation must still be exercised in this browser audit; earlier claims alone are not evidence. |
| The shared-plan save screenshot | `workspace.tsx:createSharedPlan`, `workflows/plans.mjs` | Required source, participant, reason, deadline and stop condition are represented. Revision-pinned source and participant fencing have integration tests. |
| “Where are the proper graphics?” | `checkin-graphics.tsx`, `checkin-chart.mjs`, `MetricGraphic` | Answer-dependent battery/moon/focus/mood/load visuals and metric/combined trends exist. Actual rendering is checked separately from content counts. |
| Restore prototype functions | `legacy-feature-migration.md`, native workspace/components/content packages | The older inventory covers check-ins, practices, 12 explanations, guided conversations/HABI2, pain support, goals, routines, follow-up, reflection, prep/export, drafts, assessments, PDF review, sharing, materials, plans and knowledge review. Code and parity integration tests exist; this is not a claim that every combination was manually tested in production. |
| `smart_toy` on every page and meaningful element | `AiCoachProvider`, contextual `AiCoachButton` call sites | Global entry and many contextual entries exist. Human shared-conversation messages lacked a contextual button; added it. Timeline AI entries now open the actual saved thread, including older threads not on the first list page. |
| Open with the selected content and continue discussing it | Exact context refs, `startCoachTurn`, `readCoachThread`, worker context | Context versions and original dialogue are persisted. Opening text includes authored descriptions; it is not always a newly generated model explanation. |
| “Train their profile heavily” as history grows | `collectCoachSources`, `buildCoachProfile`, `selectRelevantSources`, profile revisions | Read-triggered structured memory, dated patterns, supporting/counter-evidence and corrections exist. No model fine-tuning is performed. This is rule-based aggregation/retrieval, not a claim of deep semantic understanding. Coach context now includes submitted participant reports; other people's response preferences are not promoted into player facts. |
| Useful, explainable recommendations that improve through outcomes | Authored practice candidates, goal/context links, recommendation feedback and review dates | These mechanisms exist and are source-linked, but candidate matching remains rule-based. The current model has not demonstrated consistently useful personalised coaching. |
| “I cannot send my question” | Composer pending-state handling, durable write before queued work, revision fencing | Sending while generation waits is supported. The new-chat write transition temporarily disables typing to prevent losing newly entered text. |
| Show processing progress and return answers | Job phase/elapsed time, retry/capacity/maintenance handling, saved reply | Present. A failed generation remains a failure; history survives it. Hungarian oversized messages get a shortening request rather than endless retries. |
| Repeated questions must get a real contextual reaction | Role-preserving dialogue, latest message, source selection, near-duplicate checks | Fixed canned rewrite paths are bypassed for the new flow. Exact/near duplicates are rejected. Natural relevance still fails some live model tests; structural guards do not establish useful support. |
| Turn dry data into ordinary chatbot replies | `coach_dialogue.py`, shared asynchronous API, plain text replies | Free generation is used, without forcing the user's example into a fixed sentence template. The model can still invent or misunderstand information; there is no comprehensive semantic verifier. |
| Metro-line screenshot is broken | Container-aware geometry, measured station/card connectors, resize/expansion handling | Geometry fixes exist and have browser/geometry tests. New activity is integrated without replacing the metro layout. |
| The question field must also accept feedback and updates | Original turn text, `messageUnderstanding`, exact-clause notes, correction and exclusion events | Questions, reports, feedback, goals and corrections share one composer. Original text remains unchanged; notes are conservative indexing rather than proven interpretation. |
| The breakfast/wellbeing update must change future understanding | Attributed notes, correction retirement, exclusion checks, history across threads | Persistence and correction semantics have integration tests. The Hungarian model still fails some causal/role/date tests; no successful technical write is treated as a support-quality pass. |
| Use the newly available Hungarian route | `HG_SHARED_AI_DIALOGUE_TASK=text_chat_hu`, task-specific discovery and byte-budget adapter | Connected in production by explicit owner request. General jobs retain `text_chat`; model selection remains `auto`. Provider marks the Hungarian job experimental. |
| Coaches must see “anything … on any level” | Unified timeline, coach cross-participant thread reading and source viewing, durable command activity | Found missing AI messages/outcomes, denied observer access, missing operational metadata, and unreachable older records. Added coach-wide player-scoped visibility, read-only transcript opening, original source access, live refresh, operational events and a transactional activity ledger for subsequent successful player-scoped writes. |

## Concrete gaps corrected in this audit

1. The metro feed queried the legacy `turns` collection and omitted `habi_coach_turns` and profile events entirely.
2. The read endpoint rejected coaches trying to inspect another participant's AI thread. It now allows player-scoped coach observation; write ownership remains unchanged.
3. Contextual buttons opened a new generic chat rather than the selected saved AI conversation. The selected thread now opens directly and keeps its original context when its owner continues it.
4. Fixed source-query limits made records older than the newest sample unreachable on later pages. Cursor time bounds now apply before source sampling; a 245-record regression traverses the entire history.
5. The timeline did not update after the AI panel closed or while a different participant worked. The visible timeline refreshes on activity, focus and a bounded interval while retaining older loaded pages.
6. Reports, extracted data, assessment results, unpublished coach material, withdrawn publications, unfinished check-in starts and actual plan decisions were absent from the coach activity view.
7. Latest-state projections were not a durable history of actions. Successful player-scoped workflow commands now append canonical `events` and actor-linked `audit` metadata within their existing transaction. An idempotency replay adds no second activity. Failed transactions leave no activity behind. Draft contents and raw request bodies are not copied into this ledger.

## Limits that remain explicit

- The Hungarian service's short context and imperfect language/reasoning quality remain. Connecting its route does not fulfill the promise of consistently useful natural support.
- Earlier overwritten intermediate states cannot be reconstructed. Legacy records are projected using available timestamps and state; durable action recording starts with this release. Unsubmitted typing is not activity and is not collected.
- The profile is structured memory and rule-based patterns/recommendations, not model fine-tuning or a comprehensive learned psychological assessment.
- Browser acceptance uses isolated synthetic accounts and data. It does not claim a walkthrough in the owner's live SSO session.

## Verification and release status

Recorded in `verification.md` (“Coach-wide oversight of player activity · 2026-10-29”): 234 application tests, 72 worker tests, lint, typecheck, production build and a synthetic three-role browser/HTTP acceptance on the production build. The change is committed locally only. It is not pushed or deployed, so no Production deployment ID or live check exists yet; this audit makes no claim about the owner's live SSO session. Open items found during acceptance (not fixed here) are listed in `verification.md`.
