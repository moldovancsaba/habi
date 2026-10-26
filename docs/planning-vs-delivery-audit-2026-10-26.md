# Habi planning-to-delivery audit

**Audit date:** 2026-10-26  
**Product:** Habi  
**Historical planning evidence:** the user-supplied `2026-10-26_Rendszertervézés_AI_kapcsolattal_6adf1d4d.zip`  
**Current repository evidence:** Habi `main` at `1917d84` (`Record Habi MVP production verification`), clean and aligned with `origin/main` at the time of review.

## Executive finding

The delivered application is a real, live, deliberately narrow **browser-owned Habi MVP**. It is not the full multi-person, report-processing and local-AI system described in the archived planning package. The production site now has an interactive daily check-in, saved journal/history, and a small practice library. It uses the existing browser-owner cookie and `habi_states` data path. The production page and health endpoint returned HTTP 200 during this audit; the page included the new “Ma / Napló / Gyakorlatok” UI.

This is a material scope gap against the archived target, but not evidence that the shipped MVP is wholly broken. The later delivery decisions narrowed the immediate goal: bring up the new Habi product, keep the existing Habi records, and use the existing browser-owned access model while SSO is deferred. That explains the MVP choice. It does not make the broader role-based and local-AI workflow complete.

**Judgment:** the current release is suitable to describe as an accessible production MVP for one browser profile. It is not ready to describe as the planned family/team product, a cross-device service, or a production AI/report system. A green root page, health endpoint, and local synthetic workflow do not prove those larger capabilities.

## What the archive records

The ZIP is historical evidence, not an instruction set. Its curated Habigoal documents include `docs/04-decisions.md`, `docs/10-local-system.md`, `docs/12-backend-architecture.md`, `docs/13-data-contracts.md`, `docs/14-runtime-delivery.md`, `docs/16-external-ai-learning.md`, `docs/17-role-workflows.md`, and `docs/06-build-log.md`. The raw conversation ends on 2026-10-25, so it does not contain the later Habi production cutover decisions from this delivery thread.

The final archived planning direction included:

- Three product roles: player, parent, coach; two authorized parents and coaches with the specified equal standing and visibility rules.
- DoneIsBetter SSO for identity, with product roles and player/tenant memberships enforced by Habi.
- A durable, permission-filtered timeline; daily check-ins with immutable feedback snapshots; separately attributed parent/coach observations; coach-material versioning and exact-revision publication.
- Parent questions answered by an evidence-grounded local worker, explicit coach-assistance requests, accepted plans and follow-up.
- Report upload, quarantine/malware scan, field extraction and human review.
- A local Mac worker using the existing Ollama setup, with no direct worker-to-Atlas connection and no personal-data cloud AI fallback.
- Consent, purpose, retention/deletion, safeguarding, source rights, review and recovery controls before a personal pilot.
- A unified metro-line visual language, Hungarian interface copy, accessible responsive behavior, and historical records that are not regenerated from current logic.

The archived records themselves repeatedly distinguish design and implementation: they say the planning documents do not prove a deployed backend, SSO, database, worker, legal approval, or personal pilot. Their dated build log documents prototype work and local synthetic checks; it must not be read as proof of the present production application.

## Current delivery evidence

| Area | Current evidence | Audit result |
|---|---|---|
| Product entry point | Production `https://habi.doneisbetter.com` returned HTTP 200 and served the new Habi page with Ma, Napló, and Gyakorlatok markers. `/api/health` returned `{"ok":true,"service":"habi"}` with HTTP 200. | **Delivered and live** for the MVP entry point. Health is a liveness check, not proof of data, identity, or worker readiness. |
| Daily check-in | `src/app/habi-home.tsx` presents seven legacy-catalog questions, allows unanswered questions, and saves completed responses through `/api/app`. | **Delivered** as a browser-owner feature. The archived role workflow's five-area check-in contract and its preserved completion snapshot are not demonstrated by the current production UI. |
| Journal and persistence | `src/app/api/app/route.ts` reads/writes `habi_states` under a hash derived from the browser's HttpOnly owner cookie, with revision conflict handling. Production target is the existing `habi` database; no role/actor import or schema migration was performed for this MVP. | **Delivered** for the same browser cookie. **Not account-based, cross-device, or family-shared.** The verification browser profile did not contain the owner's earlier cookie and showed no prior entries; this does not prove that the owner's records are missing. |
| Practices | Five versioned, non-clinical practice entries are available in the MVP. | **Delivered**, but only this small subset of the older product's content. |
| Offline/edit recovery | The UI retains dirty local changes and indicates pending synchronization; revision conflicts ask for refresh rather than silently overwriting server data. | **Partially delivered**; the recovery experience is intentionally limited and has not been validated under real user network interruption in Production. |
| Role-based API | The repo contains many role-scoped API routes and a local synthetic acceptance suite. Current README and verification record state that these APIs remain fail-closed in Production. | **Code and local acceptance exist; hosted role workflow is not delivered.** |
| AI worker | `worker/` contains a local worker path. The repository's prior verification records synthetic localhost jobs with local Ollama and a `no_evidence` outcome. The current production UI does not invoke this workflow. | **Not connected to the live MVP.** Local synthetic job completion is not proof of hosted identity, personal-data safeguards, production reliability, or useful answer quality. |
| Report processing | Repository code/contracts cover upload, quarantine, scan, extraction and review paths; prior verification describes a synthetic local workflow. | **Not available in the live MVP.** No production report upload or processing was proven in this audit. |
| SSO and membership | SSO helper code exists, but the login button/callback and request authorization are not enabled as a working hosted sign-in flow. | **Not delivered.** No cross-device identity or multi-person authorization. |
| Product breadth | The current UI exposes check-in, journal/history, tasks attached to check-ins, and practices. | **Large legacy-feature gap:** trends, monthly review, guided conversations, player/adult shared timeline, report library, full practice journeys, personal goals and several support flows are not in this MVP. See `docs/legacy-feature-migration.md`. |
| Quality evidence | The current verification record reports a local browser → API → isolated Mongo round-trip and passing lint/typecheck/build; `npm test` reported 90/91 with one existing Atlas integration test skipped. | **Useful but bounded.** No Production write was performed; no live SSO, role workflow, AI job, report flow, or personal-data pilot was verified. |

## Gap register

Priority is based on the archived target and the consequence of claiming that target is delivered. It does not change the narrower MVP's present scope.

### P0 — Identity and data access model

**Target:** each player, parent, and coach sees only the records permitted by verified identity, membership, role, and current consent.  
**Actual:** the live MVP resolves records by a browser-cookie hash. A different browser/device has a different owner key. There is no SSO callback and no Production actor/membership authorization.  
**Consequence:** users cannot reliably access their own records across devices or share them with their family/coaches; a cookie loss cannot be mapped back to a person. The MVP must not be represented as the planned family/team service.  
**Closure evidence:** isolated hosted environment; working SSO callback/session; server-side membership checks on every protected route; positive and negative access tests for two families and multiple roles; recovery/logout/revocation verification; no leakage across tenants.

### P0 — Scope and release claim clarity

**Target in archived plan:** persistent end-to-end role workflow plus local AI and report processing.  
**Actual:** browser-owned MVP. The repository has local-only role-workflow code, but the live app does not expose it.  
**Consequence:** documentation or stakeholder updates that say “the Habi system” or “the AI workflow” is live can overstate what users can do.  
**Closure evidence:** maintain explicit MVP/product status in README, user guide, deployment notes and release communication; graduate each workflow only when the hosted end-to-end evidence below passes.

### P1 — Local AI workflow in the product

**Target:** parent asks about authorized sources, local worker retrieves evidence, answers with source references or safely returns `no_evidence`, and records review/coach-help states.  
**Actual:** worker and workflow code have synthetic localhost evidence; no AI interaction is present in the current live UI or verified against the current production data/auth path.  
**Consequence:** the primary planned explanation capability cannot be used by a family or coach. Synthetic model smoke tests only prove that a local test job can run.  
**Closure evidence:** connect authenticated UI → durable job → Mac worker → evidence manifest → result/review → reloadable history in an isolated hosted environment; test model unavailable, internet unavailable, worker offline, timeout, stale lease, no evidence, cancellation and retry. Confirm personal context never leaves the approved local boundary.

### P1 — Report intake and human review

**Target:** authorized report upload, quarantine and malware scan; extraction with evidence locations; manual field review; only reviewed fields used in explanations.  
**Actual:** contracts and local synthetic implementation exist, but there is no live report flow or production acceptance proof.  
**Consequence:** no real provider report can enter the planned explanation workflow safely.  
**Closure evidence:** hosted isolated test with synthetic PDFs, rejected/malicious/oversized files, scanner outage, extraction errors, per-field review, download authorization and deletion/retention behavior; no real youth reports until governance gates are complete.

### P1 — Consent, retention, deletion, safeguarding and data rights

**Target:** documented authority, purpose, recipient, permission scope, retention and revocation; safeguarding and data-request procedures; source/use rights for report and practice content.  
**Actual:** the archive says these are prerequisites/open implementation work. The current cookie-owned MVP does not provide the role-level consent, revocation, audit or data-request lifecycle.  
**Consequence:** the planned personal-data pilot cannot be considered ready merely because the UI and local tests work.  
**Closure evidence:** owner-approved accountable party and policy, implemented consent/revocation/retention/deletion/audit behavior, restore and deletion proof, and documented safeguarding escalation. This audit does not infer legal approval.

### P1 — Check-in contract and safety semantics

**Target:** the planning log describes a five-area player check-in and immutable daily result snapshot; earlier legacy data uses a different seven-question catalog that includes pain.  
**Actual:** the current UI reads the legacy seven-question catalog.  
**Consequence:** the MVP preserves the older shape but does not establish equivalence to the accepted five-area workflow; especially, the pain answer's safe handling and its relation to the five-area instrument are not proven by the current verification record.  
**Closure evidence:** make and record the product decision on compatibility/mapping; add versioned definitions, immutable snapshot tests, partial completion and explicit pain/safeguarding behavior. Never silently reinterpret legacy records.

### P1 — Existing Habi features and data migration

**Target:** retain useful legacy behavior while moving to the new system.  
**Actual:** only the journal/check-in slice and five practices are present in the new UI; the migration matrix lists substantial features as not yet migrated. Existing state stays in the old browser-owner schema.  
**Consequence:** users may mistake the new app for a full replacement and not find prior workflows. Old data has no identity mapping into the future role model.  
**Closure evidence:** feature-by-feature owner disposition (migrate, retire, or keep separate), compatibility specifications, identity mapping rules, dry-run/import counts and rollback plan; no inferred ownership assignment.

### P2 — End-to-end hosted, recovery and accessibility proof

**Target:** verify real browser-to-API-to-database-to-worker behavior, retries/recovery, accessibility, and operational clarity.  
**Actual:** Production root and health are live; the MVP data round-trip was exercised locally with synthetic data. The broader workflow checks are localhost-only. The 90/91 test result includes one skipped Atlas integration test. The audit did not run a Production write, screen-reader test, physical-device test, or extended offline/reconnect scenario.  
**Consequence:** availability of the site is proven, while complete user-flow reliability and accessibility conformance are not.  
**Closure evidence:** a dedicated hosted test stack and synthetic account; browser/API/data/worker traces; retry and recovery checks; keyboard and screen-reader walkthrough; supported viewport and zoom matrix; operational dashboard/log states.

### P2 — Operational observability and support

**Target:** distinguish service availability from database readiness, worker availability, AI/model availability, queued/blocked jobs, evidence failure, and user-visible completion.  
**Actual:** the production health endpoint proves the app responds. The browser-owned MVP has save/sync state, but no production worker/job surface.  
**Consequence:** a 200 health check must not be treated as proof that extraction, model inference, or delivery works.  
**Closure evidence:** separate readiness and worker/model checks, correlated redacted events, queue age and blocker reporting, user-safe retry states, and alert runbooks, validated with induced dependency outages.

## Deliberate divergence versus unfinished work

### Deliberate for the current MVP

- Existing `habi` browser-owner records were retained in place instead of being assigned invented player/parent identities.
- SSO and family/team sharing were deferred; the MVP stays on the pre-existing browser cookie ownership path.
- The Production UI was changed to a direct, usable Habi app rather than leaving the user on the old prototype-facing landing/endpoint.
- The release contains no visible AI feature, avoiding an unsupported implication that a local synthetic worker is connected to live personal data.

### Still unfinished against the archived target

- SSO callback and membership-based access control in a hosted environment.
- Production role workflow and shared history.
- Production Mac worker connection to durable hosted jobs, with the exact local-only personal-data boundary maintained.
- Report intake, extraction review, evidence-grounded answer and coach-assistance lifecycle.
- Consent, retention/deletion, safeguarding and source-rights implementation.
- Feature migration/disposition and any safe mapping of old browser-owned data to future identities.
- End-to-end hosted acceptance and broader accessibility/operational evidence.

## Historical-document caveats

1. The ZIP contains a documentation snapshot and raw conversation only through 2026-10-25. The latest archived planning note says many items are planning, not implementation. The later Habi production MVP decision is evidenced by the current repository and delivery history, not by this historical plan.
2. The archive contains old decisions and earlier prototype status statements superseded by later entries within the archive. Use dated decision/build-log entries, not the first paragraph in a document, as the historical sequence.
3. The current repo's `docs/verification.md` deliberately preserves older localhost and pre-cutover records. Its top dated sections and the production verification record are the evidence for the current shipped state; older statements such as “domain remains on the old app” are historical, not current.
4. Local synthetic tests establish implementation behavior only in their stated environment. They are not proof of a hosted role workflow, real identity, legal compliance, report interpretation quality, or personal pilot readiness.

## Recommended closure order

1. **Freeze the claim and scope:** keep the current product described as browser-owned MVP; make the five-versus-seven check-in decision explicit.
2. **Prepare isolated hosted acceptance:** synthetic-only account/data and a separate test environment; prove the actual browser/API/database path before enabling any role route.
3. **Complete identity and authorization:** SSO callback, actor/membership provisioning, session issuance/revocation and route-level access tests.
4. **Deliver one vertical workflow:** check-in snapshot → attributed observations → parent evidence question → local worker result or `no_evidence` → coach assistance/review → permission-filtered reloadable timeline.
5. **Add report intake and governance gates:** quarantine/scan/review, source/evidence trace, consent and deletion lifecycle; only then consider real reports.
6. **Migrate legacy features deliberately:** disposition each row in `docs/legacy-feature-migration.md`; design reversible, identity-safe data import only after ownership rules exist.
7. **Run release-grade verification:** hosted end-to-end, dependency failures/recovery, accessibility, backup/restore, operational alerts, and a documented rollback. Do not use a green build or `/api/health` as a substitute.

## Evidence reviewed

- User-provided ZIP: curated planning docs, `FILES_INDEX.md`, and `conversation_raw.json`; no archived script or HTML was executed.
- Habi `main` at `1917d84`, especially `README.md`, `docs/user-guide.md`, `docs/deployment.md`, `docs/verification.md`, `docs/legacy-feature-migration.md`, `src/app/habi-home.tsx`, `src/app/api/app/route.ts`, and `worker/`.
- Public Production checks on 2026-10-26: `GET https://habi.doneisbetter.com/` → HTTP 200 and new MVP UI markers in HTML; `GET https://habi.doneisbetter.com/api/health` → HTTP 200, `{"ok":true,"service":"habi"}`. No Production data write was made.

