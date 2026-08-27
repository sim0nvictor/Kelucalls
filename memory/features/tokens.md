## Token Market / Token Detail Pages

**What it is:** `/tokens` and individual token pages — price charts, DEX data, and every channel that's called this token.

**How it works:** `token-market.tsx` handles search/sort/live-refresh of the market list via snapshot helpers in `@/lib/token-market.ts`. Individual token pages embed a live Dexscreener chart (this is why the site's Content-Security-Policy has specific `connect-src`/`frame-src` exceptions carved out — an earlier, stricter CSP silently broke this chart before the directives were made explicit). `dex-chart.tsx`/`token-chart.tsx` render price history via `recharts`; the KeluScore panel, if the token has one, appears alongside.
