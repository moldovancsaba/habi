# Habi missing-functions audit — 1 November 2026

## Finding

The current product implements many prototype screens, but it does not implement the whole set of workflows described by the source documents. The earlier feature inventory conflates **content copied**, **a form exists**, **a durable workflow exists**, and **a useful outcome is verified**. Those are different delivery states.

Audit baseline: Habi `673d6c754e87de9f09bbdac2d1a1c7de0d68ef28`, the dashed-chart release. Working tree was clean at the start. Prototype checkout: `/Users/Shared/Projects/prototype`, `4b07b50d52686525ceb514c29a0ce24a78c69bf0`. Date uses Europe/Budapest.

This is a source-to-code audit, not a new authenticated production walkthrough. Findings below identify code omissions and partial implementations; production account-specific availability remains unverified. No participant records, credentials, real transcripts or personal report scores were read. No application code, configuration, data or deployment was changed.

### Evidence reviewed

- Habigoal `docs/22-product-contract.md`, `17-role-workflows.md`, `16-external-ai-learning.md`, `24-developer-handoff.md`, `08-client-asks.md`, `09-user-journey-map.md`, `01a-source-register.md`, and the gap register.
- Prototype `wireframes/workspace.js`, `assessments.js`, and the source inventory for report/guide examples.
- Habi API contracts, route handlers, workflows, worker router/context packer, role navigation and relevant UI components; earlier migration, request-delivery, verification and AI-replay notes.
- Later owner decisions take precedence: direct player AI is enabled; coaches can observe participant AI activity; SSO administration is separate. Older source prohibitions do not override these decisions.
- Original third-party PDF/DOCX/HTML attachments described in the source register were not reopened here. Their feature descriptions are secondary evidence, explicitly identified below. An expired Lovable preview cannot establish a missing screen.

## A. Current functional gaps

Priority: P1 = complete the core source → conversation → decision → follow-up workflow; P2 = supporting capability or completeness. “Missing” means no functional path was found in the inspected application/worker. “Partial” identifies the working subset.

| ID | Priority / state | Requested or documented function | Current implementation and concrete gap | Evidence / completion criterion |
| --- | --- | --- | --- | --- |
| F01 | P1 · Partial | Natural, context-aware support that answers follow-ups and reacts meaningfully to feedback, rather than repeating a synthetic script | `coach_router.py` now covers common intents with rules. Advice currently declines personal advice and shows recorded check-ins; update/preference acknowledgements use fixed strings. Open questions still reach the experimental model. This is useful defensive routing, not the broad conversational support requested in the chat. | `worker/habi_worker/coach_router.py` (`advice_answer`, `ACKNOWLEDGEMENTS`, `route`); `coach_dialogue.py` (`prepare_hungarian_conversation`) has a 608-byte request budget. Existing replay reports 37 rule / 2 model turns, not general conversation acceptance. Complete with role/date/correction/repetition tests judged for actual helpfulness and natural Hungarian, including unseen multi-turn cases. |
| F02 | P1 · Missing beyond candidate review | Approved coach knowledge becomes reusable, versioned knowledge for subsequent answers, with provenance and withdrawal | Coaches can create/approve/withdraw a `knowledge_candidates` record. Approval changes that record's status and revision. It does not create an immutable `knowledge_versions` record or feed approved knowledge into AI retrieval. `collectCoachSources` does not collect either knowledge collection. Thus “we approved a pattern” does not mean “Habi learned to use it.” | Source `16-external-ai-learning.md`, knowledge activation/lineage. Product `src/lib/workflows/knowledge.mjs`, `coach-memory.mjs` source collections. Complete by activating immutable versions, retrieving eligible versions, pinning citations and invalidating dependants on withdrawal. |
| F03 | P1 · Missing | An explicit external general-knowledge question, release checks, bounded budget, response review and incorporation into local knowledge | No product path was found for the source's `external_request` flow, template release checks, budget reservation or external-request lifecycle. The existing shared Hungarian chatbot transport is a different mechanism: it does not implement this reviewed general-knowledge acquisition workflow. | Source `16-external-ai-learning.md`, sections “Külső kiadási kapu” and “ExternalRequest”. Product worker handles existing conversation/interpretation/scan jobs; no corresponding external-request workflow/route was found. Complete with an actual user action, approved general template, request accounting, reviewed result and knowledge activation. This finding does not select or authorize a new provider. |
| F04 | P1 · Missing explicit workflow | “Ask a coach for help” on an exact answer, acknowledge it, and connect the resulting discussion and plan | Ordinary human threads and AI review sharing exist. Neither is the documented durable handoff object with exact answer revision and coach acknowledgement. `/v1/handoffs` and `/{id}/acknowledge` are documented but have no handlers. A coach seeing the timeline is not acknowledgement of a request for help. | Source `22-product-contract.md` step 7; `17-role-workflows.md`; API coverage appendix. Complete with a source-pinned handoff, visible open requests, acknowledgement by any eligible coach, response and plan links. |
| F05 | P1 · Partial | Durable coach-led assessment attempts, answer-by-answer saving, explicit interruption and completion | The catalogue and final saved assessment exist. `CoachAssessments` stores `started`, `step`, `answers` and fields in React state. Starting/selecting answers does not persist an attempt; only final submission calls `/coach-assessments`. A reload loses all intermediate answers and leaves no started/interrupted attempt for the coach history. | Source `24-developer-handoff.md`, assessment row and started/answer/interrupt/complete contract. Product `src/app/coach-assessments.tsx`, `src/lib/workflows/coach-assessments.mjs`. Four assessment-attempt operations have no handlers. Complete by persisting attempt and submitted answers, recording interruption, and keeping interrupted attempts non-resumable as specified. |
| F06 | P1 · Missing for ordinary records | Correct a mistaken journal/observation record while retaining the original and explicitly linking its replacement | AI-memory corrections exist, but the ordinary record correction route has no handler. `createRecord` always writes `supersedesId: null`; the record UI offers no source-linked correction action. Another free-text note is not an explicit correction lineage. | Source `24-developer-handoff.md` journal “records GET/POST and correction”; documented `/players/{playerId}/records/{id}/corrections`. Complete with an authorised correction action, immutable original, replacement link and affected context/recommendation refresh. |
| F07 | P1 · Partial | Feedback on the exact answer/claim: readability, usefulness, preference, disputed claim and professional correction | Chat feedback and recommendation “helped/not helped” exist. The documented player feedback endpoint has no handler. No general answer/claim-bound feedback workflow was found that turns a disputed claim into a review request. Sharing a whole AI turn for review is a separate, working feature. | Source `16-external-ai-learning.md` “Feedback típusai”; `contracts/api.json` FeedbackInput operation. Complete with exact answer/revision/optional claim linkage, distinct categories and disputed-claim review, without treating positive feedback as truth approval. |
| F08 | P1 · Missing product workflow | Request an authorised data copy, rectification, restriction or deletion and follow its status | `privacy_requests` and `deletion_ledger` have storage contracts, but privacy request POST/GET handlers and a request/status UI are absent. No executor for the complete subject-data retention/deletion/restore lifecycle was found. Existing goal text export, draft deletion and membership revocation are different functions. | Source `17-role-workflows.md` “adatkérés”; `24-developer-handoff.md` deletion/restore; product migration schema and absent `/privacy-requests` routes. Complete with request intake, identity/scope verification, status, scoped export/deletion/restriction processing and recorded execution evidence. |
| F09 | P2 · Missing user action | Cancel a queued/processing AI job and see the cancellation persist | `/v1/jobs/{id}/cancel` has no handler and no generic cancel control was found. Internal cancellation exists for superseded automatic openings and stale work; sending another question is supported. Neither lets a user explicitly cancel their outstanding request. | `contracts/api.json`, `src/app/ai-coach.tsx`, `src/lib/workflows/ai-coach.mjs`. Complete with owner-authorised cancellation, lease fencing, worker observation and reloadable cancelled status. |
| F10 | P2 · Partial | Search and browse the entire reviewed knowledge library | `listKnowledge` always returns the newest 100 candidates and no next cursor. The UI filters only that loaded array. At 101+ entries, older patterns cannot be reached through this screen, even by entering an exact search term. | `src/lib/workflows/knowledge.mjs:listKnowledge`, `src/app/knowledge-workspace.tsx`. Complete with server-side search and pagination through all eligible entries. |
| F11 | P2 · Partial | Ask AI about the exact chart currently being viewed | Chart context includes metric and period and the server applies those bounds. It does not include the chosen detail day, daily-versus-all-submissions projection or exact displayed record set. The panel can discuss the metric/window without knowing the exact selected view. | `src/app/checkin-graphics.tsx` chart button sends `kind,id,metric,days,revision`; chosen day/projection stay local. `ai-coach.mjs` applies time/role/kind filters. Complete by pinning selected view/record revisions and testing questions about that selected day and projection. |
| F12 | P1 · Partial | A coach can actively handle a safety concern, beyond noticing a badge | Authored player safety/pain messages and an in-app coach safety badge exist. No safety case acknowledgement, assignment, resolution or recorded follow-up workflow was found. Badges are derived when history is read; they are not a triaged case. The source/recent analysis calls for coach-visible escalation; the badge supplies only visibility. | `src/lib/workflows/coach-messages.mjs`, `src/app/ai-coach.tsx`; `docs/ai-coach-copy-review-2026-10-31.md`. Complete with an agreed in-app handling workflow and audit of acknowledgement/follow-up. External push/email is not assumed approved by this audit. |
| F13 | P1 · Partial | Source withdrawal visibly propagates through the explanation-to-plan lineage | Publication withdrawal recursively invalidates legacy interpretations, which is implemented. That code does not mark linked plans as requiring review. A saved plan can therefore retain its prior status after its evidential publication is withdrawn; no complete knowledge→interpretation→plan validity lifecycle was found. | Source `16-external-ai-learning.md`, lineage/withdrawal paragraph. Product `src/lib/workflows/publications.mjs:withdrawPublication` updates publications and interpretations; `plans.mjs` has no plan validity/review-required lifecycle. Complete by preserving plan history while making invalidated evidence and required review visible to authorised users. Static finding; no new live withdrawal was performed. |

These 13 findings are capability-level gaps. They are not 13 failed automated tests and are not a claim that all related UI is absent.

## B. Source/example experiences that are not fully delivered

These explain why the source examples look richer than the product. They must not be silently treated as validated methods or as mandatory first-slice scoring features.

| ID | Source experience | What is available | What is absent / scope status |
| --- | --- | --- | --- |
| S01 | Full mental-coach/attribute guide: six domains, 27 subattributes, domain toolkits, observation cues, warning/supportive signs, short sessions and drills | Native assessment topic definitions, interview prompts, a 10-practice library and a small knowledge-candidate form | No complete, source-versioned browsing/teaching workflow mapping all guide sections and drills was found. The 62/136/24 catalogue counts do not prove that the whole guide or masterclass is delivered. Evidence is the source register HBG-C001/C006/C007/C011/C012, not a fresh read of the original attachments. Content mapping, source rights and review remain to be established for the missing sections. |
| S02 | Rich CogMap report journey: original report, six-domain explanations, comparison context, strengths/focus, position-specific interpretation, challenges and progression | PDF upload/scan/download, manual page-linked extraction, raw cognitive value entry and explanation/review | No integrated report-viewer-to-metric-to-glossary-to-coaching-toolkit journey or import/export equivalent of the source guide was found. The extraction form sets `normSource` and `interpretationDirection` to null. Missing source-backed interpretation cannot be replaced with invented norms or rankings. Source register HBG-C004/C010/C014 identifies report/position examples and unresolved comparison/version issues. Manual extraction first is an accepted baseline, so OCR absence is not a broken promise. |
| S03 | Eight-session masterclass and weekly/six-week/year-long development programmes | Individual practices, own goals, routines, shared actions and follow-up | No programme/session scheduler, progression curriculum or programme-level outcome review was found. HBG-C013 describes the masterclass; `22-product-contract.md` and D-HG-015 explicitly defer long programmes. They are absent roadmap scope, not a regression of an approved first-slice feature. |

The outdoor skills-zone business proposal and the expired Lovable preview are not evidence of missing Habi functionality. Model weight training and population learning remain explicitly deferred. No new automatic message-sending requirement is inferred.

## C. Functions present, but easy to mistake for missing

| Capability | Actual entry point / constraint | Audit classification |
| --- | --- | --- |
| Daily check-in, partial answers, resume and save-on-tap | Player → Állapotjelzés; `daily-checkin.tsx` | Present. Five-area categorical self-report, not the legacy seven-question scoring system. |
| Metric graphics, combined metro trends, distribution, day details, 14/28/42 days | Állapotjelzés → `CheckinTrends`; dashed missing-data connectors in baseline commit | Present. No new visual browser acceptance was run in this audit. |
| Guided/HABI2 conversations, pain help, own goals, routines, daily/weekly/monthly reflection, event preparation and trusted-adult preparation | Player → **Gyakorlatok és saját célok**, much of it within one large screen/disclosures | Code present; discoverability is weak relative to the prototype's individually named journeys. Parent/coach role navigation does not expose the player's own tool workspace. This is not proof the underlying functions are absent. |
| Parent/coach human conversations | Beszélgetések → `shared-conversations.tsx` | Present, including replies and open/close. Messages are reversed to oldest-first inside the selected thread; the source role workflow asks for newest-first. This is a concrete behaviour mismatch, not a missing conversation system. |
| Shared plans, participant acceptance, pause/resume, follow-up | Riportok és tervek / Tervek / Feladatok és visszajelzések | Present code and prior integration evidence; source invalidation gap is F13. Not reverified in a signed-in production session here. |
| PDF upload/scan/manual extraction and review | Coach → Riportok és tervek → report workspace | Present; not automatic parsing or a complete report interpretation product (S02). |
| Record/material publication and withdrawal, claim-level legacy interpretation review | Coach records/material panels and review component | Present; does not establish knowledge activation (F02) or a human help request (F04). |
| All-participant AI history for authorised coaches | Global AI panel/history and unified timeline, read-only for other authors | Present code and earlier synthetic acceptance. Unsubmitted typing is not collected; earlier overwritten intermediate states cannot be reconstructed. |
| Role invitations, parent/player linking and revocation | Separate SSO app-admin invitation flow | Present replacement for older parent/membership creation APIs. The source's coach self-service onboarding is not current behaviour; D-HG-016 deliberately moved role administration to app admins. |
| AI profile and suggestions | Global AI panel → profile/recommendations | Present as dated retrieval, category counts, keyword matching and feedback ordering. No trained player-specific model, no comprehensive causal understanding. |
| Goal/conversation/preparation text exports | Individual player workflows | Present. Not a complete subject-data export or provider report JSON importer. |
| Reminders | Player reminder preferences and in-app due notices | Present only when the application is used. No background email/push/WhatsApp delivery. |

## D. Contract and completeness findings

### API implementation coverage

A static comparison of all **112 documented HTTP operations** against Next.js route files found:

- **21 operations** with no matching route file.
- **1 operation**, `POST /v1/players`, whose route file exists but does not export POST.
- Detailed paths and expected files: [function-audit-api-coverage-2026-11-01.json](function-audit-api-coverage-2026-11-01.json).

This is **22 contract implementation mismatches**, not 22 independently missing product functions. Knowledge CRUD/review, publication listing and membership administration have replacement paths. Check-in interruption has a working UI alternative of stopping and resuming or completing partially, but no explicit interrupt command. Player listing provides some profile information despite the absent single-player GET.

Missing route groups:

| Group | Operations | Interpretation |
| --- | ---: | --- |
| Assessment attempts | 4 | Core persistence gap F05, not replaced by final-only assessment submission. |
| Check-in interruption | 1 | Alternative UX exists; explicit documented command absent. |
| Coach handoffs | 2 | F04. |
| Job cancellation | 1 | F09. |
| Knowledge candidate/version commands | 3 | Candidate review has replacement routes; immutable version withdrawal/activation remains F02. |
| Membership create/revoke, parent create, player create | 4 | Admin invitations/revocation replace most onboarding intent; outdated public contract paths remain. |
| Single player read | 1 | Listing provides partial replacement; contract drift. |
| Answer feedback | 1 | F07. |
| Publication list per player and publication by ID | 2 | Global publication listing is a replacement for browsing; contract drift. |
| Ordinary record correction | 1 | F06. |
| Privacy request create/read | 2 | F08. |

The existing API-manifest test pins versions/hashes and selected operations. It does not demonstrate that every advertised operation has a runtime handler. Passing it is not endpoint completeness evidence.

### History and availability limits

- Timeline source queries sample 100 or 200 records before merging. Cursor time bounds fix ordinary older-page traversal, but source queries sort only by timestamp and do not apply the cursor ID before sampling. A sufficiently large same-timestamp group can make records unreachable. This is a static pagination risk, **not a newly reproduced data-loss incident**. Add a tie-heavy regression before declaring complete history coverage.
- Many tools are buried together in the approximately 6,800-line workspace component. A present branch behind role/selection/disclosure conditions is not necessarily discoverable by a real user. The source contract's find/understand/act tasks still need current three-role acceptance, especially on mobile.
- Historical documents are contradictory unless read chronologically. For example, `coach-message-history.md` still describes a pre-release model-quality gate and no canned fallback, while the latest router deliberately uses rule-based fallback. The October 29 audit also predates the October 31 routing changes. These are not reliable current completion checklists.

## E. Recommended delivery order and acceptance

1. **Complete the core human support loop:** F04 handoff, F05 assessment persistence, F06 correction, F07 answer disputes, F13 downstream validity. Demonstrate one original source through a real conversation, acknowledged coach help, accepted plan and later feedback; reload every step and use both coaches/parents.
2. **Deliver useful approved knowledge:** F02 activation/retrieval plus F10 complete browsing; map the source guide corpus S01 before claiming it is represented by assessment counts. Prove a newly approved version changes an eligible answer and withdrawal removes it.
3. **Complete assistance quality and context:** F01 natural unseen multi-turn support, F11 exact displayed context, F09 cancellation. Product-help and out-of-scope questions still need deliberate routing; generic model replies are not product support acceptance.
4. **Finish operational handling:** F08 privacy/data lifecycle and F12 acknowledged in-app safeguarding workflow. Treat external notification channels as a separate scope decision.
5. **Implement F03 if retaining the source's general-knowledge acquisition workflow.** It is currently absent. Do not confuse the existing chatbot transport with its release/review/budget lifecycle.
6. **Reconcile source-only scope S02/S03:** decide which report/guide/programme experiences are next, retain deferral labels where appropriate, and establish missing content provenance rather than copying unverified numeric interpretation rules.

A feature closes only with a visible entry point, role-appropriate persistence and reload, source/answer/plan lineage where applicable, failure recovery, and evidence from the actual workflow. Catalogue counts, schema presence, static handler coverage, HTTP 200 and model API success alone are insufficient.

## Verification performed for this audit

- Read-only code/source comparison and exact baseline commits recorded above.
- Machine-readable route/method coverage generated from `contracts/api.json`; parameter names were mapped from `{id}` to `[id]`, `/v1` paths to `/api/v1`.
- Direct inspection of replacement routes prevents counting all absent contract handlers as missing capabilities.
- No new application test suite or browser session was run: this deliverable changes documentation only. Existing tests/replays are cited as historical evidence, not rerun results.
- No fixes, commit, push, migration or production change is included in this audit.
