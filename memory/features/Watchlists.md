## Watchlists (follow channels/tokens)

**What it is:** `follow-channel-button.tsx` / watchlist pages — save channels or tokens to a personal list, optionally muting one without unfollowing it.

**How it works:** Simple per-user join tables, `user_channel_watchlist` and `user_token_watchlist`, both shaped identically by design (unique on `user_id` + target, plus an `is_muted` flag). Toggled via `setChannelFollowAction()` / `setWatchlistMutedAction()` server actions, gated by the same RLS pattern used everywhere for per-user data: a row is only readable/writable by `user_id = auth.uid()`.

## Channel leaderboard stars and performance alerts (2026-11-19)

The homepage, `/channels`, `/top-callers`, and channel detail pages use the shared `FollowChannelButton` in star mode. Its initial state comes from `getFollowedChannelIds()`; it reuses the existing authenticated server action and does not alter channel ranking.

Following a channel automatically creates a `channel_big_win` rule with in-app milestones `[2, 10, 100]`. Existing alert rules are preserved. Unfollowing removes that channel's milestone rule. Existing watchlist rows are backfilled by migration 023.

`workers/price-update.js` already detects first-time peak-multiple crossings for 2x, 10x, and 100x. It now fans those events out to website `user_notifications` for users who still follow the channel, have not muted it, have the rule active, and have global notifications enabled. `dedupe_key` plus a unique `(user_id, dedupe_key)` constraint prevents repeat delivery for the same call/milestone. Users can customize selected milestones from the watchlist page; pause/resume remains available in Alerts.
