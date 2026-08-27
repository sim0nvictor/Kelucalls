## Watchlists (follow channels/tokens)

**What it is:** `follow-channel-button.tsx` / watchlist pages — save channels or tokens to a personal list, optionally muting one without unfollowing it.

**How it works:** Simple per-user join tables, `user_channel_watchlist` and `user_token_watchlist`, both shaped identically by design (unique on `user_id` + target, plus an `is_muted` flag). Toggled via `setChannelFollowAction()` / `setWatchlistMutedAction()` server actions, gated by the same RLS pattern used everywhere for per-user data: a row is only readable/writable by `user_id = auth.uid()`.

