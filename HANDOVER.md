# Habi — developer handover

Prepared **2 November 2026**. This is the starting document for the next maintainer. It describes a working, partially delivered product; it is not a declaration of complete prototype parity.

## 1. Read this first

| Item | Current reference |
| --- | --- |
| Product | Habi: shared support for young athletes, parents and coaches; Hungarian user interface |
| Production | https://habigoal.com — canonical host; administration at `/admin` |
| Repository / branch | https://github.com/moldovancsaba/habi — `main` |
| Last verified functional release | `ca298659225d774d0f70b8c39b1369b97c7d3fc6` — invited-user first-login fix |
| Verified deployment | `dpl_BTKZpZUFfcoPW7PUtn1sHU5gazv5`, Vercel project `narimato/habi`, READY |
| Latest functional-release CI | [Run 41431000014](https://github.com/moldovancsaba/habi/actions/runs/41431000014): 285 application tests, zero failed/skipped; integrity, lint, types and build passed |
| Worker unit suite | 119 tests passed again during preparation of this handover |
| Delivery board | https://github.com/users/moldovancsaba/projects/14 |
| Engineering issue standard | https://github.com/sovereignsquad/general-design-system/issues/81 |
| Design system | https://github.com/sovereignsquad/general-design-system — mandatory for all new UI/frontend work; accessibility is mandatory |

The production domain was checked during handover preparation: health and readiness returned 200 and the alias pointed to the deployment above. Those checks do **not** certify every authenticated user journey or AI answer quality. Documentation-only commits may follow this functional baseline; inspect GitHub/Vercel before the next release.

Read [AGENTS.md](AGENTS.md), this document, the relevant feature handover, then the actual implementation and issue acceptance criteria. The installed Next.js documentation under `node_modules/next/dist/docs/` is required reading for framework changes. Several older documents are historical snapshots: for example, older architecture/verification text predates durable assessments, per-answer check-ins and the hosted Hungarian dialogue route. Use current code, manifests and linked release evidence to resolve discrepancies.

## 2. Product requirements that must survive the transfer

- There are three product roles: `player`, `parent`, `coach`. Administration is a separate, verified SSO app permission, not a fourth product role.
- Coaches need an attributed history of recorded player/parent/coach activity, including AI questions, updates, feedback and outcomes. Observing another participant's conversation does not give permission to edit it, cancel their job, approve it or adopt their personal preferences.
- AI assistance must address the selected content and its exact source revision. Older events must not fall back silently to unrelated recent data or general page context.
- The owner specifically rejects repetitive, synthetic responses. Repeating a question, correcting a fact, changing a preference and answering a follow-up must affect the conversation meaningfully. Random template rotation is not acceptance.
- Player profiles are evidence-derived, attributed and time-aware. Preserve contradictions and corrections. Existing memory is not proof of a personal-data model-training pipeline or permission to build one.
- State graphics and the metro timeline are substantive product features. Missing days/answers remain missing; dashed chart connectors indicate missing records, not measured or interpolated values.
- Preserve original records, published revision boundaries and visible correction lineage. Do not turn a source withdrawal into silent deletion of historical commitments.
- Source guides/reports/examples must be compared section by section. Available catalogue counts, mocked examples and HTTP 200 responses do not establish delivery or source rights.
- All new UI uses shipped GDS contracts and tokens. Do not introduce a parallel component library, local theme authority or custom replacement controls. Test keyboard use, names/focus, contrast, mobile layout and error/recovery states.

## 3. Architecture and code map

```text
Browser, Hungarian role workspace
  → same-origin Next.js API on Vercel
    → MongoDB Atlas: canonical domain data, sessions, receipts, job state
    ← outbound Mac worker: claim → heartbeat → authorised context → completion
         → shared hosted chatbot API / ClamAV for the corresponding job
```

The browser receives authorised DTOs, never Atlas credentials or provider keys. The worker has no direct Atlas connection or user SSO credentials. Vercel region is configured as `fra1`; this is not evidence of the Atlas/provider data region.

| Area | Start here |
| --- | --- |
| Application shell / role navigation | [src/app/workspace.tsx](src/app/workspace.tsx), [src/app/page.tsx](src/app/page.tsx) |
| GDS bootstrap | [src/app/gds-provider.tsx](src/app/gds-provider.tsx), [src/app/layout.tsx](src/app/layout.tsx), [gds-adoption.json](gds-adoption.json) |
| Request/authentication boundaries | [src/lib/api/runtime-route.ts](src/lib/api/runtime-route.ts), [src/lib/api/route-boundary.mjs](src/lib/api/route-boundary.mjs), [src/lib/auth/session-guard.mjs](src/lib/auth/session-guard.mjs) |
| SSO / invitation access | [src/lib/auth/sso-oidc.mjs](src/lib/auth/sso-oidc.mjs), [src/lib/auth/sso-browser-callback.mjs](src/lib/auth/sso-browser-callback.mjs), [src/app/api/invitations/claim/route.ts](src/app/api/invitations/claim/route.ts) |
| Database / migrations / idempotency | [src/lib/database](src/lib/database), especially `mongo.ts`, `migrations/runner.mjs`, `migrations/checksums.mjs`, `idempotent-command.mjs` |
| Check-in capture / charts | [src/app/daily-checkin.tsx](src/app/daily-checkin.tsx), [src/app/checkin-graphics.tsx](src/app/checkin-graphics.tsx), [src/lib/workflows/checkin.mjs](src/lib/workflows/checkin.mjs), [contracts/instrument.json](contracts/instrument.json) |
| AI chat / history / profile | [src/app/ai-coach.tsx](src/app/ai-coach.tsx), [src/lib/workflows/ai-coach.mjs](src/lib/workflows/ai-coach.mjs), `coach-memory.mjs`, `coach-messages.mjs`, `coach-conversation.mjs` |
| Metro timeline | [src/lib/workflows/timeline.mjs](src/lib/workflows/timeline.mjs), `timeline-sources.mjs`, `timeline-projection.mjs`, [src/app/metro-timeline.tsx](src/app/metro-timeline.tsx) |
| Assessment attempts / corrections / cancellation | [src/lib/workflows/assessment-attempts.mjs](src/lib/workflows/assessment-attempts.mjs), `record-corrections.mjs`, `job-cancellation.mjs`; corresponding components under `src/app` |
| Reports / plans / publications | `reports.mjs`, `uploads.mjs`, `extractions.mjs`, `plans.mjs`, `publications.mjs` under [src/lib/workflows](src/lib/workflows) |
| Worker | [worker/habi_worker/service_runtime.py](worker/habi_worker/service_runtime.py), `coach_router.py`, `shared_ai.py`, `config.py`; [worker/README.md](worker/README.md) |
| Contracts and acceptance | [contracts](contracts), [tests](tests), [worker/tests](worker/tests), [worker/evaluations](worker/evaluations) |

Domain workflows own business state and validation. API routes authenticate and serialize. Writes use transactions, revision checks and idempotency receipts. Worker completion uses leases/fences and revalidates source eligibility; a stale worker must not commit.

## 4. Access and configuration transfer

The next maintainer needs these permissions through the owner's approved access process. **No secret values belong in this document, tickets, chat or commits.**

| System | Access needed / configuration location |
| --- | --- |
| GitHub | Repository, Actions, issues and the existing project board; SSO/GDS dependency repositories when investigating their contracts |
| Vercel | Team `narimato`, project `habi`; deployments, runtime logs and authorised environment administration |
| Atlas | Least-privilege access appropriate to the task; production tenant/database are `habi`; backup/restore ownership must be confirmed with the operator |
| DoneIsBetter SSO | Normal verified identity for product use; approved Habi app `admin` permission for invitation/role administration; coordinate client changes with its owner |
| Worker host | Current Mac operator, launchd service, protected worker configuration, scanner and host/network responsibility |
| Shared chatbot API | Service-specific worker credential and allowed task capabilities; transfer through the approved secret channel |
| Original product sources | Actual guide/report/example files, section inventory, rights/review receipts and the named content approver |

Web production settings are validated by [src/lib/runtime-config.mjs](src/lib/runtime-config.mjs). Required keys include `HG_ATLAS_URI`, `HG_ATLAS_DATABASE`, `HG_SSO_ISSUER`, `HG_SSO_CLIENT_ID`, `HG_SSO_CLIENT_SECRET`, `HG_SSO_REDIRECT_URI`, `HG_SESSION_HMAC_KEY`, `HG_REFRESH_ENCRYPTION_KEY`, `HG_CURSOR_HMAC_KEY`, `HG_WORKER_SERVICE_ID` and `HG_WORKER_BEARER_SHA256`, plus the environment/origin/tenant flags in the validator. Use the configured canonical origin `https://habigoal.com`.

Vercel may return **blank values for sensitive variables** in `env pull`. A blank download is not proof that the deployed secret is missing. Never overwrite working production secrets with those blanks.

The current worker's protected, gitignored file is `worker/.env.production.local` on the existing Mac, with mode 0600. It holds the worker bearer and shared-service key. The web runtime holds the worker bearer **hash**, not its plaintext token. Worker/provider credentials must not be moved into the browser or web environment. `.release-secrets/` contains local ignored operational material, not a portable secret store; confirm ownership and securely transfer/rotate credentials rather than copying that directory into Git.

The code requires `HG_EXTERNAL_ENABLED=false`. This disables the separately gated external-knowledge programme; it is **not** a switch that enables the already integrated hosted AI chat. Setting it to true is rejected by the current web validator.

## 5. Clean local setup

Use Node **22** to match CI, npm and a `mongod` binary available on PATH. Mongo must support a replica set because the app uses transactions. For worker development, use Python/uv and its lockfile; the package declares Python >=3.9. ClamAV/Ollama are needed only for the corresponding scanner/local-model flows, not ordinary unit tests.

**GDS is pinned to 6.8.0 and installs from npmjs.** `.npmrc` explicitly selects `https://registry.npmjs.org` for `@sovereignsquad`. No GitHub Packages token is required. Older GDS installation guidance naming GitHub Packages does not supersede this project decision.

From a fresh shell with no production Atlas/SSO/provider credentials exported:

```bash
git clone https://github.com/moldovancsaba/habi.git
cd habi
npm ci --ignore-scripts

set -a
source .env.test.example
set +a

npm run db:test:start
npm run db:seed:test
npm run dev:test
```

`db:seed:test` applies the registered migrations before loading synthetic identities. Use `http://127.0.0.1:3000`; the test configuration uses that exact origin. If selecting another port, update `HG_APP_ORIGIN` and any test-worker API origin to match it.

Local authentication is deliberately separate from production SSO. `POST /api/test/session` accepts only the declared synthetic actors under localhost/test/synthetic guards. Fixtures include `seed-a-player-actor`, `seed-a-parent-one`, `seed-a-parent-two`, `seed-a-coach-one`, `seed-a-coach-two` and another tenant's player for isolation checks. See [src/lib/auth/local-test-auth.mjs](src/lib/auth/local-test-auth.mjs) and [src/lib/database/seed.mjs](src/lib/database/seed.mjs). Use a test browser/request context; do not invent a production session or weaken the guard to make local testing easier.

The default local Mongo address is `127.0.0.1:27099`, replica set `habiTestRs`, with synthetic database `habi_workflow_test`. The service may already be shared with another local task: check before stopping it. `npm run test:workflow:local` **resets the selected local test database** and needs its corresponding app/worker dependencies; it is not the ordinary unit-test command. Reset/migrate/seed scripts reject remote hosts and database names without `_test`.

For the built app, run `npm run build`, then `npm run start:test` in the same synthetic configuration. For a local synthetic worker, use the separate `worker/.env.test.example` and [worker setup instructions](worker/README.md); never source the hosted worker file into a local test shell.

## 6. Verification and CI

```bash
# Repository root; localhost replica set running
set -a
source .env.test.example
set +a
npm test
npm run test:api-coverage
npm run test:source-content
npm run test:gds-audit
npm run lint
npm run typecheck
npm run build

# Worker unit suite: synthetic fixtures, no live provider acceptance
PYTHONPATH=worker python3 -m unittest discover -s worker/tests
```

`npm run typecheck` deliberately runs `next typegen` first. Do not remove that step: clean checkouts otherwise lack `RouteContext` and fail despite a developer's cached `.next` files working locally.

The latest functional release passed **285 app tests with zero skipped**, plus lint/types/build and contract integrity. The worker unit suite passed **119** during this handover. These are separate suites; do not equate them with live language-quality acceptance or all-role production browser proof.

[.github/workflows/contracts.yml](.github/workflows/contracts.yml) has two jobs: API/source/scoped-GDS integrity and full application regression against an ephemeral Mongo replica set, followed by lint/types/build. The test step sources `.env.test.example` so the existing synthetic worker identity is configured. The database job pins `ubuntu-22.04` because the newer runner kernel encountered Mongo 8's documented startup refusal. Keep the pin under review before runner retirement; do not suppress failed database checks. CI bootstrap uses fresh connections on retry and preserves database diagnostics.

Relevant regression tests: [invited first login](tests/invite-first-login.test.mjs), [SSO protocol](tests/sso-oidc.test.mjs), [timeline traversal](tests/timeline-question.test.mjs), [timeline source adapter](tests/timeline-view-model.test.mjs), [durable attempts/corrections/cancellation](tests/durable-assessment.test.mjs).

Browser evidence is recorded in the issue handovers below. Temporary `/tmp/habi-*` scripts/screenshots are not a fresh-clone dependency or a substitute for checked-in acceptance tests.

## 7. Identity, invitations and role boundaries

Normal flow: Habi admin issues a role-scoped invitation → invitee registers/signs in through DoneIsBetter → Habi obtains ordinary approved app access → the invitee claims the invitation with the verified issuer/subject → Habi transactionally creates/reuses identity, actor and membership and issues the role session.

The **2 November fix** removed the need for a separate manual SSO app approval. SSO permission GET returns a direct DTO; permission PUT returns `{success:true, permission:DTO}`. Habi now accepts that acknowledgement, validates subject/client binding and role/status, and preserves old direct DTO compatibility. Do not replace the parser with flat-only assumptions or bypass SSO when it reports a denial. See [invitation access](docs/invitation-access.md) and [completed #607](https://github.com/moldovancsaba/habi/issues/607).

Explicit revocation remains a denial. An SSO app user is not automatically a player/parent/coach or Habi administrator. Invalid/expired/revoked invitations do not create product access; replaying a valid claim for the same identity does not duplicate membership. Users who hit the old callback error can retry a still-valid invitation. Host-only cookies require using the canonical production hostname; aliases redirect there.

Records retain recording actor/role and information source separately. Player-direct, parent-shared and coach records have different visibility. Coach material is shared with parents only through the exact published revision. Session/access revisions, CSRF/origin checks and out-of-scope 404 responses must be preserved.

## 8. Production worker and AI support

The production worker is an operational dependency on the **existing Mac**, not a Vercel background process. During handover preparation, launchd service `com.doneisbetter.habi-worker` reported **running**. This confirms process state, not fresh end-to-end provider/model health.

- Launcher: [scripts/run-worker-production.sh](scripts/run-worker-production.sh).
- Service template: [launchd/com.doneisbetter.habi-worker.plist](launchd/com.doneisbetter.habi-worker.plist).
- Current checkout path: `/Users/Shared/Projects/habi`. The launcher and plist contain machine-specific absolute paths; adjust them before moving hosts.
- Current logs: the existing operator's `~/Library/Logs/habi-worker.log` and `habi-worker-error.log`. Inspect content-free status/reason metadata; never export tokens, questions, report text or child records into tickets.
- Read-only process check: `launchctl print gui/$(id -u)/com.doneisbetter.habi-worker` on that operator's Mac. Do not restart/stop it merely to follow this handover.

The configured hosted route is `https://chatbotapi.haho.ai/v1`, with **`text_chat_hu` / `auto` for dialogue** and the general `text_chat` path for other interpretation jobs. `HG_SHARED_AI_DIALOGUE_TASK` and `HG_SHARED_AI_DIALOGUE_MODEL` select the dialogue lane. Current code answers supported cases through `coach_router.py` first, then uses the configured model for remaining requests. Authored safety responses and source checks remain authoritative. Do not silently fall back to an English task or change the model/provider without the agreed evaluation.

The local `contracts/runtime-manifest.json` Ollama model/digest applies to the synthetic local mode; it is not a description of the hosted production dialogue model.

Worker lifecycle is claim → lease/heartbeat → authorised source context → provider/scanner work → fenced completion. Preserve idempotency keys and actual job outcomes. Do not reset attempt counters, delete a live host lock or bulk requeue jobs to hide a failure. PDF scans require working ClamAV and fresh signatures; an unknown/failed scan keeps the upload quarantined. See [worker operations and recovery](worker/README.md).

**Host transfer:** assign the new operator and host first; obtain credentials securely; install uv/scanner and adapt paths; plan a controlled switch with the old operator and reconcile in-flight leases before starting the replacement. Keep one intended production service active and confirm the ready/task metadata on the replacement. Do not abandon the old Mac while assuming Vercel will process its jobs.

AI quality remains unfinished. The held-out gate has 19 synthetic turns and digest-bound human review; no human-approved usefulness/naturalness pass is recorded. Offline replay and HTTP transport success cannot pass language acceptance. Start with [worker/evaluations/heldout](worker/evaluations/heldout), [AI copy review](docs/ai-coach-copy-review-2026-10-31.md) and issue #575. Do not mark a machine-generated review as a human review.

### AI coach operations (added 2026-11-03)

**How a coach turn is answered.** [coach_router.py](worker/habi_worker/coach_router.py) runs before the model, in this order: the authored safety copy (`context.safety`), the authored pain stance (`context.pain`), a hold that stops every rule for other health or safety wording, repeated-question handling, the attendance guide, a follow-up source note, a decline of personal advice that shows the recorded check-in, the dated check-in summary, a greeting, and a receipt for a report, correction, preference or goal. Everything else goes to the `text_chat_hu` model. If the checker refuses the model's reply twice, the worker answers with a fixed fallback instead of failing the job; held (health/safety) messages keep the old failure instead. Every sentence a rule can say is generated into [docs/ai-coach-copy-review-2026-10-31.md](docs/ai-coach-copy-review-2026-10-31.md) by `python3 worker/evaluations/copy_packet.py`; none of it has had a Hungarian review.

**Safety and pain.** The one keyword source is [guided-chat-routing-v1.json](src/lib/content/guided-chat-routing-v1.json) (`safetyKeywords`, `painKeywords`), shared with guided chat. The API adds `safety.text` or `pain.text` to the worker context only for a player's own message; `coach_router.SAFETY_OR_PAIN` is a wider hold list that [test_coach_router.py](worker/tests/test_coach_router.py) keeps in step with the JSON. Coaches see a derived "Biztonsági jelzés" badge in the message-history tab (`safetySignal`, computed on read, not stored). There is no push or email alert, and parents cannot see a player's thread.

**Contract trap.** `CoachWorkerContext` in [contracts/schemas.json](contracts/schemas.json) has `additionalProperties: false`. A new context key needs the schema, [coach-worker-context.json](worker/tests/fixtures/coach-worker-context.json) (asserted by `tests/ai-coach.test.mjs` and the worker tests) and an API deploy **before** the worker that relies on it. Without the schema change the API answers `DEPENDENCY_UNAVAILABLE` for exactly those turns, which for `safety` would be the most important ones.

**Measuring.** The worker log carries no message text. `python3 worker/evaluations/log_mix.py --since-start` reports the rule/model share, answer seconds, refused-reply reason codes, failed jobs and model changes; `habi.worker.coach.model_changed` fires when `auto` switches the model. On 2026-11-03, three days after the last restart: 7 answered turns, 4 by rules (instant) and 3 by the model (median 67 s, slowest 124 s), no failed jobs, one refused model reply. That is a very small sample of real use, and the synthetic replay is far more rule-friendly (37 of 39). The replay gate in [worker/evaluations/replay](worker/evaluations/replay) (`REPLAY_ARMS=D`, then `score.py`; synthetic data, about ten minutes against the live service; baseline 37 of 39 turns by rules, none flagged) must not get worse before any routing, prompt or model change.

**Restart and rollback.** The worker loads its code when it starts. On 2026-11-03 the Mac checkout is at `a7ff296` (the same as `origin/main`) and the running process (started 2026-10-31 09:42) loaded `worker/habi_worker` code that is byte-identical to it; the schemas it reads are unchanged since. A `git pull` in that checkout therefore changes nothing until the next restart, but it will then. Restart only when the log shows no job in flight: `launchctl kickstart -k gui/$(id -u)/com.doneisbetter.habi-worker`, then look for the `shared_ai.ready` and `service.started` events. To roll the routing back, remove the `coach_router.route` call in `service_runtime._answer_for_context`, or set `HG_SHARED_AI_DIALOGUE_TASK=text_chat`, and restart.

**Open owner decisions:** the Hungarian review of the copy packet (including the new joining phrases in the safety message and the new pain wording); keeping or dropping the experimental Hungarian model (its answers carry a "Kísérleti AI-válasz" label); whether real conversation text may be analysed at all (the log tool avoids needing it); any alert beyond the in-app badge.

## 9. Recent delivery: what exists versus what is accepted

| Capability | State and caveat |
| --- | --- |
| Check-in capture | Tapping an answer saves it and moves on (2026-10-31); the server accepts one answer per question, so a mis-tap cannot be undone from the UI. Checked in a local synthetic browser session at desktop and phone width, not with production accounts. |
| Invitation first login | Released and #607 closed; real wrapped approval handling, all three invited roles tested with synthetic identities and real handlers/transactions. No interactive new production registration was claimed. |
| API operation registry | #572 closed. API 2.5.3 has 114 operations: 98 implemented handler exports, 3 replacements, 6 pending, 7 deprecated. Integrity passes; handler existence is not feature acceptance. |
| Stable timeline / older source links | #581 closed. 650 equal-time records, mixed projections, old parent/new outcome dates and role-bound v2 cursors tested. Oldest text and exact AI record context checked on mobile. Details: [timeline handover](docs/timeline-pagination.md). |
| Durable assessments | Backend/UI shipped in the audit batch, but #576–577 remain open for remaining acceptance. Per-answer save/skip, four-hour expiry, interruption, one completion record, eligible coach history. Latest-100 history lacks pagination; interrupted/unfinished attempts do not resume. |
| Immutable corrections | Backend/UI shipped, #578–579 remain open. Original remains, successor/reason is recorded, current AI facts retire superseded records. Downstream answer/plan invalidation is separate #582. Finish outstanding race and full-state acceptance. |
| User job cancellation | Backend/UI shipped, #580 remains open. Own pending job only; fence/lease invalidation; retain original question. Finish its broader race/recovery acceptance. |
| GDS adoption | 6.8.0 from npmjs, one provider; new audited controls use GDS. The workspace still has legacy screens. `test:gds-audit` certifies only its explicit protected scope; it is not whole-product compliance. #574 remains open. |
| Source manifest | 16 entries / 88 currently enumerated product sections, 12 original sources unavailable, complete=false. Source integrity passes, full source parity does not. #573 remains open. |

The current source gate intentionally fails `node scripts/verify-source-content.mjs --require-complete`. The missing originals include the TTM mental coach guide, CogLeague reports, CogMap attribute/detailed/position/terminology guides, data-to-soccer guidance and masterclass material (`HBG-C001`, `C004`, `C006`–`C015`). Obtain the actual files and review/rights evidence from the owner. Do not fabricate missing sections, norms, scoring or approval receipts.

## 10. Remaining work and execution order

The original audit has **35 issues: 2 closed, 33 open** at this snapshot. #607 is a separate completed production fix. The board's native dependencies and each issue's embedded acceptance criteria are authoritative; do not infer completion from the number of commits or a partial implementation.

| Track | Open issues / expected outcome |
| --- | --- |
| Foundations | [#573](https://github.com/moldovancsaba/habi/issues/573) original source inventory/rights; [#574](https://github.com/moldovancsaba/habi/issues/574) GDS; [#575](https://github.com/moldovancsaba/habi/issues/575) human-reviewed held-out quality |
| Finish already shipped partials | [#576](https://github.com/moldovancsaba/habi/issues/576), [#577](https://github.com/moldovancsaba/habi/issues/577), [#578](https://github.com/moldovancsaba/habi/issues/578), [#579](https://github.com/moldovancsaba/habi/issues/579), [#580](https://github.com/moldovancsaba/habi/issues/580): attempt/correction/cancellation acceptance, including races and UI states |
| Support and evidence | #582–586: dependent-evidence invalidation, exact-answer handoff, coach queue, disputes and durable concern handling |
| Knowledge and navigation | #587–591: immutable reviewed activation, actual retrieval, paginated library, source guide explorer and discoverable player journeys |
| Context and useful support | #592–594: exact displayed chart context, response planning for changes/repeats, reviewed recommendations and outcome feedback |
| Reports | #595–596: original PDF/field/glossary/explanation journey and reviewed import/export |
| Privacy and recovery | #597–600: scoped request intake, data copy, restriction/erasure execution and erasure-aware restore |
| External knowledge | #601–603: release/budget ledger, bounded transport and review UI; do not activate deferred outbound scope casually |
| Conditional programmes | #604–605: require commissioned, reviewed curriculum/source evidence before activation |
| Final proof | #606: source-to-outcome role/browser verification, blocked by incomplete deliveries |

Start by reproducing the baseline and reviewing the already implemented R1 acceptance gaps; avoid rebuilding those features in parallel. Obtain the missing source files and define the human review process early. Follow native blocker relationships before releasing dependent work. Use [the audit](docs/missing-functions-audit-2026-11-01.md), [delivery plan](docs/delivery-plan-2026-11-01.md) and [implementation checkpoint](docs/audit-implementation-2026-11-01.md) as historical context; the latter predates the timeline and invitation fixes.

Privacy/retention/controller documents under [docs/policies](docs/policies) are explicitly **drafts**, not approved governance. Production bootstrap also references draft policy IDs. Confirm the actual owner-approved policy, source rights, provider handling and backup/restore responsibilities before expanding personal-data processing. The export/erasure/restore backlog is not a completed compliance capability.

## 11. Release, migration and recovery procedure

1. Inspect current `main`, working tree, CI and issue acceptance. Use a reviewable PR/release path. Recent owner-authorised direct pushes reported bypassed PR/`CI / web` rules; the actual active checks now live in `Contract integrity`. Reconcile branch protection/check names with the repository owner rather than treating a successful push as acceptance.
2. Run the relevant regression/role/browser tests and required lint/types/build. UI changes need GDS and accessibility evidence; API-only changes need an explicit consumer/error contract.
3. Update domain/API schemas and their digest manifests when their bytes/contracts change. Applied migration files are immutable: add a forward migration and its checksum rather than editing an applied one.
4. Registered migrations are currently **001–022**. Latest: 020 durable attempts, 021 correction lineage, 022 timeline indexes. Some routes ensure selected prerequisites lazily; full registration does not prove every production migration was applied. Inspect receipts through authorised operations.
5. Local migrate/seed/reset scripts are test-only. The existing authorised `/admin` bootstrap can run registered production migrations, but also verifies/updates the `habi` tenant with its configured policy references. Review that code/state before using it as a migration shortcut; a distinct reviewed production migration/backup path remains an operational concern.
6. After deployment, confirm Vercel READY for the **exact commit**, `habigoal.com` alias target, health/readiness and appropriate anonymous denials. Add authenticated acceptance separately; do not describe anonymous health probes as role-workflow verification.
7. Coordinate worker changes with the live operator. For API/worker contract changes, preserve deployment ordering and backward readability; no worker restart is needed for documentation-only changes or the latest invitation fix.
8. Record evidence/limitations on the issue and project item. Close only met acceptance; keep partial/deferred work open.

Timeline cursors are v2, opaque, signed, viewer/filter-bound and thirty-minute limited. On 410 `CURSOR_EXPIRED`, discard accumulated pagination and restart without a cursor. Query-budget 503 is not empty history. See [timeline recovery](docs/timeline-pagination.md).

Rollback generally redeploys the previous compatible app and retains additive indexes/history/receipts. Reconcile uncertain writes through the same idempotency key or a saved-state read. Do not delete corrections, answers, tombstones or legitimate SSO grants as rollback. No verified full production restore drill is asserted by this handover.

## 12. Transfer acceptance checklist

- [ ] Incoming maintainer can access GitHub, board/Actions, Vercel and the approved Atlas/SSO operational surfaces.
- [ ] A clean clone installs from npmjs and passes the local synthetic setup/quality checks.
- [ ] The current production SHA, CI and health evidence have been rechecked at takeover time.
- [ ] Invitation/role access has been checked using the maintainer's authorised account or an owner-approved test identity.
- [ ] A named operator owns the live Mac worker; its secure configuration, scanner maintenance and any host move are accounted for.
- [ ] Secret transfer/rotation, backup ownership and incident contacts are agreed outside the repository.
- [ ] Missing originals/rights/review receipts and the held-out human quality review have explicit owners.
- [ ] The next issue is selected from actual dependency/readiness state, with a concrete acceptance case and no blanket claim that prototype parity is complete.

For a short starting sequence: read this document → reproduce setup → read #576–580 and their current evidence → confirm missing-source/quality-review ownership → select the next unblocked issue from the board.
