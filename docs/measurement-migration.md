We have enough evidence to start fixing this properly. The review was directionally correct, but the live audit revealed a more fundamental problem underneath several of its observations.

### What we have confirmed today

| Area                            |    Live finding | Meaning                                                  |
| ------------------------------- | --------------: | -------------------------------------------------------- |
| Channels                        |         **171** | Live DB                                                  |
| Tokens                          |       **5,488** | Live DB                                                  |
| Calls                           |      **11,004** | Live DB                                                  |
| Call metrics                    |      **11,003** | One call currently has no metric row                     |
| Metrics refreshed in 24h        |         **446** | **Critical freshness problem**                           |
| Calls created in 7d             |       **1,680** | Data is arriving much faster than metrics are refreshing |
| Metrics with null current price |       **4,903** | **Critical data-quality problem**                        |
| Metrics with zero current price |           **4** | Also needs explicit handling                             |
| Metrics older than 24h          |      **10,557** | Most of the dataset is stale                             |
| Current simulated PnL           | **$219,617.76** | Real calculated data, not hardcoded                      |
| Peak simulated PnL              | **$236,919.87** | Also calculated                                          |
| Largest current PnL call        | **$170,080.44** | One call represents ~77% of current PnL                  |

The biggest discovery is the price worker.

It currently does:

```js
.from("calls")
.select(...)
.eq("status", "open")
.order("called_at", { ascending: false })
.limit(500);
```

So it processes **only the newest 500 open calls** every cycle.

It then runs every 5 minutes.

That means older calls can remain stale indefinitely while new calls continually push them out of the 500-call window.

That explains a large part of the external review's observations.

---

# What we're going to fix first

I don't want to immediately change the Smart Score, cap the 17,009x call, or hide the trending token.

Those are **measurement-policy decisions**.

First we need to make the underlying measurement trustworthy.

### Phase 1 — repair measurement freshness

Change the price worker from:

```text
newest 500 calls
        ↓
refresh them repeatedly
        ↓
older calls never catch up
```

to:

```text
stale calls
      ↓
oldest/stalest first
      ↓
refresh 500
      ↓
next cycle picks the next stale batch
      ↓
eventually entire open-call dataset is refreshed
```

We'll keep the 500-call safety limit so we don't suddenly hammer DexScreener.

We'll also account for calls that have **no `call_metrics` row at all**.

This is the first production fix because everything downstream depends on it.

---

# Phase 2 — make missing prices honest

Right now we have:

**4,903 metrics with `current_price_usd IS NULL`.**

The database isn't necessarily wrong here. A token may genuinely have no usable DexScreener price.

The problem is what the application does with that state.

We should establish a clear state model:

```text
NO ENTRY PRICE
    ↓
Not measurable

ENTRY PRICE + NO CURRENT PRICE
    ↓
Price pending

ENTRY PRICE + CURRENT PRICE
    ↓
ROI measurable

CURRENT PRICE <= 0
    ↓
Invalid price / do not calculate ROI
```

So we should not display:

```text
ROI +0.0%
```

when the actual state is:

```text
current price unavailable
```

That directly addresses the live-call problem from the review.

---

# Phase 3 — remeasure PnL

Once the worker has caught up, we'll calculate:

```text
SUM(call_metrics.simulated_current_pnl_usd)
```

and compare it with:

```text
SUM(channel_stats.simulated_current_pnl_usd)
```

Right now those are already slightly different:

```text
call_metrics:   $219,617.76
channel_stats:  $219,617.05
difference:          $0.71
```

That's small, but it proves we should not blindly trust the dashboard aggregate until we establish a canonical source.

More importantly, we'll record the value **before and after the catch-up**.

That will tell us whether the frozen `$220.6K` observation was primarily caused by the stale measurement pipeline.

---

# Phase 4 — deal with the 17,009x outlier

The outlier is real.

The live database currently has:

```text
Channel: trendingcrypto
Token:   FREEDOM

Entry:   $0.0000001548
Current: $0.002633

ROI:     +1,700,804%
PnL:     +$170,080
```

So the external reviewer wasn't hallucinating the structural problem.

But I don't want to simply delete/cap it.

We should preserve the raw result while changing **how performance is represented**.

The database already has:

```text
average_roi_pct
median_roi_pct
average_peak_roi_pct
best_multiple
```

and `median_roi_pct` is already being calculated by `refresh_channel_stats()`.

That's important.

We don't need to invent another analytics system.

We can eventually expose something like:

```text
Average ROI       +1,537%
Median ROI          +X%
Win rate            13.9%
Best                17,009x
Calls               1,102
```

and clearly distinguish:

> Average performance can be heavily affected by extreme individual outcomes.

That is much more informative than silently clipping the underlying data.

---

# Phase 5 — trending tokens

The reviewer found a token with:

```text
67 calls
16 channels
0.0% ROI
1.00x best
```

We should investigate whether those 67 calls actually have measurable prices.

Because we now know there are **4,903 null current prices**, the 0% ROI may not mean:

> “This token performed exactly 0%.”

It could mean:

> “The system doesn't currently have enough price information to calculate performance.”

Those are completely different things.

So we'll trace the actual token/call records before changing the trending algorithm.

---

# Phase 6 — Smart Score

The current production function really does calculate:

```text
avg ROI × 0.5
+ win rate × 0.3
+ ln(calls + 1) × 0.2
```

This isn't merely documentation drift. The live PostgreSQL function contains it.

And the repository documentation also exposes it.

So the review is correct about that conflict.

But again, I don't want to change the formula while the underlying ROI data is stale.

Otherwise we'd be tuning a scoring system around bad measurements.

---

# Our actual order now

```text
                CURRENT STATE
                     │
                     ▼
        ┌────────────────────────┐
        │ 1. Repair price worker │
        │    freshness/coverage  │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ 2. Handle null/zero    │
        │    prices explicitly   │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ 3. Rebuild analytics   │
        │    and verify PnL      │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ 4. Audit outliers      │
        │    + median ROI        │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ 5. Audit trending      │
        │    token qualification │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ 6. Canonicalize Smart  │
        │    Score methodology   │
        └────────────────────────┘
```

**And importantly: we have not changed Supabase or GitHub yet during this audit.**

The first code change I recommend making is the **price-worker freshness fix**, because it is the root measurement failure behind several of the symptoms the review identified.

After that change is deployed and the worker has had time to cycle through the backlog, we should re-run the exact same audit. That gives us a before/after measurement rather than guessing whether the platform improved.
