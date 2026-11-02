# Timeline pagination and recovery

Delivery issue: [HABI-AUDIT-34 / #581](https://github.com/moldovancsaba/habi/issues/581). API contract: **2.5.3**. This change owns the existing read API and its consumer contract; it introduces no screen, athlete scoring, model change or player-data mutation.

## Runtime and ordering

`GET /api/v1/timeline` authenticates the current session and uses the existing tenant/player/role visibility rules. Authorised source readers project **events**, rather than sampling parent documents first. Each source applies its time bounds, cursor boundary, visibility and kind filter before its limit. The reader then merges the source heads, takes the next page plus one, and hydrates only their bounded references.

The descending key is `(event submittedAt, public event ID, source name)` under binary/simple ordering. Mongo `_id` is never a cursor key. The source tie-breaker also disambiguates equal public IDs across collections without changing existing node IDs or response shape. Do not substitute locale-aware JavaScript sorting for Mongo's simple ordering.

For each source, at most the first `limit + 1` eligible events can contribute to the next global `limit + 1` events. Therefore taking that many from every source before merging cannot omit a global page candidate. Bounds are strict and precede the source limit, including equal-timestamp IDs. This removes the previous 100/200-document cutoffs.

AI questions use their creation time; answers use completion time; failed/cancelled outcomes use the job outcome time. Plan current states and operational documents use update time, while each plan decision uses its own decision time. An answer/decision remains discoverable inside the requested window even when its parent was created months earlier. Original resource, process, reply and derivation references remain intact.

Current canonical resources suppress only the matching revision's activity-ledger row. This deduplication occurs against the scoped database before limiting, rather than against the page's incidental sample. Prior ledger transitions remain available on later pages. Missing collections contribute no events; a dependency error is not treated as a missing collection or empty history.

## Filters and visibility

The player retains player-direct records and authorised check-in results. Parents retain directly shared records, exact currently active publication grants, visible messages and eligible interpretations. Coaches retain tenant-scoped observation of all participant roles, operational activity and decisions. Other participants' private AI conversations remain outside a non-coach viewer's scope. Current publication visibility is checked again during bounded hydration.

Most kind filters are pushed directly into the source query/projection. Hungarian AI message categories use the same `messageUnderstanding`-based classifier as rendering. Their reader walks bounded keyset batches of 100 until it has a full eligible source head or exhausts the source; it never guesses a second Mongo-specific language classifier or treats the newest nonmatching sample as complete history.

## Cursor contract

Version **2** tokens are signed and bind actor ID, role, tenant, player, access revision, kind, normalised from/to, snapshot cutoff, total-order position and a fixed thirty-minute expiry. A continuation does not extend its expiry. Cursors are opaque to consumers and are never logged with player content.

- Malformed or altered signatures: `INVALID_INPUT` / HTTP 400.
- Older cursor version, expired cursor, changed viewer/access/filter/window: `CURSOR_EXPIRED` / HTTP 410.
- A selected projection that changes before hydration can be rendered: `CURSOR_EXPIRED` / HTTP 410, rather than an invented historical value or unexplained short page.
- Database query timeout/sort-memory exhaustion, or sparse-classification scan budget exhaustion: `DEPENDENCY_UNAVAILABLE` / HTTP 503 with `Retry-After: 1`.

On **410**, consumers discard the old accumulated pagination and request the first page using the same filters **without `cursor`**. Reloading the existing workspace performs that first-page read. This backend change does not add a new rendered automatic-recovery interaction. On **503**, retry the same read after the indicated delay within the consumer's existing bounded retry policy; do not display empty history as success. All responses retain the existing private/no-store and structured error boundary with request ID.

The snapshot is a signed **event-time and source-creation cutoff**, not a historical database transaction or a cache of old permissions. Sources created after it are excluded even if an event time is backdated. Legacy documents without `createdAt` use their existing event time. Updates/withdrawals are read in their current authorised state; no earlier revision or withdrawn permission is reconstructed. Events newly written after the cutoff become available on a fresh first-page read.

## Bounds and indexes

There are at most fifteen event sources for a coach and fewer for other roles. At most four source aggregations run concurrently. Ordinary sources return at most `limit + 1` event candidates each (public limit 1–50); hydration uses only the chosen page plus one. Each source query and hydration read has `maxTimeMS: 1500`; aggregation disk spilling is disabled. Sparse language-category scanning is capped at 128 batches and six seconds for that source. Reaching a budget returns explicit 503, not partial successful traversal. These are operational bounds, not an unmeasured latency SLA.

Migration **022-stable-timeline-order** adds non-unique `(tenantId, playerId, time DESC, id DESC)` indexes for check-in results, messages, follow-ups, interpretations, AI turns and profile events. Existing `record_timeline` and `event_timeline` already provide that order. The route ensures this selected migration; the ordinary migration runner also includes it. No domain document/schema backfill occurs and applied older migrations are not edited.

Simple timestamp streams use indexed keyset queries. Computed multi-event streams still project/sort within the selected tenant/player before their bounded output; they can hit the explicit query budget on very large histories. Such failures are surfaced for investigation rather than silently dropping older events. A future persisted event projection would be a separate measured optimisation, not a claim made by this change.

## Verification and CI

Run against an explicitly isolated localhost replica set:

```sh
set -a
source .env.test.example
set +a
node --test tests/timeline-question.test.mjs
npm test
npm run test:api-coverage
npm run lint
npm run typecheck
npm run build
```

Tests create uniquely named `_test` databases and drop only those databases. The timeline tests now use real Mongo rather than an in-memory imitation that could not exercise aggregation bounds. Coverage includes the existing 245-record case, 650 equal-timestamp records, 380 mixed-source projections, old parent/new outcome windows, kind filtering with sparse Hungarian feedback, actor/role/tenant/player/access/window binding, old/tampered/expired cursors, missing collections, publication withdrawal, later/backdated arrivals, equal IDs across collections, query fanout/index use and explicit timeout errors.

The first focused local run on the existing localhost replica set measured **12 ms** for a 13-item native page, **15 source queries**, at most **14 rows returned per source**, and **27 record documents examined**. These are reproducible test diagnostics for that environment, not production timing or a language-quality result. Full current application regression: **275 passed, zero failed or skipped** before release verification; exact CI/release evidence is attached to #581.

GitHub Actions also runs the entire application suite against an ephemeral `mongo:8` replica set on loopback, then lint/types/build. Bootstrap accepts only GitHub CI and a fixed local address; it cannot use production connection strings. The workflow removes the container afterwards and has a ten-minute job timeout. The independent contract/source/GDS integrity job remains in place. All packages continue to install from npmjs without package-registry credentials.

The database regression job pins the Ubuntu 22.04 runner lane. The first remote runs exposed MongoDB's explicit startup refusal on the newer `ubuntu-latest` kernel; [MongoDB SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912) describes the 6.19+ incompatibility. The [current official 22.04 runner inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Readme.md) uses the 6.8 kernel lane. Revisit this runner pin before its announced retirement or when a newer Mongo/kernel pairing has been verified. Startup retries create a fresh driver client after a failed connection, and CI preserves database startup diagnostics on failure.

Authenticated localhost acceptance also traversed all **650** equal-time records through **29 HTTP pages** (page size 23), checked private/no-store, changed-filter 410 and first-page recovery, and verified anonymous 401. The existing 390px mobile timeline reached all 650 records with **12 load-more actions**, no duplicate event rows, no browser exceptions and no horizontal overflow. Its unique synthetic database and test server were removed afterwards. No new UI was introduced and no whole-product accessibility certification is claimed.

## Operations and rollback

No configuration secret, worker restart or provider change is needed. The existing `timeline.read` API boundary reports request ID, status, duration and content-free failures/slow requests. Investigate repeated 503s by source/index/execution stats without copying questions, notes, report contents, tokens or cursor payloads into logs. Do not repeatedly increase timeout limits to hide a scan regression.

Recovery drill: an old signed v1 continuation returns 410; a first-page request without that cursor succeeds. A withdrawn publication between pages is omitted on the next read, without inventing a replacement event. A simulated Mongo time-budget failure returns explicit retryable 503.

Rollback redeploys the prior application. Retain the additive indexes and migration receipt; no history deletion or schema reversal is needed. Rollback also changes cursor semantics, so discard old accumulated pagination and start without a cursor. Never translate a token by assuming that the old source cutoffs were complete. This issue does not complete the remaining source-guide, AI quality, privacy, handoff or broader prototype-parity backlog.
