## Trending Tokens

**What it is:** `/trending` — tokens getting a lot of call activity right now, independent of any single channel's track record.

**How it works:** A Postgres **materialized view**, `trending_tokens`, aggregates calls per active token from active/paused (non-muted, non-hidden) channels: total calls, unique channels calling it, average ROI, best multiple, and time of last call. `refresh_trending_tokens()` rebuilds it on the same worker schedule as the leaderboard. Chosen as a materialized view specifically because it's read-heavy, already-public data — no per-request computation, no RLS complexity beyond a simple public grant.

**Why a materialized view instead of a table:** It's a derived aggregate, not a source of truth — nothing ever writes to it directly, so keeping it as a view-that-gets-refreshed avoids any possibility of it drifting out of sync with the underlying `calls` data in a way a hand-maintained table could.