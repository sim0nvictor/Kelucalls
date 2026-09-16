## Token Market / Token Detail Pages

**What it is:** `/tokens` and individual token pages — price charts, DEX data, and every channel that's called this token.

**How it works:** Token discovery and `token-logo-backfill.js` resolve DexScreener image URLs at worker time, download the image, and upload it to the public Supabase Storage `assets` bucket. Only the stable Storage URL is written to `tokens.logo_url`, keyed by chain and contract address. `token-market.tsx` handles search/sort/live-refresh of market data via snapshot helpers in `@/lib/token-market.ts`; page rendering does not recover logos from DexScreener. Individual token pages embed a live Dexscreener chart (this is why the site's Content-Security-Policy has specific `connect-src`/`frame-src` exceptions carved out — an earlier, stricter CSP silently broke this chart before the directives were made explicit). `dex-chart.tsx`/`token-chart.tsx` render price history via `recharts`; the KeluScore panel, if the token has one, appears alongside.

`TokenAvatar` shows the stored logo when available and falls back to symbol initials when it is missing or fails to load. Static well-known-token mappings remain a fallback for symbols without contract addresses.
