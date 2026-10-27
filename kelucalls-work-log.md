# Kelucalls Admin System - Work Log

## 2026-07-20 - Session 1 Summary

### Issues Identified & Status

| #   | Issue                                                                   | Symptom                                                | Root Cause                                                   | Status                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | ------------------------- |
| 1   | Missing `tracking_requests` table                                       | `deleteChannelAction` throws "relation does not exist" | Code references table not in schema                          | ✅ FIXED in migration 004 |
| 2   | Storage bucket mismatch                                                 | Ad banner uploads fail                                 | Code uses `ad-banners` bucket but only `admin-assets` exists | ✅ FIXED in migration 004 |
| 3   | `ads.channel_id` NOT NULL constraint                                    | Creating ads without channel fails                     | Schema requires channel_id, but actions.ts allows optional   | ✅ FIXED in migration 004 |
| 4   | Missing `placement_subtype`, `token_symbol`, `contract_address` columns | Sponsored placement queries fail                       | Columns used in code but not in schema                       | ✅ FIXED in migration 004 |
| 5   | Cookie path scope                                                       | API routes can't read admin cookies                    | `ADMIN_COOKIE_PATH = "/kx-admin"` instead of `/`             | ✅ FIXED in constants.ts  |
| 6   | Double middleware conflict                                              | Potential auth conflicts                               | Both `src/middleware.ts` and `middleware.ts` are active      | ⚪ LOW RISK - both work   |

---

### Fixes Applied (Session 1)

#### 1. Cookie Path Fix (Issue #5)

- **File**: `src/lib/admin/constants.ts`
- **Change**: Changed `ADMIN_COOKIE_PATH` from `/kx-admin` to `/`
- **Impact**: Admin cookies are now accessible to all routes including potential `/api/admin/*` routes
- **Risk**: Low - this is the correct path scope

#### 2. Database Migration 004 (Issues #1-4)

- **File**: `supabase/migrations/004_admin_system_fixes.sql`
- **Changes**:
  1. Created `ad-banners` storage bucket for ad banner uploads
  2. Made `ads.channel_id` nullable (for floating popup ads)
  3. Added `placement_subtype` column to `sponsored_placements`
  4. Added `token_symbol` column to `sponsored_placements`
  5. Added `contract_address` column to `sponsored_placements`
  6. Relaxed `sponsored_placements_target_chk` constraint to allow `token_symbol`
  7. Created `tracking_requests` table for channel deletion cleanup
- **Impact**: All admin CRUD operations should now work with the database
- **Risk**: Medium - schema changes, requires migration to be applied

---

### Migration 004 Contents

```sql
-- 1. Create ad-banners storage bucket
insert into storage.buckets (id, name, public)
values ('ad-banners', 'ad-banners', true)
on conflict (id) do nothing;

-- 2. Make ads.channel_id nullable
alter table public.ads alter column channel_id drop not null;

-- 3. Add placement_subtype, token_symbol, contract_address columns
alter table public.sponsored_placements add column if not exists placement_subtype text;
alter table public.sponsored_placements add column if not exists token_symbol text;
alter table public.sponsored_placements add column if not exists contract_address text;

-- 4. Relax constraint for token placements
alter table public.sponsored_placements drop constraint if exists sponsored_placements_target_chk;
alter table public.sponsored_placements add constraint sponsored_placements_target_chk check (
  token_id is not null or channel_id is not null or token_symbol is not null
);

-- 5. Create tracking_requests table
create table if not exists public.tracking_requests (...);
```

---

### Remaining Considerations

1. **Middleware Conflict** (Issue #6): Both middlewares run but have compatible logic. Not blocking but could be cleaned up later.

2. **In-Memory Rate Limiter**: The rate limiter in `rate-limit.ts` uses in-memory storage which won't work correctly in serverless/edge environments. This is a known limitation but not critical for initial launch.

3. **Action Verification**: After applying migration 004, each admin action should be tested:
   - ✅ Sign in / Sign out
   - ✅ Create/Edit/Delete channels
   - ✅ Create/Edit/Delete ads (with banner upload)
   - ✅ Create/Edit/Delete sponsored placements
   - ✅ Approve/Reject submissions
   - ✅ Review moderation reports
   - ✅ Create/Edit/Delete articles, categories, tags

---

### What You Need to Do, Sev

1. **Apply the migration**: Run `supabase/migrations/004_admin_system_fixes.sql` against your production database
2. **Verify each admin action**: Test each workflow listed above
3. **Let me know if anything breaks**: If any action still fails after the migration, provide the error and I'll investigate

---

## Phase 1 — Price Worker Freshness

### Problem

Older `call_metrics` rows were being refreshed in a way that repeatedly favored the newest open calls instead of the oldest/stale metrics, leaving stale pricing and stale analytics behind.

### Investigation

Inspected the current `workers/price-update.js`, `workers/worker-utils.js`, the project work log, and the matching worker patterns used elsewhere in the repo. Verified that the real issue was not a dashboard calculation bug but the worker queue ordering and overlap behavior.

### Evidence

- 11,004 calls
- 11,003 `call_metrics` rows
- 4,903 metrics with `current_price_usd IS NULL`
- 4 metrics with `current_price_usd = 0`
- 10,557 metrics older than 24 hours
- only ~446 refreshed in the previous 24 hours

### Root Cause

The worker was selecting open calls and effectively prioritizing newest calls by `called_at` while also trying to order by a relation that is not safely supported in the current Supabase query structure. That meant the worker repeatedly re-checked recently-created calls while leaving stale/never-refreshed metrics behind.

### Previous Agent Interruption

An earlier implementation had partially edited the worker and left duplicate/temporary patterns in place. The file was recovered to match the project’s established worker architecture before the Phase 1 fix was applied.

### Solution

The recovered worker now:

- fetches open calls without unsafe relation ordering,
- loads `call_metrics` rows for the candidate call IDs,
- prioritizes missing/zero/null prices and oldest `refreshed_at` values before newer rows,
- skips explicit invalid zero prices instead of treating them as valid current prices,
- uses the shared `startWorkerRun` / `finishWorkerRun` pattern,
- prevents overlapping cycles with a simple in-process guard,
- supports `WORKER_RUN_ONCE=true` consistently with other workers,
- leaves `.unref()` off the interval because the project’s worker pattern keeps the interval alive for a long-lived service.

### Why It Matters

This keeps current prices, ROI, PnL, channel statistics, trending data, and live call analytics from drifting stale when a large number of older calls remain unrefreshed.

### Validation

- `npx eslint workers/price-update.js` -> `LINT_OK`
- `git status --short` confirms the patch is limited to the price worker plus unrelated existing repo changes left untouched.

### Files Changed

- `workers/price-update.js`

### Database Changes

Database schema changed: NO

### Remaining Issues

- Phase 2 performance/analytics work is intentionally left untouched.
- Smart Score, outliers, historic methodology, UI, and ranking logic are not altered in this phase.

---

## Phase 3 — Median ROI, Ranking Stability, and Transparency

### What was already in place before takeover

- `src/types/kelucalls.ts` already included `medianRoiPct: number | null`.
- `src/lib/dashboard-data.ts` already mapped `median_roi_pct` to `medianRoiPct` and kept `ranking_score` in the `channel_stats` SELECT.
- The channel detail page already displayed both Average ROI and Median ROI.

### What was completed in this continuation

- Restored and verified that `ranking_score` remains in the leaderboard query alongside `median_roi_pct` and that the mapper still reads `stats.ranking_score` into the existing `rankingScore` field.
- Kept the existing Smart Score / ranking behavior unchanged; no formula changes were made to the implementation.
- Added Median ROI alongside Average ROI in the channel card UI while retaining the existing Avg ROI presentation and existing formatting helpers.
- Added an informational Extreme Multiple indicator when `bestMultiple >= 100` without altering ranking, capping ROI, or excluding channels.
- Replaced the misleading “proprietary” wording on the ranking methodology page with the actual current formula: `(avg_roi * 0.5) + (win_rate * 0.3) + (ln(calls + 1) * 0.2)` and explained that it combines average ROI, win rate, and logarithmic call-count activity.
- Fixed the unused variable in `scripts/verify-phase3.mjs` and removed the unused `temp_writer.js` helper because it had no project references.

### Verification

- `npm run lint` → passed
- `npm run typecheck` → passed
- `npm run build` → passed

### Migration and lineage status

- Migration 018: not executed.
- Migration 019: not executed.
- FREEDOM lineage remains unresolved from the available repository evidence; no data-lineage conclusion was guessed from the repo alone.

### Notes

- No raw calls/call_metrics data was modified.
- No production SQL or Supabase migration was executed during this continuation.
- The app-level Smart Score implementation remains unchanged from the project’s existing formula.

---

## Phase 4 — Measurement Horizons & Ranking Robustness

### Problem

The current system relies primarily on a live current-price snapshot for each call. That creates measurement bias across calls of different ages and makes it difficult to distinguish long-lived winners from short-term winners.

### Investigation

Inspected the live analytics model in [src/lib/dashboard-data.ts](src/lib/dashboard-data.ts), [src/lib/metrics.ts](src/lib/metrics.ts), [workers/price-update.js](workers/price-update.js), and the baseline schema in [supabase/migrations/001_kelucalls_baseline.sql](supabase/migrations/001_kelucalls_baseline.sql). Reviewed the Phase 1-3 docs and scripts that track median ROI, outlier handling, and null-price semantics.

### Evidence

- `calls.entry_price_usd` is captured once as the call record’s entry price.
- `call_metrics.current_price_usd` is the live snapshot refreshed by the DexScreener worker.
- `call_metrics.current_roi_pct` and `peak_roi_pct` are derived from entry vs current/peak price.
- `channel_stats` aggregates those live values into `average_roi_pct`, `median_roi_pct`, `win_rate_pct`, and `ranking_score`.
- There is no dedicated price-history table or schema in the repository for historical snapshots at T+5m, T+15m, T+1h, T+24h, or T+7d.
- The existing research and scripts only validate the current-price state and the median calculation; they do not provide a stable, persisted historical series.

### Measurement Horizons

Current support in the repo and schema:

- T+0: supported via entry price + current price snapshot
- T+5m: not durably supported by the existing schema
- T+15m: not durably supported by the existing schema
- T+1h: not durably supported by the existing schema
- T+24h: not durably supported by the existing schema
- T+7d: not durably supported by the existing schema

The system can observe a live current state, but it does not currently persist a fixed-horizon time series for each call.

### Age Bias

Age bias is expected because live ROI compares old calls to a present-day price with no normalized time window. Long-lived winners can dominate current ROI even when shorter-term outcomes are more relevant to recent decision-making.

The repo’s scripts and memory notes explicitly treat stale or missing current measurements as a data-quality problem rather than a ranking policy problem, which supports the conclusion that the current model is a live snapshot, not a time-normalized performance model.

### Win/Loss Semantics

From the existing code and schema, a call is treated as a win when the live call metrics say `is_win` is true, and that flag is derived from `current_multiple >= 1` at the current measured price. Missing or invalid current prices are not treated as a valid measurement; they remain null/invalid states rather than a clean 0% result in the intended median logic.

### FREEDOM Case

The FREEDOM case remains a live outlier in the current data model. The repository demonstrates the outlier is real and that it is not simply a capped or erased result. However, there is no schema or historical data in the repo that proves a fixed-horizon lineage for that call beyond its current live measurement.

### Ranking Analysis

A future ranking redesign could consider median ROI, fixed-horizon ROI, sample-size adjustment, or Wilson-adjusted win rate. The repo does not currently contain enough durable historical pricing data to implement those safely without introducing a new measurement layer. The existing Smart Score remains the active, unchanged formula.

### Changes Made

- No production schema was changed.
- No migration was executed.
- No raw call or call metric row was modified.
- No ranking formula was changed.
- Added the Phase 4 investigation summary to this work log.

### Validation

- `npm run lint` → passed
- `npm run typecheck` → passed
- `npm run build` → passed

### Database Changes

- Schema changed: NO
- Migration executed: NO
- Raw data changed: NO

### Remaining Issues

- No persisted historical price snapshots exist for fixed horizons.
- Future Phase 5 work should decide whether to add a historical measurement layer or keep using live ROI as the primary signal while documenting its age bias.
- FREEDOM lineage should remain treated as unresolved unless live production data confirms a valid contract association.

---

## Phase 5 — Historical Price Measurement Layer

### Problem

The repo’s live snapshot model supports T+0 measurements, but it does not store a durable historical price series for fixed-horizon windows. Phase 4 concluded that the current analytics stack cannot safely answer T+5m/T+15m/T+1h/T+24h/T+7d questions without introducing a raw observation layer.

### Design Decision

The smallest safe foundation is a token-level raw observation table rather than a call-level ROI table or a set of duplicated horizon columns.

Rationale:

- Many calls can share the same token price at the same time.
- A token-level observation avoids repeated writes for the same external price snapshot.
- Fixed-horizon ROI can later be derived from the stored observations for each call’s token and entry timestamp.
- This preserves raw data and keeps future metric changes centralized in the analytics layer rather than scattered across columns.

### Proposed Storage

New migration created at [supabase/migrations/020_token_price_observations.sql](supabase/migrations/020_token_price_observations.sql).

Conceptual schema:

- `token_id` — existing relation to `public.tokens`
- `price_usd` — raw observed price
- `market_cap_usd` — optional market-cap snapshot
- `observed_at` — exact timestamp of the observation
- `source` — source marker such as `dexscreener`
- `created_at` — server-side write timestamp

Unique constraint:

- `(token_id, observed_at)` to prevent duplicate observations from repeated worker runs.

### Why this is the minimum safe layer

This design stores observations and leaves derived fixed-horizon ROI for a later phase. It avoids:

- duplicating ROI columns like `roi_5m`, `roi_1h`, `roi_7d`
- replacing current live metrics
- fabricating historical backfills for old calls
- modifying raw `calls` or `call_metrics` rows

### Collection Strategy

The historical observation layer should be populated by the existing DexScreener-driven worker path, but only after a new raw observation is inserted. The current price update should remain authoritative for live metrics; historical snapshots should be additive and non-destructive.

### Time Resolution

A practical starting cadence is a 5-minute observation interval for each active token, with the `observed_at` timestamp recorded as the actual storage time. This provides support for 5-minute and larger horizontals without exploding storage or hammering DexScreener. A future phase may tighten to 1-minute collection only if the measurement objective requires it.

### Backfill Policy

No historical backfill is attempted. Existing calls remain "horizon unavailable" until genuine historical observations exist after deployment time.

### Validation

- `npm run lint` → passed
- `npm run typecheck` → passed
- `npm run build` → passed

### Database Status

- Migration created: YES
- Migration executed: NO
- Raw data changed: NO

### Remaining Phase 5 Work

- Confirm final worker cadence with the live production token set.
- Decide whether a 5-minute bucket or a 1-minute bucket is the eventual production default.
- Implement only the historical write path, not any ranking or ROI redesign.
- Wait for observation accumulation before computing fixed-horizon analytics.

---

## Phase 6 — Historical Observation Write Path

### Objective

Connect the existing live price worker to the raw token observation layer so Kelucalls begins storing new historical price observations without changing current analytics behavior.

### Starting State

Phase 5 created the migration at [supabase/migrations/020_token_price_observations.sql](supabase/migrations/020_token_price_observations.sql), but the live worker still only updated `call_metrics` and tokens. No historical observation writes existed yet.

### Implementation

The current worker in [workers/price-update.js](workers/price-update.js) now preserves the existing live update path and adds a secondary safe write to `token_price_observations` for each successful DexScreener snapshot.

The historical write happens only for valid token prices and is deduplicated by token within a worker cycle.

### Observation Model

The design remains token-level rather than call-level. A single token can have multiple calls, but a single token observation at a given timestamp is enough to represent the raw market price for future fixed-horizon analytics.

### Deduplication

During a single price-worker cycle, the worker keeps a `Map` keyed by `token_id`. If multiple open calls reference the same token, the worker only keeps the most recent valid snapshot for that token and writes one observation for that timestamp.

This respects the migration’s unique constraint on `(token_id, observed_at)` and prevents repeated identical inserts from the same cycle.

### Timestamp

Observations use `new Date().toISOString()` at the time the snapshot is successfully processed. This records the actual observation time rather than borrowing a call timestamp or inventing historical dates.

### Failure Isolation

If the historical observation insert fails because the table is missing or the database write is temporarily unavailable, the worker logs the issue and continues to operate. It does not interfere with the current `call_metrics` update path or the live current-price behavior.

### Cadence

The effective observation cadence follows the existing price worker interval, which is already configured around 5 minutes. No separate worker or second timer was introduced.

### Storage Consideration

The storage volume is expected to grow roughly with active observed tokens × collection cadence. This phase does not add retention logic or cleanup behavior; retention remains a future operational decision after the observation layer exists.

### Validation

- `npm run lint` → passed
- `npm run typecheck` → passed
- `npm run build` → passed

### Database Changes

- Database schema changed: NO additional production schema changes were made beyond the already-created migration file.
- Migration executed: NOT VERIFIED in the connected database from this repository environment.
- Raw data changed: NO live data writes were performed from this code path in the local repo context.

### Live Verification Status

This environment does not provide a connected production database inspection mechanism or a verified deployed migration state, so live observation collection has not been confirmed from a running database in this session.

The code path is in place and validated by lint/typecheck/build, but actual database-backed collection remains operationally unverified until the migration has been applied in the target database environment and the worker is run there.

### Why It Matters

This creates the raw measurement foundation required for future fixed-horizon analysis such as:

- T+5m ROI
- T+15m ROI
- T+1h ROI
- T+24h ROI
- T+7d ROI
- age-bias analysis
- historical comparison without changing current ranking or scoring behavior

This remains a data-collection step only; it does not yet enable fixed-horizon analytics themselves.

---

## Phase 6.1 — Live Verification & Regression Repair

### Problem

The first real Phase 6 worker runtime exposed two live failures that cannot be treated as harmless background noise:

1. the freshness-ordering fallback path is being hit repeatedly while fetching `call_metrics` for 500 open calls;
2. `refresh_public_analytics()` can fail with `null value in column "average_roi_pct" of relation "channel_stats" violates not-null constraint`.

### Evidence

The runtime errors indicate the worker is repeatedly falling back from the freshness-ordering branch and then hitting the analytics refresh function after price updates. The database error strongly suggests a stale or mismatched `refresh_channel_stats()` implementation in the connected environment rather than a change to live ranking logic.

### Root cause

Root cause not yet proven from the repository alone because the live database state and the production worker log were not available in this local workspace. The repo does confirm that the baseline approach is safe when `avg(cm.current_roi_pct)` is coalesced, and the production error is consistent with a non-coalesced function or stale SQL in the connected database.

### Fix

- Added a safety migration at [supabase/migrations/021_fix_channel_stats_nulls.sql](supabase/migrations/021_fix_channel_stats_nulls.sql) to repair `refresh_channel_stats()` so aggregate columns cannot receive `NULL` when there is no measurable current ROI.
- Preserved the existing measurement semantics: unmeasurable prices remain unmeasurable rather than being converted into false 0% ROI.
- Kept the Phase 6 historical write path in [workers/price-update.js](workers/price-update.js) as an additive observation side effect without changing current analytics semantics.

### Why it matters

This repair is aimed at keeping the worker operational while the data layer continues to capture raw token observations. It reduces the risk of live analytics refreshes failing while future fixed-horizon analysis is still in the collection stage.

### Verification

- `npm run lint` → passed
- `npm run typecheck` → passed
- `npm run build` → passed

### Database status

- Migration created: YES
- Migration executed: NOT VERIFIED in the connected database from this workspace
- Historical observation code path: implemented, not live-verified
- `refresh_channel_stats()` repair: staged, not executed automatically

### Remaining blockers

- The real connected database state remains unknown from this local workspace.
- The production worker log needed to prove the exact `call_metrics` query failure mode is not present here.
- Until migration 021 is applied and the worker is run in the target environment, live Phase 6.1 completion remains blocked.

---

## Phase 6.2 — Freshness Query Diagnosis & Live Verification

### Problem

The price worker's freshness-aware `call_metrics` lookup repeatedly failed with:

```text
Failed to load call_metrics for freshness ordering
TypeError: fetch failed
```

The worker then fell back to `fallbackMode: unsorted-call-order`, which prevented the intended freshness prioritization from being applied to the current candidate set.

### Diagnosis

The worker was issuing one large `call_metrics` lookup for up to 500 open-call IDs. The observed runtime failure occurred at that large lookup boundary.

A direct database probe from the local shell could not independently reproduce the request because that shell did not have the live Supabase credentials loaded. Therefore, the repository evidence does not prove an underlying provider/network root cause. The exact production cause remains unproven.

### Solution

The freshness lookup was changed to use safe batched fetching with the existing worker utilities. The original ordering semantics were preserved:

1. missing or invalid current price first;
2. oldest `refreshed_at` next;
3. oldest `called_at` last.

This is a worker scheduling/freshness repair, not a ranking or Smart Score change.

### Regression Verification

The guarded production-like verification command was:

```text
$env:WORKER_RUN_ONCE="true"
node workers/price-update.js
```

The final successful run produced:

```text
Price worker starting
Processing open calls count=500
Price update complete processed=500 durationMs=216361
Run-once mode complete
```

The final run completed in approximately 216 seconds and did not reproduce:

- the previous `call_metrics` freshness `TypeError`;
- `fallbackMode: unsorted-call-order`;
- the `channel_stats.average_roi_pct` NULL constraint failure;
- a DexScreener HTTP 429 during that particular final run.

An earlier verification run did encounter HTTP 429 responses from DexScreener. Provider rate limiting remains a monitoring concern and is not claimed to be permanently eliminated.

### Phase 6.2 Conclusion

**COMPLETE**

The freshness-aware processing path was repaired and the guarded live worker run completed successfully. The exact external cause of the earlier `fetch failed` error was not proven, but the large-query failure boundary was removed and the runtime no longer reproduced the fallback in the final verification.

### Why It Matters

The repair restores the intended freshness-aware processing path so calls needing measurement are not silently deprioritized because the freshness lookup fails. The existing live price update, historical observation write, analytics refresh, worker health recording, and `WORKER_RUN_ONCE` behavior remain intact.

### Files Changed

- `workers/price-update.js`
- `workers/worker-utils.js` was not changed; its existing `chunk` utility was reused.

### Database Changes

- No production SQL or Supabase migration was executed during this diagnosis.
- No raw calls or call metrics were modified.
- The existing historical observation table and its indexes/RLS remain unchanged.

### Remaining Issues

- DexScreener provider rate limiting must remain monitored.
- The exact production network/query failure remains unproven from the local evidence.
- Phase 7 may begin only after this work-log entry is complete.

---

## Phase 7 — Fixed-Horizon Historical Measurement

### Problem

The existing observation table stores raw token prices, but the application has no read-only measurement helper for T+5m, T+15m, T+1h, T+24h, and T+7d. Fixed-horizon results therefore cannot be calculated consistently or safely without introducing duplicated ROI columns or fabricating missing prices.

### Decision

Use dynamic, read-only calculations from `calls`, `token_price_observations`, and the existing `entry_price_usd` value. A dedicated persisted measurement table was not added because the current expected workload is manageable with a bounded, batched query and the raw observations remain the immutable source of truth.

### Measurement Semantics

For each call and horizon, the target timestamp is:

- `called_at + 5 minutes`
- `called_at + 15 minutes`
- `called_at + 1 hour`
- `called_at + 24 hours`
- `called_at + 7 days`

The calculation uses the newest token observation at or before the target timestamp, within a shared five-minute tolerance. Observations after the target are excluded. No current or future price is substituted for a missing observation.

Historical ROI is calculated as:

```text
((observation_price - entry_price) / entry_price) * 100
```

The existing live `current_roi_pct` and ranking behavior remain unchanged.

### Missing Data Handling

- Call younger than the target horizon: `pending`.
- Mature call with no observation in the valid window: `unmeasurable`.
- Invalid or missing entry price: `unmeasurable`.
- Invalid or non-positive observation price: ignored by the database constraint and excluded from the result.
- Duplicate observation timestamps: the database unique constraint prevents duplicates; the helper also deterministically selects the newest row when duplicate input is supplied.

### Implementation

- Added `src/lib/historical-measurements.ts` with the exact horizon definitions, deterministic calculation, pending/unmeasurable states, and five-minute tolerance.
- Added `src/lib/supabase/historical-measurements.ts` with one batched observation query for the requested token set and no per-call query.
- Added the existing observation table to `src/lib/supabase/types.ts`.
- Added focused tests in `src/lib/historical-measurements.test.ts` and `scripts/test-fixed-horizon-measurements.ts`.
- The existing price worker and all ranking formulas were not changed.

### Performance

The implementation performs one bounded query for the selected token IDs and filters observations by the relevant timestamp range. It does not perform an N+1 query and does not scan the entire observation table. The existing token/time index and observation-time index are sufficient for the planned query; no new database index or migration is required.

### Validation

- Focused tests: 2 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Editor diagnostics: no errors in changed TypeScript files.

### Production Database

No migration was executed. No production SQL was run. No raw call or call-metric row was modified. The implementation is ready for read-only verification against the connected database, but that verification remains pending.

### Live Worker Safety

The existing price worker's live update path, historical observation write path, analytics refresh, worker health recording, and `WORKER_RUN_ONCE` behavior remain unchanged. This Phase 7 helper is not called by the worker and cannot prevent the live update from completing.

### Status

**PARTIALLY COMPLETE**

The measurement foundation and tests are implemented and statically verified. Live database-backed verification and integration into a future analytics consumer are still pending.

### Remaining Blockers

- Execute a read-only query against the connected database to confirm generated static results for representative calls.
- Verify the observation table/indexes/RLS remain intact after deployment.
- Integrate the helper into a future read-only analytics endpoint only after the measurement contract is approved.
- Do not change Smart Score, leaderboard ordering, median ROI, average ROI, win rate, trending tokens, or channel ranking in this phase.

---

## Measurement Repair Audit — 2026-10-10

### Scope and Measurement Definitions

This audit resumed the original price freshness and measurement-coverage investigation. It inspected `docs/measurement-migration.md`, this work log, the current price worker and worker utilities, the fixed-horizon helper, migrations 001 and 018-021, and the token observation schema in migration 020.

For this audit, a metric is fresh only when `call_metrics.refreshed_at >= now() - interval '24 hours'`; the timestamp basis is the database's current UTC-compatible `now()`. A valid live price is strictly greater than zero. Missing, zero, and negative prices are not measurable and are never treated as 0% ROI. An eligible open call is one with `calls.status = 'open'` and a usable token contract address, matching the worker selection filters.

### Production Query Status

**Blocked: no current production query was executed.** The current shell had no inherited Supabase/Postgres connection variables and no `supabase` or `psql` client. No credentials were requested, displayed, or loaded from `.env` or `.env.local`. No production data, SQL function, or materialized view was changed.

Consequently, this audit cannot report current counts for calls, metrics, open-call price validity, refresh-age distribution, missing metric rows, observation coverage, PnL reconciliation, or current analytics refresh health. Prior runtime logs and previously recorded DB figures are historical evidence only, not current measurements.

### Historical Baseline — Not Replaced

The earlier baseline recorded in `docs/measurement-migration.md` remains historical and its exact filters/timestamp basis were not fully specified there:

- 11,004 calls and 11,003 call_metrics rows.
- 446 metrics refreshed within 24 hours and 10,557 older than 24 hours.
- 4,903 null current prices and 4 zero current prices.
- 1,680 calls created in seven days.
- Call-level current simulated PnL: $219,617.76; channel-level current simulated PnL: $219,617.05; reported difference: $0.71.
- Call-level peak simulated PnL: $236,919.87.

These values must not be presented as 2026-10-10 counts. No comparable current snapshot was available, so change since baseline cannot be calculated.

### Freshness and Candidate-Window Finding

The current `workers/price-update.js` selects open calls with a nullable-contract filter and applies `.limit(500)` before loading metrics and sorting candidates in memory. It does not specify an `.order(...)` on the candidate query. Freshness sorting therefore covers only the returned candidate window; missing/invalid prices and oldest `refreshed_at` cannot prioritize calls that were excluded before sorting. The unspecified database row order also is not a stable backlog cursor.

This is a proven source-level coverage limitation, not proof that a particular number of production calls is starving. A successful 500-call worker cycle only proves those candidates were processed; it does not prove the complete open-call backlog has recovered. The smallest safe correction to evaluate next is a stable, bounded candidate selector that orders the eligible open calls by missing/invalid metric first, then oldest `refreshed_at`, then oldest `called_at`, before applying the 500-row limit. It must retain the address eligibility filter and existing worker processing behavior. Do not increase the limit as a substitute for correct selection.

### ROI/PnL and Analytics Findings

The current worker calculates current and peak ROI and $10 simulated PnL per call. Migration 021 coalesces the channel PnL aggregates and `average_roi_pct` in `refresh_channel_stats()`, addressing the prior NULL constraint failure in the migration definition. The repository definition is not proof that migration 021 is deployed or that the live refresh currently succeeds.

The prior $0.71 call/channel PnL difference is historical only. A current reconciliation requires matching population and filters: channel aggregation covers calls belonging to active/paused channels with open/closed status, while an unrestricted sum of `call_metrics` may include a different population. The reconciliation and live analytics-refresh result were not queryable in this audit.

### Historical Observations and Phase 7 Source Review

Migration 020 defines positive `price_usd`, unique `(token_id, observed_at)`, token/time and observed-time indexes, and RLS policies. Their current production existence, row count, distinct-token count, time coverage, and policy state were not verified.

The pure Phase 7 helper uses the newest observation no later than the target and permits only observations in the preceding five-minute window. The Supabase adapter accepts call identity/token/entry fields from its caller and issues one range-bounded query for the union of token IDs; it does not independently resolve those fields from `calls`, paginate results, or have a per-token result cap. Real call/token/entry resolution, actual tolerance behavior against production rows, shared-token records, and query completeness therefore remain unverified.

One local semantic gap is visible in `src/lib/historical-measurements.ts`: `measurementStatus()` returns `pending` for a future target before checking whether the entry price is invalid. An invalid-entry call younger than a horizon can therefore be marked pending, despite the Phase 7 contract specifying invalid entry as unmeasurable. This needs a focused correction and regression test before claiming the helper fully meets that contract. No correction was made during this audit.

### Analytics Function Verification

No live `refresh_public_analytics()` call was run because the function mutates channel statistics and refreshes the trending materialized view, and the requested audit forbids forcing that refresh. Existing worker logs from a prior guarded run are historical and do not establish current production health.

### Local Phase 7 Verification

- `npx tsx --test src/lib/historical-measurements.test.ts scripts/test-fixed-horizon-measurements.ts`: 8 passed, 0 failed.
- A fixed-clock probe for a young call with `entry_price_usd = null` returned `pending` for all five horizons, confirming the status-precedence gap described above.
- These are local helper checks only; they do not substitute for database-backed verification.

### Audit Outcome

- Current production measurement status: **not established; read-only DB access unavailable**.
- Historical baseline: preserved above and not overwritten.
- Worker freshness repair from Phase 6.2: present in the working tree, but 500-candidate backlog coverage remains unproven and is not guaranteed by the current candidate selection.
- Phase 7: static source semantics reviewed; production-backed verification blocked, with the invalid-entry/pending ordering gap identified.
- Code changes during this audit: none.
- Database changes during this audit: none.

### Single Recommended Next Action

Re-run this audit through an authorized read-only Supabase/Postgres connection, and include candidate ordering/backlog and representative Phase 7 records in the same snapshot. Then make only the evidence-backed fixes: stable stale-first selection before the 500 limit, and invalid-entry status precedence in the pure helper. Do not force analytics refresh or alter ranking formulas as part of that audit.

---

## Phase 7.1 — Production Measurement Audit & Root-Cause Verification — 2026-10-12

### Connection and Permissions

The configured Supabase SQL connection returned database user `supabase_read_only_user`, database `postgres`, `transaction_read_only = on`, and database time `2026-10-12 14:23:23 UTC` at the initial check. The generic database name does not expose a Supabase project reference, but the expected Kelucalls tables, schema, functions, and historical channel count were present. All six required tables (`calls`, `call_metrics`, `channels`, `channel_stats`, `tokens`, `token_price_observations`) existed and were selectable.

The audit connection reports `BYPASSRLS`; reads therefore do not prove what a non-bypass application role sees. RLS is enabled on the inspected tables. `token_price_observations` has a public SELECT policy and explicit anon write-denial policies. No credentials were accessed or displayed. No writes, migrations, or analytics refreshes were run.

A follow-up catalog query confirmed RLS enabled (not forced) and a SELECT policy present on each of the six tables. The read-only audit role itself bypasses those policies.

### Snapshot Definitions

Snapshot queries used the database clock (`now()`; primary aggregate as-of `2026-10-12 14:26:28.849 UTC`). Worker-eligible calls were `calls.status = 'open'` joined to `tokens` with `tokens.contract_address IS NOT NULL`, matching `getOpenCalls()`. A valid current/entry price is strictly positive; NULL and non-positive values are not interpreted as 0% ROI. Refresh buckets use `call_metrics.refreshed_at`: within 24 hours, 24 hours to 7 days, and older than 7 days. Call age buckets use `calls.called_at`.

### Current Measurement-Health Snapshot

| Measure                                                          |       Current result | Population / definition                                                           |
| ---------------------------------------------------------------- | -------------------: | --------------------------------------------------------------------------------- |
| Channels / tokens / calls                                        | 171 / 6,355 / 12,771 | Whole tables                                                                      |
| Calls by status                                                  |          12,771 open | Whole `calls` table; no other status rows returned                                |
| Worker-eligible open calls                                       |               12,763 | Open calls with non-NULL token contract address                                   |
| `call_metrics` rows / calls missing a row                        |           12,770 / 1 | Whole tables joined by `call_id`                                                  |
| Eligible open calls missing a metrics row                        |                    1 | Worker-eligible open population                                                   |
| Eligible open calls with missing / zero / negative current price |        5,626 / 4 / 0 | Left-joined metrics; missing metric row is included as missing current price      |
| Eligible open calls with missing / zero / negative entry price   |        5,621 / 8 / 0 | `calls.entry_price_usd`                                                           |
| All calls with missing / zero / negative entry price             |        5,629 / 8 / 0 | Whole `calls` table                                                               |
| All metrics with missing / zero / negative current price         |        5,633 / 4 / 0 | Whole `call_metrics` table                                                        |
| Metrics refreshed within 24 hours                                |                    0 | `refreshed_at >= as_of - 24 hours`                                                |
| Metrics refreshed 24 hours to 7 days ago                         |                  429 | `as_of - 7 days <= refreshed_at < as_of - 24 hours`                               |
| Metrics refreshed more than 7 days ago                           |               12,341 | `refreshed_at < as_of - 7 days`                                                   |
| NULL / future `refreshed_at`                                     |                0 / 0 | Schema marks `refreshed_at` NOT NULL; future check compared with database `now()` |

All 12,763 eligible open calls were missing a metric row or had `refreshed_at` older than 24 hours. Their `called_at` age distribution was 2 calls aged 1-7 days, 4,264 aged 7-30 days, and 8,497 older than 30 days. No eligible calls were younger than one day in this stale-or-missing set.

### Historical Baseline Comparison

The historical `docs/measurement-migration.md` baseline recorded 11,004 calls, 11,003 metrics, 446 metrics refreshed in 24 hours, 10,557 older than 24 hours, 4,903 missing current prices, 4 zero prices, 5,488 tokens, and 171 channels. It reported 1,680 calls created in seven days.

On 2026-10-12, calls were 12,771 (+1,767) and metrics 12,770 (+1,767); one call still lacks a metric row. Tokens were 6,355 (+867); channels remained 171. Fresh metrics declined from the historical 446 to zero. Current metrics older than 24 hours total 12,770 (429 in the 1-7 day bucket plus 12,341 older than 7 days), versus the historical 10,557. Missing current-price metrics rose from 4,903 to 5,633 (+730); zero current-price metrics remained 4.

The baseline did not preserve complete filters or a precise timestamp basis, so deltas are descriptive and not guaranteed like-for-like. No new count replaces the baseline.

A follow-up query at `2026-10-12 14:42:50 UTC` found 2 calls created in the preceding seven days, 2 calls with `called_at` in that interval, and zero calls created in the preceding 24 hours. This contrasts with the historical 1,680 calls created in seven days; the old baseline did not record its exact timestamp expression, so treat the comparison as indicative rather than exact.

### 500-Call Candidate-Window Verification

Current source still applies `.limit(500)` to the open-call/token-contract query before the worker fetches `call_metrics` and sorts in memory; it specifies no `.order(...)`. The in-memory freshness sort cannot prioritize calls that the initial query excluded. The selected SQL window is therefore not guaranteed stable across executions.

A read-only SQL-shaped execution matching the current call/token eligibility filters and unordered 500-row limit returned 500 selected calls and 12,263 outside that sample. All 500 selected and all 12,263 outside were stale by the 24-hour definition. In that execution, 498 selected calls and 8,001 excluded calls were older than 30 days; selected call timestamps ranged from 2025-07-06 to 2026-09-27, while excluded timestamps ranged from 2024-02-12 to 2026-10-05. The excluded sample contained 5,341 missing current prices, 4 zero prices, and the one missing metrics row; the selected sample had 285 missing prices and no zero-price or missing-metric rows.

This is measured evidence from one unordered SQL candidate-window execution, not a guarantee of identical PostgREST row membership. The source-level starvation risk is confirmed; exact repeat behavior is not. Calls outside the window can remain unprocessed indefinitely because the query has neither a stable ordering nor a cursor, but whether the same calls repeat indefinitely is not proven. A completed prior worker cycle only processed its 500 candidates and did not recover the complete backlog.

### Observation Coverage and Fixed-Horizon Verification

Production `token_price_observations` contained 3,876 rows across 71 tokens, from `2026-10-05 16:39:03.367 UTC` through `2026-10-06 15:15:26.812 UTC`. No invalid/non-positive price rows or duplicate `(token_id, observed_at)` groups were found. Per-token counts: 3 tokens with one observation, none with 2-10, 68 with 11-100, none over 100; minimum 1 and maximum 62. The live unique constraint and token/time indexes were present.

For all 12,771 open calls, target timestamps were evaluated at `called_at + horizon`; an observation qualified only if `target - 5 minutes <= observed_at <= target`. At T+5m, T+15m, T+1h, and T+24h, all calls were mature, 5,637 had missing/zero entry prices, 7,134 had valid entries but no qualifying observation, and zero had a qualifying observation. At T+7d, 12,769 calls were mature and 2 remained pending; 5,637 mature calls had invalid entries, 7,132 valid-entry calls lacked a qualifying observation, and zero were measurable. Thus none of the five horizons currently has production coverage in the specified tolerance window.

Representative shared-token evidence: token `4bac920f-61ae-447e-927e-50d74b142e09` has 35 calls, 62 observations, and 9 distinct entry prices. Sample calls published July 13, July 22, and July 23 had their own call-specific target timestamps and entry prices. None had an observation in any of its five target windows. The first stored observation for that token was `2026-10-05 16:42:37.992 UTC` at `$0.1534`, after every sampled July target; it was excluded, not used as a fabricated historical price. The pure helper was run locally using two actual returned call rows and that actual observation; each result was `unmeasurable`, with null observation and ROI for all five horizons.

The two calls whose T+7d target was still in the future were pending by age. No invalid-entry call in the last seven days existed in production, so the requested real-record test of invalid entry plus future target could not be made. A local synthetic probe confirmed the current helper returns `pending` for an invalid-entry young call at all five horizons; the invalid-entry-before-pending status defect remains confirmed in source and local behavior.

### Adapter Completeness, Indexes, and RLS

The current adapter sends one token-ID/time-range PostgREST query, with no `.range()`, `.limit()`, pagination, or truncation detection. For all call token IDs, the current adapter's global bounds would span `2024-02-12 18:16:44 UTC` through the audit time and match 3,876 stored observation rows across 6,351 distinct call token IDs. The SQL session did not expose an effective PostgREST `db_max_rows` setting (`current_setting('pgrst.db_max_rows', true)` returned NULL), so the live API cap could not be confirmed. If a 1,000-row cap applies, this all-call request can be truncated; this is a concrete completeness risk, not proof that the adapter has already truncated a production request. The helper currently has no callers in `src`.

The live `(token_id, observed_at)` unique index and `(token_id, observed_at DESC)` index support the token/time predicates. Observation-table RLS is enabled; its public SELECT policy allows reads, and the audit role bypasses RLS. Query errors are thrown by the adapter, whereas successful empty/truncated results become ordinary unmeasurable results; without pagination/count validation the latter can be mistaken for complete absence.

### ROI/PnL and Analytics State

Comparable population: calls with status open/closed belonging to active/paused channels, exactly the `refresh_channel_stats()` call/channel scope. It contained 12,765 calls, 12,764 metric rows, and one missing metric row. Call-level simulated current PnL was `$219,943.1945`; stored channel-level current PnL was `$219,943.1945`; difference `$0.0000`. Peak PnL was `$237,677.8107` on both sides; difference `$0.0000`.

Within the same population, 7,129 rows had positive entry and current prices and 5,635 were unmeasurable by those price semantics. The unmeasurable rows included 5,633 zero-ROI rows plus two rows with nonzero stored ROI. Their stored simulated current PnL summed to `-$20.00`; measurable rows summed to `$219,963.1945`. This reflects existing stored metrics, not a recomputation or correction. The refresh function's average ROI includes `cm.current_roi_pct` for every joined metric, including defaults/stored values on unmeasurable rows; the median does filter invalid entry/current prices. This is a confirmed analytics-definition inconsistency affecting average ROI, not a PnL reconciliation difference. No outlier was capped, deleted, or excluded.

The live `refresh_channel_stats()` definition coalesces `average_roi_pct`, median, and simulated PnL aggregates. Stored active/paused `channel_stats` had 169 rows and zero NULLs in checked required fields. The populated `trending_tokens` materialized view existed. Stored channel statistics had `refreshed_at = 2026-10-11 19:48:34.748 UTC`. No refresh function was executed. Attempts to query Supabase project logs returned a backend error, so successful current `refresh_public_analytics()` completion and absence of the earlier NULL constraint error could not be established from logs. Stored null-free rows and the coalescing function definition are evidence against the old failure, not proof of a current function run.

### Operational Worker Evidence

The newest `worker_runs` entry for `price-update` was `succeeded`, started `2026-10-06 15:12:32 UTC`, finished `15:16:08 UTC`, with 500 processed and duration 216,361 ms. The latest metric refresh was `2026-10-06 15:16:06 UTC`; latest observation was `2026-10-06 15:15:26 UTC`. At the audit time, both were about 5 days 23 hours old. This confirms a recorded successful cycle on October 6, not current worker health. No later `price-update` run was present in the ten newest worker-run rows. The reason for the apparent worker stoppage is unresolved; project log query failure prevented diagnosis.

### Confirmed Defects and Unresolved Questions

1. **Critical — freshness/coverage outage:** zero metrics refreshed within 24 hours; all 12,763 eligible open calls were stale or missing metrics; the newest worker run and observation were almost six days old. Cause of worker stoppage is unverified.
2. **High — candidate-window starvation risk:** `.limit(500)` precedes freshness sort and there is no deterministic order. One production-shaped sample left 12,263 calls outside, including 8,001 older than 30 days. Exact repeating membership is unverified.
3. **High — fixed-horizon history unavailable:** 3,876 observations exist, but none matched any call horizon under the required five-minute past-only tolerance. Calls predate the observation series or lack samples at target time; current provider prices cannot fill this gap.
4. **Medium — adapter completeness risk:** no pagination or truncation detection; all-call scope matched 3,876 rows, and the active PostgREST cap could not be queried. The helper is currently unused, so production truncation is not established.
5. **Medium — invalid-entry status precedence:** young calls with invalid entry price are returned as `pending` before entry validation. Confirmed by current source and synthetic local probe; no matching recent production call existed.
6. **Low/monitor — channel average ROI includes stored rows that are unmeasurable by entry/current-price semantics.** It can treat their stored/default ROI as part of the average. PnL totals still reconcile exactly for the matching population.
7. **Unresolved — live analytics execution:** channel fields are currently non-NULL and the function coalesces required aggregates, but no refresh was run and project logs were unavailable.

### Validation and Changes

- Connection/read-only check and SELECT access to all six tables: passed.
- Local fixed-horizon test suite: 8 passed, 0 failed; this does not prove production coverage.
- Read-only production queries covered the counts, candidate-window sample, observations, horizon targets, PnL reconciliation, indexes, RLS policies, stored channel-stat NULLs, and worker run records described above.
- Supabase project log queries returned `Backend error`; no alternate credential path was attempted.
- Files changed: this work log only.
- Application code changed: NO.
- Production data/schema changed: NO.
- Analytics refresh executed: NO.

### Single Recommended Next Action

Restore/verify the scheduled `price-update` worker first, then implement only an explicitly authorized stale-first candidate selector that orders eligible calls before the 500 limit and advances deterministically. Re-audit after it runs; do not infer backlog recovery from one successful cycle. Separately, do not integrate fixed-horizon metrics into analytics until observation cadence can actually cover target windows and the adapter can guarantee complete paginated results. No ranking changes are recommended by this audit.

---

## Phase 7.2 — Manual Worker Recovery & Deterministic Backlog Diagnosis — 2026-10-12

### Operational Context

The project owner reports that the Railway subscription expired and the price worker, trending worker, and Telegram scraper are paused there. This is owner-provided operational context; no Railway control-plane check was available in this audit. No deployment or scheduling change was attempted.

### Verified Entrypoints and Commands

The root `package.json` defines:

- Price worker: `npm run worker:price` -> `node workers/price-update.js`.
- Trending aggregation: `npm run worker:trending` -> `node workers/trending-aggregate.js`.
- Telegram scraper: `npm run scraper` -> `node scraper/index.js`.

Both workers support a one-cycle mode with `WORKER_RUN_ONCE=true`. In PowerShell, the verified one-shot forms are:

```powershell
$env:WORKER_RUN_ONCE = "true"
npm run worker:price
```

```powershell
$env:WORKER_RUN_ONCE = "true"
npm run worker:trending
```

The scraper has no one-shot mode; `npm run scraper` starts a persistent Telegram listener. `npm run scraper:login` is an interactive session-generation command, not the scraper runtime, and was not run.

### Runtime Configuration and Local Process Check

The inspected worker bootstrap calls `loadWorkerEnv()`, which loads `.env` and `.env.local`; the scraper bootstrap loads `.env`. The terminal process had none of the required Supabase or Telegram variables inherited. No environment file was opened or loaded during this inspection. Because the requested constraint prohibits reading environment files, whether the worker scripts could obtain credentials from files could not be established without violating that constraint.

The worker requirements are a Supabase URL (`SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`) and key (`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_KEY`). The scraper validator requires `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SCRAPER_SESSION`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Its startup status logger prints partial masked values for configured secrets, which is incompatible with this phase's no-credential-exposure requirement unless that output is redacted first.

One local `node.exe` process was detected; no process command line matched the price worker, trending worker, or `scraper/index.js`. This rules out a known matching local process at inspection time, not a remote process or another differently launched Telegram session.

### Execution Decision and Side Effects

**No worker command was executed.** This was a deliberate stop under the requested safety rules, not a worker failure:

- The parent shell had no runtime credentials, and using the workers' existing dotenv bootstrap would read prohibited environment files.
- A price one-shot still fetches up to 500 contracts sequentially, with up to three DexScreener attempts per contract, updates `call_metrics` and token live-price columns, writes token observations, inserts milestone events where applicable, and calls `refresh_public_analytics()`.
- A trending one-shot calls `refresh_public_analytics()`, which writes channel aggregates and refreshes the trending materialized view. This would be an analytics refresh, explicitly disallowed by the operational constraints.
- The scraper is continuous, backfills up to 50 messages for every active/paused channel at startup, processes queued tracking requests, and can insert tokens, calls, and call metrics. It also registers tracking-queue polling twice. Its session's uniqueness/remote use could not be verified, and it has no one-shot guard.

These operations can make broad production changes or exceed provider/session safety limits; per the stop condition, they were not started. No start/completion times or process exit codes exist because no commands ran. No worker-specific error was generated by this audit.

### Read-Only Production Verification

At `2026-10-12 15:51:28 UTC`, read-only production checks showed:

- Latest `price-update` worker run: succeeded on `2026-10-06 15:12:32-15:16:08 UTC`, with 500 processed and `durationMs: 216361`.
- Latest `trending-aggregate` worker run: succeeded on `2026-10-11 19:48:32-19:48:36 UTC`, with `channelStatsCount: 169`, `trendingTokensCount: 6350`, no count errors, and 4,006 ms duration. Its execution origin (manual vs scheduled) is unknown.
- Historical observations: 3,876 rows, 71 tokens, latest observation `2026-10-06 15:15:26 UTC`, and zero observations in the preceding 24 hours.
- Metrics refreshed in the preceding 24 hours: zero.
- Calls created in the preceding 24 hours: zero.

These are stored database records, not evidence that a worker was launched during Phase 7.2. The newest trending run predates this audit by about 20 hours but does not establish that Railway scheduling is restored.

### Deterministic Backlog Diagnosis

The current price selector still applies `.limit(500)` without a stable `.order(...)`, then loads metrics and sorts only those returned rows. Calls omitted by the initial limit cannot be prioritized by that in-memory sort. The production-shaped one-window sample in Phase 7.1 demonstrated 12,263 eligible calls outside the 500-row sample, including 8,001 older than 30 days; all sampled calls were stale. The confirmed issue is selection coverage, while repeat membership across executions is not proven.

The existing `calls.id`, `calls.called_at`, `call_metrics.current_price_usd`, and `call_metrics.refreshed_at` fields are sufficient for a no-migration deterministic selector. Proposed bounded strategy: page through all eligible open calls in stable `id`-ordered ranges, retrieve their metrics in bounded batches or a verified to-one embedding, merge and globally sort by missing metric/invalid price first, oldest `refreshed_at`, oldest `called_at`, then stable `id`, and only then take 500 for DexScreener processing. Preserve the contract-address eligibility filter and all existing price, retry, $10 PnL, event, observation, and analytics behavior. This strategy is proposed, not implemented or runtime-validated; measure DB/API query volume before adopting it.

### Historical Measurement Readiness

No new observations were written because the price worker did not run. The observation series remains at its October 6 latest timestamp, so current production data still does not support the requested fixed-horizon target windows established in Phase 7.1. The Phase 7 adapter's pagination/truncation risk and the invalid-entry status precedence bug remain unchanged. No horizon metrics were integrated into rankings or UI.

### Changes, Validation, and Remaining Risks

- Files changed in this phase: `kelucalls-work-log.md` only.
- Application code, production schema/data, and configuration changed: NO.
- Commands executed: repository inspection, local process/config-presence check, and read-only Supabase SQL only. No worker/scraper command was executed.
- Tests/lint/typecheck: not rerun; no application code changed.
- Railway scheduling: not restored or deployed.
- Unresolved: price-worker stoppage cause; whether a remote scraper session exists; local credential availability without accessing prohibited files; origin of the October 11 trending run; and query cost of full eligible-call pagination.

### Next Action

Before a manual recovery run, make required worker credentials available to the process through an explicitly authorized non-file mechanism and confirm intended production side effects. For the scraper, separately confirm its Telegram session is not active elsewhere and redact the startup partial-secret logging before launch. Then run one bounded worker at a time and verify each outcome with run records and read-only database snapshots. Do not run the trending worker independently while its RPC refreshes analytics unless that refresh is authorized.

---

## Phase 7.2 — Manual Worker Run Attempt — 2026-10-12

### Preparation

Rechecked the root scripts and current entry points. The exact commands are `node workers/price-update.js` (also `npm run worker:price`), `node workers/trending-aggregate.js` (also `npm run worker:trending`), and `npm run scraper` (`node scraper/index.js`). Both workers support `WORKER_RUN_ONCE=true`; the scraper is continuous and has no one-shot option. `npm run scraper:login` was not run.

At `2026-10-12 16:27:38 UTC`, the local process scan found one `node.exe` but no matching price worker, trending worker, or scraper process. This does not establish whether a Telegram session is active remotely.

The existing process environment lacked all checked worker credential variables: `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_KEY`. The scraper's required variables were also absent: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SCRAPER_SESSION`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Execution Outcome

**Execution blocked before launch.** The worker bootstraps load `.env`/`.env.local`, and the scraper bootstrap loads `.env`; reading those files is expressly prohibited. No already-configured runtime credentials were available in the process environment. No alternate credential path was attempted.

Commands launched: none. Start/finish times, exit codes, cycle counts, provider output, scraper events, and per-run worker output: not applicable. No worker command failed; none was started. No source fix was made.

This is not an assertion that the workers themselves are broken. It is a verified configuration/access blocker under the no-environment-file rule.

### Execution Risks Reconfirmed

- Price-worker one-shot can make up to 500 sequential DexScreener lookups, write call metrics/token prices/observations/events, and invoke public analytics refresh.
- Trending-worker one-shot invokes the analytics refresh function and records a worker run.
- Scraper execution is unbounded, backfills up to 50 messages for every active/paused channel, processes tracking requests, and can write tokens/calls/call metrics. Its startup environment logger emits partially masked values; it must not be run under the no-secret-output requirement without addressing that output. The session's remote use is unverified.

No worker or scraper was started, so these side effects did not occur in this attempt.

### Read-Only Result Verification

A read-only database query at `2026-10-12 16:27:37 UTC` reconfirmed:

- Latest price-worker record: succeeded October 6, 500 processed, 216,361 ms. This is not a Phase 7.2 run.
- Latest trending-worker record: succeeded October 11, 169 channel stats and 6,350 trending tokens, no count errors, 4,006 ms. Its origin is unknown and it is not a Phase 7.2 run.
- `call_metrics` refreshed in the last 24 hours: 0.
- Historical observations: 3,876 total; latest observation October 6; 0 in the last 24 hours.
- Calls created in the last 24 hours: 0.

No worker-specific database changes can be attributed to this attempt. The existing records and snapshots are read-only verification only.

### Changes and Remaining Blockers

- File changed: `kelucalls-work-log.md` only.
- Code, production data, schema, and production configuration changed: NO.
- Worker commands attempted: none.
- Tests/lint/typecheck: not run because no application code changed.
- Railway scheduling restored: NO.
- Blocker: required runtime configuration is not available through the inherited process environment; proceeding would require the prohibited dotenv-file read. The scraper additionally requires session-exclusivity confirmation and non-secret startup output.

### Next Action

Provide the required configuration to the worker process through an explicitly authorized runtime mechanism that does not read or display environment files, and explicitly authorize the normal production side effects of a one-cycle price/trending run. Do not start the scraper until its session is confirmed unused elsewhere and startup output cannot disclose partial secret values. Then execute and verify one process at a time.

### Follow-up Runtime Check — 2026-10-12 17:09 UTC

The inherited PowerShell environment still lacked `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_KEY`. One `node.exe` process was present, with no command line matching either worker. No worker launch was attempted; production remains unchanged.

The launch restriction has an additional code-path blocker: `price-update.js` invokes both `loadWorkerEnv()` and `dotenv.config()` directly; `trending-aggregate.js` invokes `loadWorkerEnv()`; and the scraper's `loadScraperEnv()` invokes `dotenv.config()` for `.env`. Thus, inherited PowerShell variables by themselves do not prevent these entry points from attempting dotenv-file reads. No such file read occurred during this check. A launch under the stated rule requires an explicitly approved, narrowly scoped no-dotenv bootstrap path in the relevant entry points/loaders.

### Scraper Logger Recommendation

Inspection confirms `logEnvStatus()` currently prints the first and last characters of configured credential/session values through `maskValue()`. Proposed minimal fix, not applied: log only `set` or `missing`, without rendering any part of the value, for example `value ? "set" : "missing"`. Remove `maskValue()` if no other caller remains. This changes only startup diagnostics; scraper behavior is otherwise untouched.

---

## Price Worker No-Dotenv Startup Preparation — 2026-10-12

### Change

- Added optional `loadDotenvFiles` to `loadWorkerEnv()` in `workers/worker-utils.js`. Its default is `true`, preserving existing behavior for all current callers. When false, the loader does not probe or load `.env`/`.env.local` and reports dotenv-file existence fields as `undefined`.
- Added the explicit opt-in `PRICE_WORKER_NO_DOTENV=true` to `workers/price-update.js`. In that mode the price worker skips both `loadWorkerEnv()` dotenv loading and its direct `dotenv.config()` call. Without the flag, its previous startup sequence remains unchanged.
- Added `workers/worker-utils.test.js` to check that the disabled loader skips dotenv-file checks and resolves Supabase settings from synthetic process variables.
- `WORKER_RUN_ONCE=true` support is unchanged.
- `workers/trending-aggregate.js` and scraper behavior were not changed; trending still uses the default dotenv-loading path.

### Validation

- `node --test workers/worker-utils.test.js`: 1 passed, 0 failed.
- `npx eslint workers/price-update.js workers/worker-utils.js workers/worker-utils.test.js`: passed.
- `npm run typecheck`: passed.
- Runtime variable-presence check (values not read or printed): `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_KEY` were all absent from the current process environment.

### Production and Runtime State

- Price worker executed: NO.
- Production writes, analytics refresh, migrations, schema changes, and deployment: NONE.
- Scraper: not run; its logger recommendation above remains proposed only.
- No credentials or environment files were accessed.

### Next Manual Test

After configuring the existing process environment securely (never in chat or command text), run exactly one price cycle with:

```powershell
$env:PRICE_WORKER_NO_DOTENV = "true"
$env:WORKER_RUN_ONCE = "true"
node workers/price-update.js
```

The required configuration is one URL (`SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`) and one key (`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_KEY`). The current session has none of these set, so the test remains blocked. This worker cycle performs its normal production updates and analytics refresh; verify and review that output and read-only DB effects before any trending-worker run. Do not infer that scheduling has been restored.

### Risks

- The no-dotenv option is explicit and scoped to the price worker; passing the flag while omitting required variables will still cause startup failure without reading files.
- A successful one-cycle process is not proof of complete backlog recovery; the 500-candidate selector limitation remains unchanged.
- Trending and scraper still load dotenv files and are not enabled for no-dotenv execution by this change.
