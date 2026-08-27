## Simulated PnL & Milestone Tracking

**What it is:** The "if you'd invested $10 in every call" performance numbers shown on the leaderboard and channel profiles, plus badges like "hit 5x," "hit 100x."

**How it works:** Every `call_metrics` row is seeded at insert time with a fixed `simulated_investment_usd` (default $10) and is updated on each `price-update.js` cycle to reflect current price against entry price — computing `current_multiple`, `peak_multiple`, and boolean milestone flags (`hit_2x` through `hit_100x`) the moment a call's peak price crosses each threshold. These roll up into `channel_stats`' aggregate PnL and milestone counts, which is what the leaderboard's PnL sort actually reads.
