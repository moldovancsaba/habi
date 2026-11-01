# Audited delivery implementation — 2026-11-01

This is an implementation checkpoint for the [delivery board](https://github.com/users/moldovancsaba/projects/14), not a declaration that all 35 issues or prototype parity are complete. The original audit and delivery plan remain the scope of record.

## Package distribution and design system

The user selected **npmjs** as the GDS distribution channel. `.npmrc` routes the `@sovereignsquad` scope to `https://registry.npmjs.org`; GDS and its tools are pinned to **6.8.0** with npmjs lockfile URLs and integrity hashes. A clean `npm ci --ignore-scripts` succeeds without a registry token. GitHub Actions and Vercel need no GitHub Packages credential for this setup. Do not reintroduce a token requirement from older installation documentation.

One root `GdsProvider` supplies Hungarian locale and the published Gold Athlete theme. New assessment and record-correction controls use published GDS components. Contextual/global AI entry and cancellation also use GDS. The legacy global stylesheet is isolated in a cascade layer; its source bytes remain unchanged.

`npm run test:gds-audit` runs the official compliance scanner plus a guard on the three new assessment/correction/provider files. It reports other findings separately. **Existing workspace screens still contain legacy controls; whole-product GDS compliance is not achieved.** Browser checks also use the official GDS axe and contrast tools. Essential explanatory text uses GDS body typography because the published dimmed description styling failed contrast in the actual light theme.

## Contract integrity — #572

`npm run test:api-coverage` compares every operation in API contract **2.5.2** against statically discovered route method exports. `contracts/api-operation-dispositions.json` classifies implemented, replacement, pending and deprecated operations with reasons and issue ownership. Missing handlers, false implemented claims, duplicate operations and broken/cyclic replacement links fail verification. Routes are parsed without executing server code. Handler existence is not business acceptance; explicitly pending operations are not advertised as available.

The contract-integrity workflow installs from npmjs and runs API coverage, source integrity, scoped GDS compliance and their focused tests on pushes and pull requests. It uses read-only repository permissions and no registry secret.

## Source evidence — #573

`contracts/source-content-manifest.json` pins available content bytes and section-to-product mappings. `npm run test:source-content` detects modified bytes, unsafe paths and unsupported approval claims. `node scripts/verify-source-content.mjs --require-complete` is the stricter parity gate and intentionally fails while originals are missing.

The currently enumerated product sections are not proof that every original guide, definition, position report or masterclass has been delivered. Original documents remain explicitly unavailable; rights/review status is not fabricated. Source location is still required to finish the original-document comparison.

## Durable assessment attempts — #576 / #577

Runtime: coach selects a topic and context → POST player assessment-attempts → each answer or explicit skip is persisted → complete or interrupt. Reads expose the saved attempt and its submitted answers. Completion creates exactly one ordinary coach observation linked to the attempt. Existing final-only observations remain readable.

New routes:

- `POST /api/v1/players/{playerId}/assessment-attempts`
- `GET /api/v1/players/{playerId}/assessment-attempts` (latest 100)
- `GET /api/v1/assessment-attempts/{id}`
- `POST /api/v1/assessment-attempts/{id}/answers`
- `POST /api/v1/assessment-attempts/{id}/complete`
- `POST /api/v1/assessment-attempts/{id}/interrupt`

Every write uses the existing authenticated command boundary, CSRF protection, idempotency receipts and revision comparisons. The creator coach can write; other eligible coaches can read. Repeated delivery of the same command does not append another answer or result. Completion requires explicit answers/skips for all items. Attempts expire after four hours; late writes persist expiration and do not add answers. A route departure preserves submitted answers but does not automatically interrupt the attempt. Reload shows its history; resuming unfinished attempts is not included. History beyond the newest 100 remains an explicit limitation.

The UI retains entered fields on failure, shows saved status through a live region, supports keyboard answer submission and focuses the next question. Interrupting retains previously submitted answers and permits a new attempt. Unsubmitted typing is not presented as saved history.

## Immutable corrections — #578 / #579

`POST /api/v1/players/{playerId}/records/{id}/corrections` accepts an expected revision, a reason and replacement text with optional occurrence date/time zone. Only the original author in the original role may correct diary/observation records. A correction inserts a new record with `supersedesId`; it never overwrites original text. Read DTOs expose lineage and correction reason. A unique successor index prevents competing forks; stale or competing commands return `REVISION_CONFLICT`. Idempotent retries return the original receipt.

The GDS correction flow is available on the author's journal cards **and coaches' own observation cards**. It preserves failed drafts and explains that both versions remain. Corrections enter the timeline as `record.correction`. Superseded records remain readable but are retired from current AI profile/context facts. Existing parent publication grants remain revision-specific: a corrected coach observation is not automatically shared with parents. Downstream answer/plan invalidation and full dependency review remain #582, not completed by this change.

## Cancellation — #580

`POST /api/v1/jobs/{id}/cancel` takes `expectedRevision`. Only the requesting actor in the requesting role can cancel supported AI jobs for the authorized player. Cancellation increments revision and fencing token, clears the lease and records `USER_CANCELLED`. Late worker results cannot commit against the old fence. The question remains in history. Other coaches can observe the conversation but cannot cancel another person's job. If completion/review already won the race, the API returns its actual terminal state and preserves the answer.

The AI transcript exposes a GDS stop control only when the server returns an own cancellable job. Cancellation is described as a user stop, without the generic generation-failure retry prompt. Cancelling a job does not promise to undo a request already transmitted to an external model.

## Held-out conversation gate — #575

`worker/evaluations/heldout/cases.json` contains synthetic multi-turn cases covering corrections, repeats, changed preferences, conflicting roles/dates, missing chart answers, unknown report methodology and authored pain guidance. Cases are distinct from the original example conversation.

```sh
PYTHONPATH=worker python3 worker/evaluations/heldout/gate.py replay --output /tmp/habi-heldout.json
PYTHONPATH=worker python3 worker/evaluations/heldout/gate.py review-template --results /tmp/habi-heldout.json --output /tmp/habi-review.json
PYTHONPATH=worker python3 worker/evaluations/heldout/gate.py score --results /tmp/habi-heldout.json --review /tmp/habi-review.json --output /tmp/habi-score.json
```

Replay is offline by default. Explicit `replay --live` uses the configured existing service with test request purpose; it does not select a stronger model. Review is bound to fixture and results digests and requires an identified human, complete turn coverage, explicit factual/role/date/safety/repetition judgments and usefulness/naturalness scores. Zero critical failures and at least 90% fully useful/natural turns are required. Missing review, missing answers, changed digests and offline-only runs return `NOT_ACCEPTED` (exit 2). Passing worker unit tests or reaching the endpoint is not Hungarian language acceptance. Actual selected chart/report snapshot retrieval is still separate work.

## Operations, migration and recovery

Migrations **020-durable-assessment-attempts** and **021-record-correction-lineage** extend validators and add history/unique-lineage indexes. Their source checksums are pinned. Relevant new routes ensure their selected migration before use; normal full database migration also includes them. They are additive; no original records are deleted or rewritten.

Use the existing structured command receipts, activity ledger, job reason codes and worker fencing for investigation. Avoid copying player text or credentials into logs. Cancellation does not require a worker configuration change. No live model or provider settings are changed by this batch.

On release failure, roll the application back to its previous deployment and retain additive database documents/indexes. Do not delete submitted answers, correction records or command receipts as rollback. A previous build ignores new attempt fields; corrected originals remain available. Resolve a migration checksum/index conflict before retrying; do not edit applied migration bytes. A network failure after submission is ambiguous: retry the same command/key, or reload the saved state before issuing a different command. No automatic retry creates a fresh logical command.

## Remaining delivery boundaries

Stable merged-timeline pagination (#581), downstream invalidation, human handoff, safety handling, active knowledge retrieval, full guides, chart/report context, conversational recommendation improvements, privacy operations and external consultation remain tracked in their individual issues. Conditional programme work still needs source/authority evidence. This batch does not close those gaps or claim full prototype parity.

## Verification checkpoint

- `npm test` with `.env.test.example`: **264 passed, 0 failed, 0 skipped**, localhost replica-set integration included.
- `PYTHONPATH=worker python3 -m unittest discover -s worker/tests`: **119 passed**.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- API disposition integrity: **114 operations**, 98 handler implementations, 3 replacements, 6 pending, 7 deprecated; no integrity errors. These counts are not a feature-completion score.
- Source inventory: 16 entries / 88 currently enumerated sections; 12 original sources unavailable; parity remains incomplete.
- Scoped official GDS compliance: no findings in the three protected new-flow files. Other/legacy findings remain outside that claim.
- Authenticated synthetic browser on a 390px viewport: authored correction saves a linked replacement and leaves original text readable after reload; keyboard submission and interruption retain the assessment answer after reload; queued AI cancellation from the metro conversation retains the question and returns `USER_CANCELLED`.
- Official GDS axe scan of the resulting assessment screen: **no violations reported** at the moderate-or-higher threshold; GDS contrast gate passed. No browser exceptions or horizontal overflow in this flow. This is not a whole-product accessibility certification.
- The 19-turn held-out offline replay plus an unfilled review correctly returns **NOT_ACCEPTED**. No live language-quality pass or human acceptance is claimed.

Browser checks used only the isolated `habi_audit_acceptance_test` database and synthetic actors. Production deployment/SHA verification is recorded separately in the associated issue updates.
