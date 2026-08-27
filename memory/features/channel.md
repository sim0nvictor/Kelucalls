## Channel Profiles

**What it is:** `/channels/:slug` — a single channel's full track record: every call, win rate, ROI history, verification badge.

**How it works:** `getChannelDetail()` reads the channel's row, its precomputed `channel_stats`, and its recent `calls`/`call_metrics`. `callers-chart.tsx` visualizes performance over time. A channel's `is_verified` flag (admin-controlled) and `is_paid_channel` flag both surface here — the latter as the reason a channel might have strong-looking metrics but a zeroed public rank.
