# Kelucalls — Workers Architecture


## 1. What "workers" means here

Nine `npm run worker:*` scripts, each a standalone Node/ESM process (not part of the Next.js app), reading and writing the shared Supabase Postgres DB. None of them talk to Telegram directly except `channel-avatar-sync.js` (Bot API) — Telegram *ingestion* is the scraper's job (see scraper-architecture doc); workers only ever consume what the scraper already wrote, plus external market-data APIs.

| Script | File | Reads real files? | Purpose |
|---|---|---|---|
| `worker:price` | `workers/price-update.js` | not in this file set | Live token prices → `tokens.last_price_usd`, `call_metrics` ROI/PnL/milestones |
| `worker:trending` | `workers/trending-aggregate.js` | not in this file set | Calls `refresh_public_analytics()` → `channel_stats` + `trending_tokens` |
| `worker:all` | both of the above, backgrounded together | — | Convenience combo script |
| `worker:avatars` | `scripts/channel-avatar-sync.js` | ✅ full source read | Telegram Bot API profile photos → `channels.avatar_url` |
| `worker:logos` | `workers/token-logo-backfill.js` | not in this file set | Token logo backfill (presumably Dexscreener `info.imageUrl`, mirroring what `price-update.js` reads per the comment in `intent-signals.js`) |
| `worker:intent` | `workers/intent-engine.js` | ✅ full source read | KeluScore computation → `intent_scores`/`intent_history`/`score_changes` |
| `worker:alerts` | `workers/intent-alerts.js` | ✅ full source read | Dispatches `score_changes` → `user_notifications` |
| `worker:trending-alerts` | `workers/trending-alerts.js` | not in this file set | An older/separate alert dispatcher for trending tokens, distinct from the KeluScore alert pipeline |
| `worker:summaries` | `workers/intent-summaries.js` | ✅ full source read | LLM narrative generation → `intent_summaries` |

Five of the nine weren't in the file set handed to me (`price-update.js`, `trending-aggregate.js`, `token-logo-backfill.js`, `trending-alerts.js`, and `worker-utils.js` itself) — everything said about them below is inferred from how other workers describe/import them, not read directly. Everything about `intent-engine.js`, `intent-scoring.js`, `intent-signals.js`, `intent-alerts.js`, `intent-summaries.js`, `alert-prefs.js`, and `channel-avatar-sync.js` is read from real source.

## 2. Shared plumbing: `worker-utils.js`

Every KeluScore-era worker (`intent-engine`, `intent-alerts`, `intent-summaries`, and by inference `trending-aggregate`/`price-update` per `intent-engine.js`'s comment "follows the workers/trending-aggregate.js convention") imports the same module rather than each reinventing it:

- **Logging**: `log(level, workerName, message, meta)` / `LOG_LEVELS` — structured, one line per event, same shape as the scraper's own `log()` helper but namespaced per-worker.
- **Env**: `loadWorkerEnv(import.meta.url)` (locates and loads `.env` relative to the calling file, same "walk up to find `package.json`" idea as `scraper-env.js`), `getEnv(name, fallback)`, `getNumberEnv(name, fallback)`, `getSupabaseConfig()` (resolves URL/service-role key from either naming convention, `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` etc.).
- **Batching**: `chunk(array, size)` — used everywhere Supabase's `.in()` filter needs a bounded list, and everywhere a write is split to avoid oversized single requests.
- **Concurrency**: `mapWithConcurrency(items, limit, fn)` — bounded-parallelism map, used for external-API-bound work (Dexscreener lookups, LLM calls) so a worker doesn't fire hundreds of simultaneous requests at a third party.
- **Retries**: `withRetry(fn, { retries, baseDelayMs, shouldRetry, onRetry })` and the predicate `isTransientHttpError` — shared retry/backoff logic so each worker doesn't hand-roll its own, and so "what counts as retryable" (429s, 5xxs, network errors) is defined once.
- **Numbers**: `toFiniteNumber(value, fallback)` — defensive numeric coercion used constantly when reading jsonb/API responses that might contain nulls, strings, or garbage.
- **Observability**: `startWorkerRun(supabase, workerName, meta)` / `finishWorkerRun(supabase, workerName, runId, status, details)` — writes to the `worker_runs` table (database doc §4.1) at the start and end of every cycle, so `/kx-admin` has a live record of every worker's last run, status, and details, without any worker needing its own bespoke logging table.

**Note:** `channel-avatar-sync.js` deliberately does **not** use `worker-utils.js** — it hand-rolls its own tiny `getEnv`/`log`/`getSupabase` inline and never calls `startWorkerRun`/`finishWorkerRun`, so its runs never show up in `worker_runs`. Consistent with it being described as a manual/occasional script (`node channel-avatar-sync.js`, "run once manually or add as a weekly cron") rather than a daemon peer of the others — it predates or was never migrated onto the shared convention.

## 3. The universal worker shape

Every `worker-utils`-based worker (`intent-engine`, `intent-alerts`, `intent-summaries`, and by convention the others) follows the identical pattern:

```js
async function runCycle(supabase, ...) { /* the actual work, returns a summary object */ }

async function main() {
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  let running = false;

  async function runGuardedCycle() {
    if (running) { log(WARN, "Previous cycle still running, skipping"); return; }
    running = true;
    const runId = await startWorkerRun(supabase, WORKER_NAME, { ...config });
    try {
      const summary = await runCycle(supabase);
      await finishWorkerRun(supabase, WORKER_NAME, runId, "succeeded", summary);
    } catch (error) {
      await finishWorkerRun(supabase, WORKER_NAME, runId, "failed", { error: error.message });
    } finally {
      running = false;
    }
  }

  await runGuardedCycle();
  if (process.env.WORKER_RUN_ONCE === "true") return;
  setInterval(runGuardedCycle, POLL_INTERVAL_MS);  // no unref() — see below
}

main().catch((error) => { log(ERROR, "Fatal worker crash", ...); process.exit(1); });
```

Three details repeated verbatim across every worker, each with an explicit code comment explaining *why*:
1. **The `running` boolean guard** — prevents a slow cycle from overlapping with the next scheduled tick (e.g. if a Dexscreener outage makes `intent-engine` take 10 minutes but its interval is 30 — without the guard, nothing would actually double-run here since 10 < 30, but the guard exists for the case where a cycle runs long enough to reach the next tick).
2. **`setInterval` with no `.unref()`** — called out explicitly in both `intent-alerts.js` and `intent-summaries.js`: `unref()` would let Node exit while the timer is still pending, which would silently turn "daemon mode" into "run exactly one cycle and quit." Left ref'd on purpose so the process stays alive.
3. **`WORKER_RUN_ONCE=true`** env var — every worker supports being invoked as a single-shot job (for an external cron scheduler like Railway's cron or a GitHub Action) as an alternative to running as a long-lived daemon with its own internal interval. Same worker code serves both deployment models.

## 4. `intent-engine.js` — the KeluScore orchestrator (529 lines)

The most complex worker. Its own header comment states the guiding constraint: **"writes NOTHING to any pre-existing table and never touches the other workers"** — purely additive, reads `calls`/`call_metrics`/`channel_stats`/`tokens` and writes only to the new `intent_*` tables.

### 4.1 Config (all env-overridable, sensible defaults)
| Var | Default | Meaning |
|---|---|---|
| `INTENT_WORKER_INTERVAL_MS` | 30 min | Cycle interval — chosen because "scoring is cheap, the external collectors are the slow part," and 30 min keeps Dexscreener usage modest while staying fresher than the 48h freshness half-life |
| `INTENT_LOOKBACK_DAYS` | 30 | Only tokens called within this window are scored at all |
| `INTENT_SIGNAL_MAX_TOKENS` | 150 | Cap on tokens refreshed with external signals per cycle, ranked by call activity — protects Dexscreener rate limits |
| `INTENT_SIGNAL_CONCURRENCY` | 4 | Bounded parallelism for external calls |
| `INTENT_SCORE_CHANGE_THRESHOLD` | 5 | Minimum score movement to log a `score_changes` row (and therefore trigger an alert) |
| `INTENT_HISTORY_MIN_DELTA` | 1 | Minimum score movement to append an `intent_history` row — stops the history table growing unbounded on static-score tokens |

### 4.2 Query strategy — explicitly O(1) round trips, not O(tokens)
The header comment flags this as a deliberate design choice: "naive code here would be O(tokens) round trips." Every table is read via a small number of **bulk, paginated** queries (`selectAllPages()` for full-table-ish reads, `selectByIds()` for targeted joins) and then joined **in memory** in JS. The only genuinely per-item network work is the capped, concurrency-limited external Dexscreener call — everything else is batch SQL.

### 4.3 The cycle, step by step (`runCycle`)
1. `isoDaysAgo(LOOKBACK_DAYS)` bounds the `calls` read.
2. Pull `calls` in the lookback window (paginated), `aggregateCalls()` groups them per token into 24h/7d/30d counts and unique-channel sets.
3. Pull `channel_stats` for every channel that appears in those calls, via `selectByIds()`.
4. `averageCallerWinRate(channelIds, channelStatsMap)` — the average win rate across all channels that have called a given token (feeds `convictionScore`).
5. Pull `call_metrics` for the relevant calls, `tokenPerformance(callIds, metricsMap)` derives win rate and average peak multiple per token (feeds `performanceScore`).
6. Pull `tokens` rows for context (contract address, for the Dexscreener lookup key).
7. Pull `existingScores` — the current `intent_scores` rows, via `selectByIds()`, so the cycle knows each token's *previous* score for delta computation.
8. **Signal collection** (`collectExternalSignals`): rank candidate tokens by recent call volume, take the top `SIGNAL_MAX_TOKENS`, and for each (bounded by `SIGNAL_CONCURRENCY` via `mapWithConcurrency`) call `collectDexscreenerSignals()` and — if `X_BEARER_TOKEN` is configured — `collectXSignals()`.
9. **Score every token**: `computeKeluScore()` (pure function from `intent-scoring.js`) with the aggregated call counts, average win rate, token performance, hours-since-last-call, and whatever external signals were collected (or `null`s if not).
10. **Write, chunked (`WRITE_CHUNK_SIZE = 100`)**:
    - Upsert `intent_scores` on conflict `token_id` — always, for every scored token.
    - Insert `intent_history` **only if** `|newScore - previousScore| >= HISTORY_MIN_DELTA`.
    - Insert `score_changes` **only if** `|newScore - previousScore| >= SCORE_CHANGE_THRESHOLD`.
    - Insert `project_signals` rows via `toProjectSignalRows()` for every external signal actually collected this cycle (raw + derived fields, from `intent-signals.js`).
11. Per-chunk write errors are logged and **skipped, not fatal** — one bad batch doesn't abort the whole cycle; the cycle's summary object reports counts (scored, historyWritten, changesWritten, signalsCollected, errors) which is what lands in `worker_runs`.

## 5. `intent-scoring.js` — the pure scoring model (385 lines)

Header comment: **"No I/O, no Supabase, no network, no clock reads"** — every exported function is a pure function of its inputs, specifically so the entire scoring model is unit-testable without a database or network, and so there is exactly one place in the whole codebase the KeluScore math lives (the frontend's `computeRankingScore` in `@/lib/metrics.ts` is a *different*, simpler formula for the channel Smart Score — not related to this).

### 5.1 Weights (`SCORE_VERSION = 1`)
| Sub-score | Weight | What it measures |
|---|---|---|
| conviction | 0.28 | Caller quality × breadth confidence |
| momentum | 0.24 | Burst of recent activity vs. the token's own baseline |
| breadth | 0.16 | Number of independent calling channels |
| performance | 0.16 | Historical win rate + average peak multiple on this token |
| freshness | 0.08 | Exponential recency decay |
| liquidity | 0.04 | Dexscreener liquidity + volume (nullable) |
| marketing | 0.02 | Website/socials presence signal (nullable) |
| community | 0.02 | Twitter follower count (nullable, requires `X_BEARER_TOKEN`) |

### 5.2 `composite(subScores)` — renormalization over available data
Rather than defaulting a missing sub-score to 0 (which would drag every token's score down whenever any one external signal is uncollected), `composite()` **renormalizes the weights over only the sub-scores that are non-null** — this is the code-level enforcement of the DB comment "null means not enough data, never default to 0" (database doc §4.9).

### 5.3 `saturate(value, halfPoint)` — the shared diminishing-returns curve
`value / (value + halfPoint)` — used by nearly every sub-score instead of linear scaling, so no single large outlier (e.g. one token with 400 calls) can flatten the rest of the distribution the way a linear scale would. `halfPoint` is chosen per-metric to set where the curve crosses 50%.

### 5.4 Sub-score formulas, as actually implemented
- **`convictionScore({ averageWinRatePct, uniqueChannels })`** — win-rate quality scaled by a confidence factor that grows with `saturate(uniqueChannels, 2)`, so a single 70%-win-rate channel still outweighs five unknown ones, but breadth matters.
- **`momentumScore({ calls24h, calls7d, calls30d })`** — compares 24h activity against the token's **own trailing baseline**: `baseline = max(dailyFrom30d, dailyFrom7d, 0.05)`, then blends a burst ratio (70% weight) with absolute volume (30% weight). A token that normally gets one call/week suddenly getting four in a day scores higher than a constantly-busy token having an average day.
- **`breadthScore({ uniqueChannels })`** — `100 × saturate(uniqueChannels, 4)`. Exists specifically to separate organic spread from one channel spamming the same token repeatedly.
- **`performanceScore({ winRatePct, averagePeakMultiple })`** — 60% win rate + 40% `saturate(averagePeakMultiple - 1, 2)` when both are known; falls back to whichever one is available; returns 0 only if neither is known.
- **`freshnessScore({ hoursSinceLastCall })`** — exponential decay, **48-hour half-life**: a token called 2 days ago scores 50, 4 days ago scores 25. Explicitly the mechanism that "stops the Opportunities board filling up with stale winners."
- **`liquidityScore({ liquidityUsd, volume24hUsd })`** — average of `saturate(liquidityUsd, 100000)` and `saturate(volume24hUsd, 250000)` (whichever are known); **returns `null`**, not 0, when Dexscreener hasn't been collected yet.
- **`marketingScore({ hasWebsite, socialCount })`** — 40 points for having a website + up to 60 points for social link count (`saturate(socialCount, 2)`, capped). Comment flags this is deliberately a *presence* signal, not engagement, weighted low (0.02) "until real engagement data exists." Returns `null` if neither field is known.
- **`communityScore({ twitterFollowers })`** — `100 × saturate(twitterFollowers, 20000)`. Returns `null` until `X_BEARER_TOKEN` is configured (see §6.2) — comment: "Requires the X collector... Returns null until then, and the UI must render null as unavailable rather than as zero."
- **`gradeFor(score)`** — A ≥75, B ≥55, C ≥35, else D.

### 5.5 `buildSignals()` / `buildRecommendations()` — human-readable output
Both are rule-based (not LLM-generated — that's `intent-summaries.js`'s job) and produce the bullet points shown in `intent-panel.tsx`. Examples actually in the code: "3 independent channels have called this" (positive, breadth ≥3), "Only one channel has called this" (warning, breadth =1), "Called by historically accurate channels" (positive, conviction ≥60), "Call activity has gone quiet" (warning, freshness <25), "Thin liquidity" (warning, liquidity <20), "No external project data collected yet" (neutral, when both marketing and community are null — explicitly worded "unavailable, not zero"). Recommendations follow the same if/then pattern ("Verify independently before acting" when breadth <30 with nonzero 30d calls; "Position size should account for slippage" when liquidity <20; falls back to "Not enough signal yet to draw a strong conclusion" if nothing else fired).

### 5.6 `computeKeluScore(input)` — the single entry point
Normalizes the raw input object (defaulting undefined → `null` or `0` per field, never silently coercing a missing external signal into a fake zero), computes all eight sub-scores, composites them, grades the result, and returns `{ version, keluScore, grade, scores, signals, recommendations, inputs }` — the `inputs` field is stored verbatim into `intent_scores.inputs jsonb` for explainability (database doc §4.9), so a score can always be traced back to exactly what data produced it.

## 6. `intent-signals.js` — external data collection (264 lines)

### 6.1 Dexscreener (`collectDexscreenerSignals`)
Explicitly a **reuse**, not a new integration: the header comment notes `workers/price-update.js` already calls this exact endpoint but only reads `priceUsd`, `marketCap`, `chainId`, `info.imageUrl` and discards volume/liquidity/socials — this collector hits the *same* endpoint and extracts what that worker throws away, so no new provider or extra request budget is introduced. Every contract can have multiple trading pairs; picks whichever has the **deepest liquidity** ("the one a real buyer would route through") rather than the first result. Extracts `liquidityUsd`, `volume24hUsd`, `priceChange24hPct`, `hasWebsite`, `socialCount`, and a parsed `twitterUrl`. Wrapped in `withRetry` (3 attempts, `isTransientHttpError` predicate) and a catch-all that returns `null` on any failure — "a provider outage must not fail the scoring cycle."

### 6.2 X/Twitter (`collectXSignals`) — deliberately inert by default
The comment is unusually explicit about this being an intentional no-op state: "the X API v2 has no free tier for user lookup, so this returns null on every call until you add a paid token. That keeps `community_score` honestly NULL rather than faked." No code change is needed to activate it later — just set `X_BEARER_TOKEN`, and `communityScore`/`project_signals` start populating on the next cycle. `extractTwitterUsername(url)` is hand-written **without a regex**, walking the URL string manually (find `://`, find next `/`, strip query string, strip leading `@`) — presumably for parsing clarity/predictability over regex edge cases on arbitrary user-supplied social URLs.

### 6.3 `toProjectSignalRows()` / `toSnakeCase()`
Flattens whatever a collector returned into the generic `project_signals` row shape (`source`, `signal_type`, `value_numeric`/`value_text`/`payload`) — this is the code-level implementation of the DB doc's observation that `project_signals` is deliberately generic so a new data provider is "just a new `source` string, never a schema change." `toSnakeCase()` is also hand-written without regex for the same predictability reason as `extractTwitterUsername`.

## 7. `intent-alerts.js` — dispatch to `user_notifications` (full read, §above)

Already summarized in the backend doc; the full source (read in this session) confirms and adds:

- **`RULE_TYPE = "token_intent_spike"`** — the only `user_alert_rules.rule_type` this worker consumes; other rule types (`channel_new_call`, etc.) belong to different dispatchers.
- **`ruleMatches(rule, change)`** — a rule with no `token_id` watches *every* token; one with a `token_id` watches only that token. Thresholds (`min_delta`, `min_score`, `direction`) live inside `conditions jsonb`, not as dedicated columns — comment: "new knobs never need a migration."
- **Two independent mute layers compose, they don't override each other**: the per-rule `is_active` flag *and* the account-wide master switch (`alert-prefs.js`'s `notificationsEnabled()`) are both checked. Comment: "turning the master switch back on restores exactly the rules that were already there" — i.e. flipping the global switch never silently disables/re-enables individual rules.
- **Empty-result short-circuits still mark rows dispatched.** If there are zero active rules, or zero rules pass the preference filter, the worker still calls `markNotified()` on every pending `score_changes` row before returning — otherwise, per the comment, "every future cycle rescans the same growing backlog for nothing."
- **`deliveryChannels` gap tracking**: `user_alert_rules.delivery_channels` can include `email`/`telegram`, but only `in_app` is actually implemented here — any non-`in_app` channel increments an `unsupportedDelivery` counter in the summary (visible in `worker_runs`) rather than either fulfilling it or failing silently. Rows that specify only unsupported channels are skipped entirely (no notification built).
- **Write-then-mark ordering, exactly as documented**: `user_notifications` insert happens fully before `markNotified()` runs — "Only after delivery attempts" — implementing the at-least-once guarantee described in the data-flow doc.
- After dispatch, updates `user_alert_rules.last_triggered_at` for every rule that actually fired (deduplicated, chunked) — this is what would drive a "last triggered" display if the alert-rule UI shows one.
- `POLL_INTERVAL_MS` default 5 minutes, `MAX_CHANGES_PER_CYCLE` default 200.

## 8. `intent-summaries.js` — LLM narrative generation (370 lines, full read)

- **Transport**: raw `fetch` to an OpenAI-compatible `/chat/completions` endpoint (`OPENAI_BASE_URL`, default `https://api.openai.com/v1`; `INTENT_SUMMARY_MODEL`, default `gpt-4o-mini`) — comment explains the no-SDK choice twice over: adding an SDK without regenerating `package-lock.json` breaks `npm ci` on Vercel, and "the REST call is a dozen lines." Also means swapping providers is a one-env-var change.
- **Inert without a key**: if `OPENAI_API_KEY` is unset, `main()` logs and returns immediately — "This worker is inert and exiting cleanly... It never writes a placeholder or a fabricated summary."
- **System prompt hard rules** (verbatim structure, not reproduced verbatim here per copyright practice, but the substance): use only the provided data, never invent numbers/dates/partnerships; a null sub-score must be described as unavailable, never as zero/weak/bad; never predict prices or give financial advice or say buy/sell; describe caller behavior and data quality, not project fundamentals ("which you know nothing about"); 2–3 sentences, plain text, no hype words.
- **`needsSummary(score, existing)`** — regenerates when: no existing summary; `prompt_version` changed (`PROMPT_VERSION = 1` currently — bumping this forces a full regen fleet-wide); score moved by ≥`INTENT_SUMMARY_REGEN_DELTA` (default 5) since the cached summary was generated; or the cached summary is older than `INTENT_SUMMARY_STALE_HOURS` (default 168h = 7 days).
- **Cost controls, explicit design goal**: `MAX_TOKENS_PER_CYCLE` (default 40 — meaning 40 *tokens/coins*, not LLM tokens, i.e. at most 40 crypto tokens get a summary attempt per cycle, ranked by current `kelu_score` descending), `CONCURRENCY` (default 2), `MAX_OUTPUT_TOKENS` (default 220 LLM tokens), `REQUEST_TIMEOUT_MS` (30s), `POLL_INTERVAL_MS` (default 6 hours — much slower cadence than `intent-engine`'s 30 min, matching that summaries change far less often than scores).
- **Retry policy distinguishes error classes**: a 429 or 5xx is marked `error.retryable = true` and retried (via `withRetry`, 3 attempts, 2s base delay); a 400/401 is not retried — "a bug or a bad key and retrying just burns time."
- Results are upserted into `intent_summaries` on conflict `token_id`, truncated to 2000 chars, with `model`, `prompt_version`, `score_at_generation`, `generated_at` stamped — exactly the fields `needsSummary()` reads back next cycle.

## 9. `alert-prefs.js` — shared notification gate (78 lines, full read)

Small but load-bearing: the module docstring states the reason it's factored out at all — **"every dispatcher has to answer the same question... putting that in one place means a new alert type cannot accidentally ignore the master switch."**

- `NOTIFICATIONS_ENABLED_KEY = "notifications_enabled"` — must be kept in sync with the identically-named constant in `@/lib/account/alert-options.ts` (frontend); the comment explicitly calls out that renaming one without the other silently breaks the switch.
- `notificationsEnabled(preferences)` — **absent means on**. Read as: if `preferences[KEY]` is `undefined`/`null`, treat as enabled; only an explicit `false` disables. Necessary because accounts created before this switch existed have empty `preferences` and must keep receiving the alerts they explicitly subscribed to via `user_alert_rules`.
- `loadEnabledUserIds(supabase, userIds, workerName)` — **fails open**, and says so explicitly in the docstring: if the `profiles` read errors, that whole batch of users is treated as *enabled* rather than muted, because the caller (`intent-alerts.js`) marks the source `score_changes` rows dispatched right afterward regardless — "An extra notification is recoverable, a missing one is not." Also treats a user with no `profiles` row at all as enabled (never explicitly opted out of anything).

## 10. `channel-avatar-sync.js` — standalone, not on the shared convention (130 lines, full read)

Already summarized in the scraper doc's context; key points specific to its role as a worker:
- Uses the **Telegram Bot API** (`getChat` → `photo.big_file_id` → `getFile` → build a `https://api.telegram.org/file/bot{token}/{path}` CDN URL), not GramJS — the only worker that talks to Telegram at all, and it does so as a bot, not the scraper's logged-in user account.
- Iterates every `active`/`paused` channel (a commented-out `.is("avatar_url", null)` filter shows the intent to optionally run backfill-only mode), fetches, and skips the update entirely if the resolved URL is unchanged from what's stored — avoiding needless writes.
- **Self-imposed rate limit**: a flat 150ms sleep between channels ("Telegram allows ~30 req/s per bot") — the only worker with an explicit inter-request throttle rather than relying on `withRetry`/concurrency limiting.
- A 400 response from Telegram (channel not found / private) is treated as an expected, silent "no avatar" outcome, not an error worth logging above `DEBUG`.
- Does not participate in `worker_runs` — see §2.

## 11. Cross-cutting patterns across the whole workers layer

- **Fail-soft toward the user-facing feature, fail-loud toward observability.** Every worker's individual-item failures (a bad Dexscreener response, an LLM timeout, a failed write batch) are logged and skipped rather than aborting the cycle, but the *cycle's own* success/failure and full summary always land in `worker_runs` (except `channel-avatar-sync.js`) — so partial degradation is invisible to end users but fully visible to admins.
- **Null is a first-class value, not an edge case**, throughout the KeluScore worker set — every sub-score formula, the composite renormalization, the LLM prompt's hard rules, and the frontend contract all agree: missing data must render as "unavailable," never coerced to zero. This single principle is enforced independently at four different layers (DB comment, scoring math, LLM prompt, alert-prefs fail-open logic) rather than in one place, which is presumably why it's repeated so often in the comments — it's a rule easy to violate accidentally at any one of those layers.
- **Every external integration is designed to degrade to "off" cleanly** rather than error: no `OPENAI_API_KEY` → summaries worker exits clean; no `X_BEARER_TOKEN` → community score stays null forever; Dexscreener down → liquidity/marketing stay null for that cycle. None of these require a code change to later enable — just an env var.
- **Additive-only extends to the worker layer, not just migrations**: `intent-signals.js` reuses `price-update.js`'s existing Dexscreener call pattern instead of adding a second call; `intent-alerts.js` is a new worker rather than a new branch in an existing one, specifically so a bug in alerting can never block scoring.
- **Same daemon/cron duality everywhere** (`WORKER_RUN_ONCE`), same guarded-cycle/no-unref pattern everywhere — a new worker author has a template to copy exactly, and the comments in each file seem to assume the reader has seen the pattern before ("follows the workers/trending-aggregate.js convention").