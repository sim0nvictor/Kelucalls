## Ads & Sponsored Placements

**What it is:** Popup ads (site-wide) and in-context sponsored slots (homepage, trending, tokens, live feed, leaderboard rows) — Kelucalls' monetization surface.

**How it works:** Admins create/schedule rows in `ads` (popups) or `sponsored_placements` (in-context slots), each with a time window (`starts_at`/`ends_at`) and priority. `getActiveAds()` / `getSponsoredPlacements()` filter to currently-active rows and are read by the root layout (for the popup) and by the relevant list pages. Every impression and click fires an insert into `ad_impressions`/`ad_clicks` (storing a hashed IP, not raw), which only admins can read back for reporting.

**The one hard rule enforced structurally, not just visually:** sponsored content is a completely different table and query path from the organic leaderboard/trending data, and — critically — a channel being a paid sponsor **zeroes its own organic Smart Score** at the database level (see Feature 1). Sponsorship literally cannot buy a better ranking; it can only buy placement in a clearly separate, visually distinct slot.
