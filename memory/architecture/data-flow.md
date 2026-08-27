# Kelucalls — Data-Flow Architecture


## 0. How this doc relates to the other three

- **Frontend doc** — what the browser renders and which lib functions it calls.
- **Database doc** — the tables/views/RLS those functions read and write.
- **Backend doc** — the four runtime processes (web app, scraper, bot, workers) and their internal logic.
- **This doc** — the arrows connecting all of that: which process writes which table, which table feeds which page, and what triggers each pipeline to run.

## 1. System-level flow map

```
┌──────────────┐     scrapes      ┌───────────────┐   parses & writes   ┌──────────────────┐
│ Telegram      │ ───────────────▶│ scraper/       │────────────────────▶│ channels          │
│ channels      │   (GramJS)      │ index.js       │   upsertToken/       │ tokens            │
│ (public)      │                 │ (long-running) │   insertCall         │ calls             │
└──────────────┘                 └───────────────┘                      │ telegram_messages* │
                                                                          └─────────┬─────────┘
                                                                                    │
                          ┌─────────────────────────────────────────────────────────┤
                          │                                                         │
                          ▼                                                         ▼
              ┌────────────────────────┐                              ┌───────────────────────┐
              │ workers/price-update.js │                              │ workers/*-aggregate.js │
              │ (live token prices)     │                              │ refresh_public_        │
              └───────────┬─────────────┘                              │ analytics() SQL fn     │
                          │                                            └───────────┬───────────┘
                          ▼                                                        ▼
                  tokens.last_price_usd                          channel_stats (leaderboard) +
                  call_metrics (ROI/PnL/milestones)               trending_tokens (matview)
                          │                                                        │
                          └───────────────────┬────────────────────────────────────┘
                                              ▼
                                  ┌────────────────────────┐
                                  │ workers/intent-engine.js│  ◀── reads calls, call_metrics,
                                  │ (KeluScore pipeline)    │       channel_stats, tokens
                                  └───────────┬─────────────┘
                                              ▼
                          intent_scores / intent_history / score_changes
                                    │                        │
                                    ▼                        ▼
                  workers/intent-summaries.js       workers/intent-alerts.js
                          │                                  │
                          ▼                                  ▼
                  intent_summaries                  user_notifications ──▶ (also feeds)
                                                              │             apps/bot (Telegraf)
                                                              ▼             via bot_events*
                                                    notification-bell.tsx
                                                    /account/notifications

  * telegram_messages and bot_events are internal-only / service-role-only tables.

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Next.js web app (only public HTTP surface)                                          │
│                                                                                        │
│  @/lib/dashboard-data.ts, @/lib/supabase/queries.ts, @/lib/intent/queries.ts          │
│  read the tables/view above (anon/authenticated, RLS-gated) and render:               │
│    Home dashboard · /channels leaderboard · /trending · /live · /opportunities        │
│                                                                                        │
│  Server actions (@/lib/account/actions.ts, notification-actions.ts) write:            │
│    user_channel_watchlist, user_token_watchlist, user_alert_rules,                    │
│    user_notifications (mark-read), profiles                                           │
│                                                                                        │
│  Public forms write: submissions (channel listing), article_views, ad_impressions/clicks│
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Flow 1 — A Telegram call becomes a leaderboard ranking

This is the platform's core value loop, and it runs across all three of the doc's layers.

1. **Ingestion (scraper process).** `client.addEventHandler(..., new NewMessage({}))` in `scraper/index.js` fires on every new message in a tracked channel. `handleMessage()` runs `parseCallMessage(text)` to detect a contract address / `$SYMBOL` / `CA:` label / GMGN-DEX link, and bails out silently if nothing looks like a call.
2. **Enrichment.** `fetchDexScreenerData(contractAddress)` gets entry price + logo in one request.
3. **Idempotent writes.** `upsertToken()` writes/updates a row in `tokens` (idempotent on `(chain, contract_address_normalized)`); `insertCall()` writes a row in `calls` (idempotent on `(channel_id, telegram_message_id, token_id)`, so a scraper restart or duplicate event never double-counts a call). The channel's `last_scraped_at` is touched.
4. **Metrics catch-up (worker process, scheduled).** `workers/price-update.js` periodically refreshes `tokens.last_price_usd` and recomputes `call_metrics` (current/peak ROI, multiple, `is_win`, milestone flags `hit_2x…hit_100x`, simulated PnL) for every open/closed call against that token's current price.
5. **Analytics rebuild (worker process, scheduled).** `workers/trending-aggregate.js` (or a direct SQL cron) calls the database function `refresh_public_analytics()`, which runs `refresh_channel_stats(null)` (recomputes every channel's `total_calls`, `win_rate_pct`, `average_roi_pct`, and the **Smart Score** `ranking_score` — hard-zeroed for `is_paid_channel = true` channels — see database doc §6) followed by `refresh_trending_tokens()` (`REFRESH MATERIALIZED VIEW public.trending_tokens`).
6. **Read (web app process, on request).** `getDashboardSnapshot()` / `getLeaderboard()` in `@/lib/dashboard-data.ts` read the now-updated `channel_stats` and `trending_tokens` directly — **no computation happens at request time**, the frontend only formats what the workers already computed. The homepage and `/channels`/`/trending` pages opt out of caching (`export const dynamic = "force-dynamic"`, `revalidate = 0`, or `noStore()` inside the data function) since this is live market data that must never be served stale from a cache.

**End-to-end latency** is therefore bounded by the slowest link in the chain: real-time for message capture, but bounded by each worker's schedule for price/ROI updates and leaderboard/trending refresh — there is no push notification from DB→frontend; every page load just re-queries the latest precomputed state.

## 3. Flow 2 — KeluScore (intent engine) pipeline

Already detailed structurally in the backend doc (§3.1–3.5) and the DB doc (§4.9); here's the flow specifically:

```
calls + call_metrics + channel_stats + tokens   (read-only inputs, already fresh from Flow 1)
        │
        ▼
workers/intent-engine.js  runCycle()
        │  uses pure math from intent-scoring.js (composite of 8 weighted sub-scores)
        │  uses intent-signals.js for Dexscreener liquidity/volume/socials (top-N busiest tokens only)
        ▼
UPSERT intent_scores (current)      INSERT intent_history (if score moved ≥ HISTORY_MIN_DELTA)
                                     INSERT score_changes  (if delta ≥ SCORE_CHANGE_THRESHOLD)
        │                                          │
        ▼                                          ▼
workers/intent-summaries.js                workers/intent-alerts.js
  reads intent_scores, calls an              reads score_changes WHERE notified_at IS NULL
  OpenAI-compatible LLM endpoint,            joins against user_alert_rules (rule_type =
  caches result in intent_summaries          'token_intent_spike') + alert-prefs.js gate
        │                                          │
        ▼                                          ▼
intent-panel.tsx / intent-summary.tsx      INSERT user_notifications, THEN UPDATE
  (read-only, "@/lib/intent/queries.ts")   score_changes SET notified_at (at-least-once
  /opportunities page, token detail pages   ordering — see backend doc §3.4)
                                                     │
                                                     ▼
                                          notification-bell.tsx (client-side poll)
                                          /account/notifications page
```

Key property carried over from the backend doc: **the app never scores anything itself.** Every KeluScore-related page is a pure read of `intent_scores`/`intent_history`/`intent_summaries`, which is *why* those three tables are the only place the actual scoring math (weights, saturation curves, grade thresholds) needs to live.

## 4. Flow 3 — Channel submission → moderation → tracked channel

1. **Public submit.** A visitor (anonymous or signed in) fills `submission-form.tsx` on `/listing-policy`. Client component, `useTransition`, posts to a server action that inserts into `submissions` — RLS's `submissions_public_insert` policy forces `status = 'pending'` and, if signed in, stamps `submitted_by = auth.uid()` (a user cannot forge someone else's `submitted_by`).
2. **Admin review.** `/kx-admin` reads `getPendingSubmissions()` (`@/lib/dashboard-data.ts`) — visible only to rows the `admin_users` RLS policy allows. An admin approves or rejects via an admin server action (`createSupabaseAdmin()`, service role) that updates `submissions.status`/`review_notes` and, on approval, either inserts a new `channels` row or links `approved_channel_id`.
3. **Tracking activation.** Approval implies (directly or via a follow-up admin action) a row in `tracking_requests` (migration 004's table), which `scraper/index.js`'s `processTrackingQueue()` polls periodically — picking up the new handle, joining the channel via GramJS, and calling `backfillChannel()` to pull the last ~50 historical messages so the channel isn't empty on day one.
4. **Now in Flow 1.** From here the channel is a normal tracked source and every new message goes through the Flow 1 ingestion pipeline.
5. **Submitter feedback loop.** If the submitter was signed in, `submissions_owner_read` RLS lets them see their own submission's status change on `/account/submissions` — no notification is wired for this specifically (only the KeluScore/watchlist events go through `user_notifications`, per what's documented in the migrations read).

## 5. Flow 4 — User account / auth flow

Two independent identity flows exist; both ultimately touch the same `auth.users` table but never cross paths at runtime (see backend doc §2.2 for the full rationale).

**End-user signup → first page load:**
```
signup-form.tsx (client) → Supabase Auth signUp() via createBrowserClient (cookie-writing)
      │
      ▼
auth.users row created  ──▶  DB trigger on_auth_user_created → handle_new_user() (SECURITY DEFINER)
      │                          auto-inserts a matching `profiles` row
      ▼
Session cookie set (readable by server components/middleware because the browser
client is the cookie-writing @supabase/ssr client, not the plain anon client)
      │
      ▼
Next page load: session.ts's getCurrentUser()/getCurrentProfile() (React cache(),
always supabase.auth.getUser() — never getSession() — validates the JWT signature
server-side rather than trusting the cookie)
```

**Admin sign-in (separate system entirely):**
```
Admin login form → admin/auth.ts server action → verifies credentials against
Supabase Auth (anon client) AND checks admin_users membership (service-role client)
      │
      ▼
On success: buildAdminSessionCookies() writes ADMIN_ACCESS_COOKIE / ADMIN_REFRESH_COOKIE /
ADMIN_EXPIRES_COOKIE (custom cookie session, not a Supabase session)
      │
      ▼
Every subsequent request: middleware.ts checks cookie expiry → if expired, calls
refreshAdminSession() (Next.js-import-free, edge-safe) → rewrites cookies via the
SAME buildAdminSessionCookies() function used at login (single source of truth,
prevents cookie-attribute drift between the two write sites)
      │
      ▼
Admin pages under /kx-admin re-check admin_users membership per-request via RLS
policies embedded in every admin-gated table's policy (exists(...) subquery)
```

## 6. Flow 5 — Monetization: ads and sponsored placements

```
Admin creates/schedules a row in `ads` (popup ads) or `sponsored_placements`
(homepage/trending/tokens/live_feed slots) via /kx-admin, including
starts_at/ends_at and priority.
      │
      ▼
getActiveAds() / getSponsoredPlacements() / getSponsoredTokenPlacements()
(@/lib/dashboard-data.ts) filter by status='active' and the current time window,
ordered by priority — called from the root layout (for AdPopup) and from the
homepage/leaderboard/token pages (for SponsoredPlacementCard, leaderboard-with-placements.tsx)
      │
      ├──▶ Rendered visually distinct from organic results (README requirement,
      │     enforced structurally: sponsored rows come from a different table/
      │     query than the ranked leaderboard, and — per the DB doc §6 — a
      │     paid channel's own ranking_score is hard-zeroed in refresh_channel_stats(),
      │     so sponsorship can never buy a better organic rank)
      │
      ▼
Every impression/click fires an insert into `ad_impressions` / `ad_clicks`
(anon-insertable, ip_hash stored instead of raw IP) — read back only by admins
for campaign reporting, no path back into ranking or scoring data.
```

## 7. Flow 6 — Telegram bot alerts (separate delivery channel from in-app notifications)

There are **two independent notification surfaces** fed by different (sometimes overlapping) triggers:

| Surface | Written by | Read by | Delivery |
|---|---|---|---|
| `user_notifications` (in-app inbox) | `intent-alerts.js`, other alert workers, via server-role insert | `notification-bell.tsx`, `/account/notifications` (`markAllNotificationsReadAction`) | Web only, user must visit the site |
| `bot_events` → Telegram DM | Any worker that detects an event (`achievement`, `new_call`, `trending`, `coordinated_call`) | `apps/bot` (Telegraf), polls/consumes the queue, sends via Telegram, marks `processed = true` | Push, via `@KeluCallsAlerts_bot`, independent of whether the user ever opens kelucalls.com |

A user's bot-side preferences (`telegram_alert_preferences` — chains filter, `min_score`, achievement thresholds, verified-channels-only) are entirely separate rows from their website `user_alert_rules`, linked only informally (same person, two different identity rows: `telegram_users.telegram_chat_id` vs. `auth.users.id`) — there's no DB foreign key joining a website account to a Telegram bot user in the schema as written.

## 8. What triggers what — schedule/trigger summary

| Trigger | Process | Effect |
|---|---|---|
| New Telegram message in a tracked channel | scraper (event-driven, real-time) | `tokens`/`calls` insert |
| Cron/schedule (`worker:price`) | `price-update.js` | `tokens.last_price_usd`, `call_metrics` refresh |
| Cron/schedule (`worker:trending`, or `worker:all`) | `trending-aggregate.js` | `refresh_public_analytics()` → `channel_stats` + `trending_tokens` |
| Cron/schedule (`worker:intent`) | `intent-engine.js` | `intent_scores`/`intent_history`/`score_changes` |
| Cron/schedule, after intent cycle (`worker:alerts`) | `intent-alerts.js` | `user_notifications` insert, `score_changes.notified_at` |
| Cron/schedule (`worker:summaries`) | `intent-summaries.js` | `intent_summaries` (LLM-backed, cost-gated) |
| Weekly/manual (`worker:avatars`) | `channel-avatar-sync.js` | `channels.avatar_url` via Telegram Bot API |
| Manual/scheduled (`worker:logos`) | `token-logo-backfill.js` | token logo backfill |
| Admin action in `/kx-admin` | web app (on request) | `channels`, `ads`, `sponsored_placements`, `submissions` review, `moderation_reports` |
| Public form submit | web app (on request) | `submissions`, `article_views`, `contact` (email, not DB), `ad_impressions`/`ad_clicks` |
| User account action | web app (on request) | `profiles`, `user_*_watchlist`, `user_alert_rules`, `user_notifications` (read/mark-read) |
| Every page load of a live surface | web app (on request, `dynamic="force-dynamic"`/`noStore()`) | Reads only — `channel_stats`, `trending_tokens`, `calls`, `intent_scores`, etc. |

## 9. Notable data-flow design decisions (why, not just what)

- **No request-time computation of anything expensive.** Ranking scores, ROI/PnL, trending aggregates, and KeluScores are all precomputed by workers and only *read* by the web app. This is stated explicitly in multiple places (`intent_scores` comment, `computeRankingScore` mirroring, `refresh_channel_stats`) and is the reason the home/leaderboard/trending pages can stay fast despite doing nontrivial analytics.
- **Idempotency is enforced at the write layer, not the ingestion layer**, via DB unique constraints (`calls` on `(channel_id, telegram_message_id, token_id)`, `tokens` on normalized symbol/contract) rather than the scraper trying to de-duplicate in memory — this means a scraper crash-and-restart, or a duplicate `NewMessage` event, is safe by construction.
- **At-least-once, never at-most-once, for anything user-facing** (bot alerts, in-app notifications) — every place this tradeoff is made, the code comments justify it the same way: a missed alert is a broken feature, a duplicate is only annoying.
- **Sponsorship money never touches the ranking pipeline.** The monetization flow (Flow 5) and the ranking flow (Flow 1) are structurally separate tables and separate queries, and the one place they *could* interact (a paid channel appearing in the leaderboard) is explicitly zeroed out in `refresh_channel_stats()`.
- **External, rate-limited, or costly calls are isolated into their own workers** (Dexscreener signals, LLM summaries) so an outage in a third-party dependency degrades a single feature (missing summary text, missing liquidity sub-score) rather than blocking the core scoring/ranking pipeline.