# Kelucalls — Database Architecture

*Reference notes for Claude memory. Compiled directly from the 8 SQL migrations in the project (`001_kelucalls_baseline.sql` → `008_intent_summaries.sql`). Written Aug 2026.*

## 1. Platform

- **Postgres via Supabase.** Extensions: `pgcrypto` (UUIDs), `citext` (case-insensitive text for slugs/handles/emails).
- Every table uses `uuid primary key default gen_random_uuid()` unless it's a 1:1 extension of `auth.users` (then the PK *is* `auth.users.id`).
- A single shared trigger function, `public.set_updated_at()`, is attached to almost every mutable table to maintain `updated_at`.
- Two Supabase Storage buckets: `admin-assets` (baseline) and `ad-banners` (added in 004), both public buckets managed via service role.
- Security model throughout: **RLS enabled on every table**, `anon`/`authenticated` get only what's explicitly granted (mostly `select`), and privileged writes go through `service_role` (which bypasses RLS) or through an `admin_users` membership check embedded in the policy itself.

## 2. Migration history (chronological)

| # | File | Purpose |
|---|---|---|
| 001 | `001_kelucalls_baseline.sql` | Full schema reset + rebuild: source/intelligence/analytics/monetization/community layers, enums, RLS, grants, storage bucket |
| 002 | `002_telegram_bot_service.sql` | Tables for the `@KeluCallsAlerts_bot` Telegram bot service |
| 003 | `003_insights_system.sql` | Articles/blog ("Insights") system |
| 004 | `004_admin_system_fixes.sql` | Bugfixes: nullable `ads.channel_id`, `sponsored_placements` subtype columns, new `tracking_requests` table, `ad-banners` bucket. Reveals the hidden admin path is `/kx-admin`. |
| 005 | `005_user_accounts.sql` | Public-facing end-user account system: profiles, watchlists, alert rules, notifications |
| 006 | `006_kelu_score.sql` | "KeluScore" intent-engine tables (additive-only, never alters existing tables) |
| 007 | `007_intent_alerts.sql` | Wires KeluScore into the existing alert system (adds an enum value + dispatch bookkeeping column; no new table) |
| 008 | `008_intent_summaries.sql` | Cached LLM-generated narrative summaries per token (additive-only) |

## 3. Enums

| Enum | Values |
|---|---|
| `blockchain` | solana, ethereum, bsc, base, arbitrum, polygon, avalanche, sui, tron, other |
| `channel_status` | pending, active, paused, archived |
| `token_status` | active, inactive, archived |
| `call_status` | open, closed, invalid, hidden |
| `submission_status` | pending, approved, rejected |
| `ad_status` | draft, active, paused, expired |
| `ad_placement` | homepage, channels, live_feed, tokens, channel_detail |
| `admin_role` | super_admin, admin, analyst, moderator |
| `worker_status` | queued, running, succeeded, failed |
| `article_status` | draft, published, scheduled, archived |
| `alert_delivery_channel` | in_app, email, telegram |
| `alert_rule_type` | channel_new_call, channel_big_win, token_trending, watchlist_digest, *(+ `token_intent_spike` added in 007)* |
| `notification_status` | pending, sent, read, failed |

## 4. Schema by layer

### 4.1 Admin & control layer
- **`admin_users`** — explicit allowlist for the hidden `/kx-admin` system. `user_id` → `auth.users(id)`, `role` (`admin_role`), `is_active`. Own-row-only RLS select policy for the admin themselves; every other admin-gated table checks membership in this table via an `exists (...)` subquery in its policy.
- **`admin_audit_logs`** — action/entity/payload log of admin actions, admin-read-only.
- **`worker_runs`** — job observability (`worker_name`, `status`, timing) for all background workers (scraper, price/trending workers, intent engine, etc.), admin-read-only.
- **`tracking_requests`** (added 004) — queue of Telegram handles the scraper should start monitoring; service-role only.

### 4.2 Source layer (raw Telegram ingestion)
- **`channels`** — tracked Telegram channels. Generated column `telegram_handle_normalized` (lowercased, `@` stripped) enforces one row per real channel. Unique on slug, normalized handle, URL, and `telegram_peer_id`. `status`, `is_verified`, `is_paid_channel` flags drive both public visibility and the ranking formula (paid channels are excluded from scoring — see §6). Public read for `active`/`paused`; write requires `admin_users` membership.
- **`telegram_messages`** — immutable raw scraped messages, one row per `(channel_id, telegram_message_id)`. `raw_payload`/`scrape_metadata` are jsonb (GIN-indexed on `raw_payload`). Retained for parser replay/audit. **Internal only** — no public read policy at all.

### 4.3 Intelligence layer (parsed calls)
- **`tokens`** — normalized multi-chain token registry. Generated columns normalize `symbol` (upper) and `contract_address` (lower); unique per `(chain, symbol_normalized)` and per `(chain, contract_address_normalized)` (nulls-not-distinct). Carries `last_price_usd`/`last_market_cap_usd` cache fields, `coingecko_id`, `dexscreener_pair_id`. Public read for `active` tokens only.
- **`calls`** — the canonical "a channel called this token" event, parsed from `telegram_messages`. FKs to `channel_id` (cascade), `token_id` (restrict — can't delete a token with calls), `source_message_id`. Carries `entry_price_usd`, `confidence_score` (0–1), `status` (`call_status`). Unique on `(channel_id, telegram_message_id, token_id)` (nulls-not-distinct) to keep parsing idempotent.
- **`call_metrics`** — 1:1 derived-metrics extension of `calls` (PK = `call_id`), refreshed by background workers: current/peak price, market cap, ROI%, multiple, `is_win`, milestone booleans `hit_2x`…`hit_100x`, and a simulated-portfolio PnL (`simulated_investment_usd` defaults to $10) used for the leaderboard's PnL sort.

### 4.4 Analytics layer (precomputed, read by the frontend)
- **`channel_stats`** — 1:1 precomputed leaderboard row per channel (PK = `channel_id`): totals, win rate, avg/median ROI, milestone hit counts, simulated PnL, and `ranking_score` (the public Smart Score). Rebuilt entirely by the `refresh_channel_stats(target_channel_id uuid default null)` SQL function (see §5) — the frontend never computes this itself, only reads it (`@/lib/dashboard-data.ts` → `getLeaderboard`).
- **`trending_tokens`** — a **materialized view** (not a table) aggregating calls per active token from active/paused channels: `total_calls`, `unique_channels`, `average_roi_pct`, `best_multiple`, `last_called_at`. Refreshed via `refresh_trending_tokens()`. Chosen as a materialized view specifically because it's read-heavy and only ever contains already-public safe aggregates (no raw messages).
- **`refresh_public_analytics()`** — convenience wrapper that calls `refresh_channel_stats(null)` then `refresh_trending_tokens()`; the thing a scheduled worker actually invokes.

### 4.5 Monetization layer
- **`submissions`** — public channel-submission intake queue (`/listing-policy` form). `submitted_by` (added in 005) links to the account that filed it, nullable for anonymous submissions. Public insert only; owner can read their own; only `admin_users` can review/approve.
- **`ads`** — sponsored placements shown by `<AdPopup>` etc. `channel_id` is nullable (patched in 004 — "floating popup ads don't need a channel"). Has `placement` (`ad_placement` enum), scheduling (`starts_at`/`ends_at`), `priority`, `budget_usd`.
- **`sponsored_placements`** — the more general sponsored-slot table used by `SponsoredPlacementCard`/`leaderboard-with-placements.tsx`. `surface` constrained to `homepage|trending|tokens|live_feed`; `placement_type` constrained to `featured_token|project_spotlight|homepage_slot|trending_boost`. 004 added `placement_subtype`, `token_symbol`, `contract_address` and relaxed the target check so a row can be identified by `token_id`, `channel_id`, **or** a raw `token_symbol` (for placements about tokens not yet in the `tokens` table).
- **`ad_impressions`, `ad_clicks`** — event logs, each row tied to exactly one of `ad_id` / `sponsored_placement_id` (enforced by a check constraint), storing `ip_hash` (not raw IP), `session_id`, `referrer`.
- **`moderation_reports`** — user/admin reports against a submission, channel, or token (at least one target required); admin-only.

### 4.6 Insights / articles system (003)
- **`article_categories`**, **`article_tags`** — taxonomy, public read, admin write.
- **`articles`** — full CMS row: SEO fields (`seo_title`, `meta_description`, `keywords[]`, OG image), editorial flags (`is_featured`, `is_trending`, `is_editor_pick`), `related_article_ids uuid[]`, and optional live-data links `linked_token_id`/`linked_channel_id`. Public read only when `status = 'published'` and `published_at <= now()`.
- **`article_tags_junction`** — many-to-many articles↔tags.
- **`article_views`** — analytics log, public insert (anonymous view tracking), admin-only read.
- Seeded with 8 default categories (Market Intelligence, Research Reports, Token Analysis, KOL Analysis, Telegram Intelligence, Learn Crypto, Weekly Reports, Platform Updates).

### 4.7 Telegram bot service (002)
Separate from the scraper — this powers the **outbound alerts bot**, `@KeluCallsAlerts_bot`.
- **`telegram_users`** — one row per Telegram chat that has talked to the bot (`telegram_chat_id` unique).
- **`telegram_subscriptions`** — what a bot user follows: `subscription_type` ∈ `all|channel|token|chain`. Special unique index ensures only one `'all'` subscription per user.
- **`telegram_alert_preferences`** — 1:1 per bot user: achievement/smart-call alert toggles, `min_score`, `chains[]` filter, `verified_channels_only`, `achievement_thresholds int[]` (must be a subset of `{2,5,10,50,100}`).
- **`bot_events`** — the outbound queue. Workers insert rows (`event_type` ∈ `achievement|new_call|trending|coordinated_call`); the bot process sends them and marks `processed = true`. `increment_bot_event_attempts()` is a `security definer` RPC for retry bookkeeping. Partial index on unprocessed rows with `attempts < 5`.
- Entire domain is `service_role`-only — no `anon`/`authenticated` access at all; this is bot-internal state.

### 4.8 End-user accounts (005)
Explicitly designed as a **parallel identity system to `admin_users`** — a person can be both an admin and a regular account holder, no special-casing needed, since both just point at `auth.users`.
- **`profiles`** — 1:1 with `auth.users` (PK = user id). Auto-created by an `on_auth_user_created` trigger → `handle_new_user()` (`security definer`, pinned `search_path`) on signup, so the app never has to handle a missing profile. `username` unique + regex-constrained; `preferences jsonb` is an open bag for low-value settings so new toggles don't need a migration. Public read exposes only rows with a `username` set.
- **`user_channel_watchlist`**, **`user_token_watchlist`** — "follow" tables, identical shape by design, unique on `(user_id, target)`, `is_muted` flag.
- **`user_alert_rules`** — generic per-user alert subscriptions: `rule_type` (extensible enum) + `conditions jsonb` + `delivery_channels[]` (`alert_delivery_channel[]`, must be non-empty). A `case` check constraint requires `channel_id` for `channel_new_call`/`channel_big_win`; other rule types are unconstrained. Comment in the migration explicitly states: *"a new alert kind is a new enum value, not a new table."*
- **`user_notifications`** — the in-app inbox. Workers insert (service role), users read/mark-read their own rows only.
- Every user-owned table here follows **one repeated RLS shape**: `user_id = auth.uid()` for both `using` and `with check` — documented in the migration as the pattern to copy for any new per-user feature.

### 4.9 KeluScore / intent engine (006, 007, 008)
A self-contained, **additive-only** subsystem — none of these migrations alter or drop anything from earlier ones; `channel_stats`/`trending_tokens`/`call_metrics` remain the source of truth and are only *read* by the intent engine, never written.

Data flow: `calls + call_metrics + channel_stats + trending_tokens` → `workers/intent-engine.js` → writes `intent_scores`, `intent_history`, `score_changes`, `project_signals` → `workers/intent-alerts.js` reads `score_changes` → writes into the existing `user_notifications` → `workers/intent-summaries.js` reads `intent_scores` → writes `intent_summaries`.

- **`intent_scores`** — current KeluScore per token (PK = `token_id`), 0–100 with a letter `grade` (A–D). Sub-scores computed from Kelucalls' own data (`conviction`, `momentum`, `breadth`, `performance`, `freshness`) are `not null default 0`; sub-scores depending on **external** ingestion (`marketing_score`, `community_score`, `liquidity_score`) are deliberately **nullable — null means "not enough data," and the migration comment explicitly warns never to default these to 0**, since the UI must render them as unavailable rather than a real zero score. Denormalized call counters (`calls_24h/7d/30d`, `unique_channels`) avoid joins for the Opportunities list. `inputs jsonb` retains the raw metric values a score was derived from, for explainability. **The app never computes a score at request time — it only reads this table**, so the scoring model can change without touching the UI.
- **`intent_history`** — append-only per-cycle snapshots of the same score fields, powering the score timeline chart (`score-history-chart.tsx`).
- **`score_changes`** — logged when a score moves more than the worker's threshold: `previous/current_score`, `delta`, `direction` (up/down), `reason`. `notified_at` (added in 007) is the dispatch-bookkeeping column the alert worker uses to avoid re-sending; a partial index covers only the pending (`notified_at is null`) rows.
- **`project_signals`** — append-only raw external signals in a generic `(source, signal_type, value_numeric | value_text | payload)` shape, so adding a new data provider (Dexscreener, X/Twitter, etc.) is just a new `source` string, never a schema change. **Has no public read policy at all** (RLS enabled, zero permissive policies) since `payload` can contain full third-party API responses.
- **`intent_summaries`** (008) — cached LLM-generated narrative per token (PK = `token_id`), `model` + `prompt_version` recorded so old summaries can be identified/regenerated, `score_at_generation` lets the worker detect the summary is stale *in substance* rather than by age alone. Kept in its own table specifically so a failing/rate-limited LLM call can never block the hot `intent_scores` upsert path.
- All four 006 tables + `intent_summaries` are public-`select`-readable (same visibility class as `trending_tokens`) but writable only by `service_role`.
- 007 also widened the `user_alert_rules_target_chk` constraint from an exhaustive `case` (which silently passed under a NULL-is-satisfied Postgres quirk for unlisted types) to an explicit `else true`, specifically so the new `token_intent_spike` rule type didn't rely on that quirk.

## 5. Functions

| Function | Security | Purpose |
|---|---|---|
| `set_updated_at()` | invoker | Generic `updated_at` trigger, attached to nearly every mutable table |
| `refresh_channel_stats(target_channel_id uuid default null)` | invoker | Recomputes `channel_stats` from `calls`/`call_metrics` for one channel or all; implements the Smart Score formula (paid channels score 0); also deletes stats rows for channels no longer active/paused |
| `refresh_trending_tokens()` | invoker | `refresh materialized view public.trending_tokens` |
| `refresh_public_analytics()` | invoker | Runs both of the above; the entrypoint a scheduled worker calls |
| `handle_new_user()` | **definer**, pinned `search_path=public` | Auto-inserts a `profiles` row on `auth.users` signup (trigger `on_auth_user_created`) |
| `increment_bot_event_attempts(event_id, error_message)` | **definer**, pinned `search_path=public` | Bumps `bot_events.attempts`/`last_error` for retry logic |

## 6. Ranking formula, as implemented in SQL

Inside `refresh_channel_stats()`, `ranking_score` (the public Smart Score) is computed per channel as:

```
CASE
  WHEN channel.is_paid_channel THEN 0
  WHEN total_calls = 0        THEN 0
  ELSE avg(current_roi_pct) * 0.5
     + avg(is_win ? 100 : 0) * 0.3
     + ln(total_calls + 1)  * 0.2
END
```

This matches the README's documented formula (`Score = AvgROI×0.5 + WinRate×0.3 + log(TotalCalls+1)×0.2`) and confirms **paid/sponsored channels are hard-zeroed out of the ranking score at the database level**, not just filtered in the UI — enforcing the README's "sponsored placements excluded from ranking inputs" rule structurally.

## 7. Access-control summary (who can read/write what)

| Role | Can do |
|---|---|
| `anon` (public visitor) | Read: active/paused channels, active tokens, calls, call_metrics, channel_stats, trending_tokens, ads, sponsored_placements, published articles, intent_scores/history/score_changes/summaries, profiles-with-username. Write: insert `submissions`, insert `article_views`, insert `ad_impressions`/`ad_clicks` (implied by tracking use case) |
| `authenticated` (signed-in end user) | Everything `anon` can, plus: full CRUD on their own `profiles`/watchlists/alert rules (via `user_id = auth.uid()`), read/mark-read their own `user_notifications`, read their own `submissions` |
| `admin_users` members (checked in-policy, not a Postgres role) | Full CRUD on channels, tokens (via policy, not shown in excerpt but same pattern), submissions review, ads, sponsored_placements, moderation_reports, articles/categories/tags, read `admin_audit_logs`/`worker_runs`/`telegram_messages` |
| `service_role` | Bypasses RLS entirely. Used by: scraper (channels/telegram_messages/calls writes), all `workers/*.js` (call_metrics, channel_stats, trending_tokens refresh, intent_scores/history/score_changes/project_signals/intent_summaries, bot_events), the Telegram bot (telegram_users/subscriptions/alert_preferences/bot_events), and admin server actions (via `createSupabaseAdmin()` in `@/lib/admin.ts`) |

Nothing is writable by `anon`/`authenticated` except the handful of explicit public-intake tables (`submissions`, `article_views`, ad tracking, plus a user's own rows) — every other write path goes through `service_role` from a worker/scraper/bot process or through an `admin_users`-gated policy.

## 8. How this maps to the frontend (cross-reference)

- `@/lib/dashboard-data.ts` reads `channel_stats` (leaderboard), `trending_tokens` (materialized view), `calls`+`call_metrics` (live feed), `ads`/`sponsored_placements` (monetization surfaces), `submissions` (admin pending queue).
- `@/lib/metrics.ts`'s `computeRankingScore()` is the **frontend-side mirror** of the SQL Smart Score formula in `refresh_channel_stats()` — kept in sync manually, not generated from one source.
- `@/lib/intent/queries.ts` + `intent-panel.tsx` read `intent_scores`/`intent_history`/`intent_summaries` directly — never compute a score client-side.
- `@/lib/session.ts` (`getCurrentUser`/`getCurrentProfile`) reads `profiles` for end-user auth; `@/lib/auth.ts` + `admin_users` power the separate `/kx-admin` auth system.
- `notification-bell.tsx`'s deliberate post-hydration fetch pattern exists because `user_notifications` requires a session read that would otherwise force every page (including anonymous marketing pages using the same navbar) to render dynamically.