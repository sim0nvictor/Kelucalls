## Channel Leaderboard (Smart Score ranking)

**What it is:** The core `/channels` ranking — every tracked Telegram channel ranked by how good its calls have actually turned out to be, not by follower count or hype.

**How it works:**
1. The scraper detects a "call" in a channel's message (a token symbol/contract mention) and records it in `calls`, with a starting `call_metrics` row.
2. `workers/price-update.js` periodically refreshes each call's current price against the live market, recomputing ROI%, multiple, `is_win`, and milestone flags (`hit_2x` through `hit_100x`) in `call_metrics`.
3. `workers/trending-aggregate.js` calls the database function `refresh_channel_stats()`, which recomputes each channel's aggregate row in `channel_stats` — total calls, win rate, average ROI, milestone counts, simulated PnL, and the **Smart Score**:
   `Score = AvgROI × 0.5 + WinRate × 0.3 + log(TotalCalls + 1) × 0.2`
4. **Paid/sponsored channels are hard-zeroed** in this same formula — a channel flagged `is_paid_channel` gets `ranking_score = 0` no matter how good its calls are, enforced at the database level so sponsorship can never buy a better organic rank.
5. The frontend never computes any of this — `getLeaderboard()` just reads the already-ranked `channel_stats` table and renders it through `leaderboard-with-placements.tsx` / `data-table.tsx`.

**Why it's designed this way:** All the expensive math happens in scheduled workers, not on page load, so the leaderboard page stays fast. The paid-channel zeroing is structural (a DB formula), not a UI filter, so it can't be bypassed by a future feature that reads the table differently.