## Live Call Feed

**What it is:** `/live` — a real-time-feeling stream of the newest calls across all tracked channels.

**How it works:** `getLiveCalls()` reads the most recent `calls` rows (joined with `call_metrics` for live price context) with `dynamic = "force-dynamic"`/`revalidate = 0` so the page never serves a stale cache. `live-ticker.tsx` and `live-market-cells.tsx` handle the client-side polling/refresh so numbers update without a full page reload. The underlying "live" latency is really: however fast the scraper caught the Telegram message, plus however recently `price-update.js` last ran — there's no push/websocket layer, the frontend just re-polls.
