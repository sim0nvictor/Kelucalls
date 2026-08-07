# KeluScore (TM) - Crypto Intent Engine

KeluScore turns the call data Kelucalls already collects into a single
0-100 measure of how much genuine, credible interest a token is attracting
right now.

This document covers the architecture, the scoring model, and how to run and
extend the engine.

---

## Why this design

The defensible part of Kelucalls is not "who is talking about a token" -
anyone can scrape that. It is **who is talking, and are they usually right**.
Kelucalls is already tracking every caller's historical win rate in
`channel_stats`. KeluScore is what turns that dataset into a product.

---

## Data flow

```
calls + call_metrics + channel_stats + tokens   (existing, read only)
            |
            v
  workers/intent-engine.js                      (new)
            |
            +--> intent_scores     current score per token
            +--> intent_history    time series for the Timeline chart
            +--> score_changes     material moves, feeds Phase 3 alerts
            +--> project_signals   raw external data (Dexscreener, X)
            |
            v
  Opportunities dashboard + Intent tab          (Phase 2)
```

**The app never computes a score.** It reads finished rows. This is the single
most important rule in the module:

- the maths exists in exactly one place and cannot drift
- page loads pay nothing for scoring
- the model can be rewritten without touching a component

---

## The scoring model

All sub-scores are 0-100. The composite is a weighted mean that
**renormalises over whichever sub-scores are actually available**.

| Sub-score | Weight | What it measures | Source |
| --- | --- | --- | --- |
| Conviction | 0.28 | Are the callers historically accurate | `channel_stats.win_rate_pct` |
| Momentum | 0.24 | Is activity accelerating vs its own baseline | `calls.called_at` |
| Breadth | 0.16 | How many independent channels | distinct `calls.channel_id` |
| Performance | 0.16 | What happened to previous calls | `call_metrics` |
| Freshness | 0.08 | Decay since the last call | `calls.called_at` |
| Liquidity | 0.04 | Can you actually exit | Dexscreener |
| Marketing | 0.02 | Website and social presence | Dexscreener |
| Community | 0.02 | Audience size | X (needs a paid token) |

### Null is not zero

`marketing_score`, `community_score` and `liquidity_score` are **nullable**.
Null means *no data collected yet*, and the UI must render it as a dash, never
as a zero. A token with no marketing data is unknown, not bad.

Because the composite renormalises, adding a data source later improves
accuracy without rescaling existing scores.

### Saturating curves, not linear scaling

Every raw metric passes through `saturate(value, halfPoint)`, which returns 0
at 0, exactly 0.5 at `halfPoint`, and approaches 1 without reaching it.

Crypto metrics are heavy tailed. With linear scaling a single token with 400
calls would flatten every other token to near zero. Saturation keeps the
leaderboard readable.

### Grades

| Grade | Score |
| --- | --- |
| A | 75 and above |
| B | 55 - 74 |
| C | 35 - 54 |
| D | below 35 |

### Growth Score

The Intent tab shows a "Growth Score". It is **not** a stored column - it is
derived in `src/lib/intent/types.ts` as `0.6 * momentum + 0.4 * breadth`,
because growth is precisely how fast a token is spreading across independent
channels. Deriving it keeps one source of truth.

---

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/006_kelu_score.sql` | The four new tables. Additive only. |
| `workers/intent-scoring.js` | Pure scoring maths. No I/O, fully testable. |
| `workers/intent-signals.js` | External collectors (Dexscreener, X). |
| `workers/intent-engine.js` | Orchestration: read, score, write. |
| `src/lib/intent/types.ts` | App-facing types and row mapping. |

---

## Running the worker

```bash
# one pass, then exit - good for cron and for testing
WORKER_RUN_ONCE=true npm run worker:intent

# continuous daemon
npm run worker:intent
```

### Configuration

All optional, all with sensible defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `INTENT_WORKER_INTERVAL_MS` | 1800000 (30 min) | Cycle interval |
| `INTENT_LOOKBACK_DAYS` | 30 | Only score tokens called this recently |
| `INTENT_SIGNAL_MAX_TOKENS` | 150 | Cap on Dexscreener lookups per cycle |
| `INTENT_SIGNAL_CONCURRENCY` | 4 | Parallel external requests |
| `INTENT_SCORE_CHANGE_THRESHOLD` | 5 | Points of movement before logging a change |
| `INTENT_HISTORY_MIN_DELTA` | 1 | Points of movement before writing history |
| `X_BEARER_TOKEN` | unset | Enables the X collector |

The worker reuses the existing Supabase config resolution from
`worker-utils.js`, so no new credentials are needed beyond the service role
key the other workers already use.

---

## External data

### Dexscreener - live now, free

`workers/price-update.js` already calls the Dexscreener token endpoint, but
only reads price, market cap, chain and logo. It **discards** volume,
liquidity and socials.

`intent-signals.js` reads the *same* endpoint and picks up the discarded
fields. No new provider was introduced and `price-update.js` was not modified.

Where a token has several pairs, the deepest-liquidity pair is used, since
that is the one a real buyer would route through.

### X - inert until credentials exist

The X API v2 has no free tier for user lookup. `collectXSignals()` returns
`null` on every call while `X_BEARER_TOKEN` is unset, which keeps
`community_score` honestly NULL instead of faked.

When you add the token, the collector starts populating on the next cycle.
**No schema change and no code change required.**

---

## Performance notes

The naive version of this worker would issue one query per token. Instead:

- recent calls are read in paginated bulk
- `channel_stats`, `call_metrics` and `tokens` are fetched in chunked bulk
  queries and joined in memory
- the only per-token network call is Dexscreener, which is capped by
  `INTENT_SIGNAL_MAX_TOKENS` and ordered by call activity
- `intent_history` is only written when a score actually moves

---

## Extending the engine

**Add a new data source:** write a collector in `intent-signals.js` returning
a plain object, and emit rows via `toProjectSignalRows()`. `project_signals`
is a generic `(source, signal_type, value)` bag, so a new provider is a new
source string - *not* a migration.

**Add a new sub-score:** add the pure function to `intent-scoring.js`, add its
weight to `WEIGHTS`, add the column to `intent_scores`. Return `null` when the
data is missing and the composite handles the rest.

**Change the model:** bump `SCORE_VERSION`. It is persisted in
`intent_scores.inputs.version`, so historical rows stay interpretable.

---

## Safety guarantees

- Migration 006 is **additive only** - no existing table is altered, renamed
  or dropped.
- The worker **reads** existing tables and writes only to `intent_*`,
  `score_changes` and `project_signals`.
- Existing workers, APIs, routes and components are untouched.
- RLS: score tables are publicly readable like `trending_tokens`.
  `project_signals` has RLS enabled with **no** public policy, because
  payloads can contain raw third-party responses.
