# Kelucalls — Backend Architecture



## 1. Overview — four independent runtime processes

Per the README and `railway.json`, Kelucalls' backend is **not one server** — it's four separately deployable/schedulable Node processes that all share one Supabase Postgres database as the integration point:

| Process | Entry point | Role |
|---|---|---|
| **Web app** | Next.js server (`npm run start`) | Server components, server actions, and `/api/*` route handlers — the only process with a public HTTP surface |
| **Scraper** | `scraper/index.js` (GramJS/`telegram`) | Long-running Telegram client that watches tracked channels and writes `tokens`/`calls` in real time |
| **Bot** | `apps/bot` workspace (Telegraf) | `@KeluCallsAlerts_bot` — reads `bot_events`, sends Telegram messages, marks them processed |
| **Workers** | `workers/*.js` (plain ESM, cron-style) | Batch jobs: price updates, trending aggregation, avatar/logo backfill, and the whole KeluScore intent pipeline |

Deployed on **Railway** (Nixpacks, Node 22, single replica, restart-on-failure, health check against `GET /api/health` on port 3000). Workers/scraper/bot are documented as separate runtime processes that "may be deployed/scheduled independently" of the web app.

## 2. Web app backend layer (`src/lib`, `src/app/api`)

### 2.1 Supabase client layer — three clients, three purposes
Kelucalls deliberately keeps **three separate Supabase client factories**, each documented as unsafe to substitute for another:

| Client | File | Key | Use |
|---|---|---|---|
| `getSupabaseClient()` | `@/lib/supabase/client.ts` | anon | Browser-safe, respects RLS, singleton |
| `getSupabaseServer()` | `@/lib/supabase/server.ts` | service role | **Bypasses RLS**, singleton, server-only — general server reads |
| `createSupabaseAdmin()` | `@/lib/supabase/admin.ts` | service role | Fresh instance **every call** (not a singleton) specifically to avoid cross-request state leaks during admin *writes* |
| `createSupabaseServerClient()` | `@/lib/auth/supabase-server.ts` | anon + cookies | `@supabase/ssr`-based, cookie-aware — represents the actual logged-in visitor for server components/actions/route handlers. Explicitly *not* the same as the service-role server client, and *not* hand-rolled cookies like the admin flow, because `@supabase/ssr` handles refresh correctly. |
| `createBrowserClient` wrapper | `@/lib/auth/supabase-browser.ts` (`"use client"`) | anon + cookies | Browser client that *writes session to cookies*, unlike the plain anon client — required so server components/middleware can see the session at all |

Barrel export `@/lib/supabase/index.ts` re-exports client/server/admin/insert/queries/health for convenient importing.

### 2.2 Two parallel, deliberately separate auth systems
This is the single most important structural fact about the backend: **end-user auth and admin auth do not share code**, on purpose.

**End-user auth** (`@/lib/auth/*`, `@/lib/session.ts`):
- Real Supabase Auth (`auth.users` + `@supabase/ssr` cookie session).
- `getCurrentUser()` / `getCurrentProfile()` in `session.ts`, both wrapped in React `cache()`. **Always calls `supabase.auth.getUser()`, never `getSession()`** — `getSession()` trusts the cookie's JWT without verifying its signature against the auth server, so a forged cookie would pass; `getUser()` validates it.
- `requireUser()` redirects to `LOGIN_PATH` if unauthenticated.
- A `profiles` row is auto-created server-side on signup (DB trigger — see database-architecture doc §4.8), so this layer never has to handle "user exists but no profile."

**Admin auth** (`@/lib/admin/*`):
- Custom, *not* Supabase Auth sessions — a hand-rolled cookie session (`ADMIN_ACCESS_COOKIE`, `ADMIN_REFRESH_COOKIE`, `ADMIN_EXPIRES_COOKIE`) layered on top of a Supabase user that must also have a row in `admin_users`.
- `AdminAuthError` with a typed `code` (`not_configured | invalid_credentials | not_admin | unknown`) — the migration/module comments explicitly call out that the *old* login collapsed every failure into one generic "invalid credentials" message, making a misconfigured deploy indistinguishable from a typo; this taxonomy exists specifically to fix that undebuggability.
- Cookie building is centralized in **one** module, `@/lib/admin/session-cookies.ts` (`buildAdminSessionCookies` / `buildAdminSessionClearCookies`), because the session is written from two places that can't share a code path — `admin/auth.ts` (a server action, has `next/headers`) and `middleware.ts` (edge, refreshing an expired token, writes onto a `NextResponse`) — and cookie-attribute drift between two hand-rolled implementations produces hard-to-see auth bugs.
- Token refresh logic lives in its own module, `@/lib/admin/session-refresh.ts`, specifically because it has **zero Next.js imports**, so it's safe to call from edge middleware (which can't import `next/headers`).
- Hidden path: `ADMIN_BASE_PATH` / `/kx-admin` (confirmed by migration 004's comments) with sign-in at `ADMIN_SIGN_IN_PATH`.

`errors.ts` (end-user side) mirrors the same "don't collapse errors" philosophy: an `AuthErrorCode` union (`invalid_credentials`, `email_not_confirmed`, `email_taken`, `weak_password`, `rate_limited`, `not_configured`, `expired_link`, `same_password`, `validation`, `unknown`) plus `mapAuthError()` which inspects Supabase's `code` field first, then falls back to sniffing the message text, since Supabase has been migrating from free-text errors to stable codes. `not_configured` is explicitly never shown as a credential error — a broken server must never look like a wrong password to the user.

### 2.3 Middleware (`middleware.ts`)
Single file, edge runtime, doing three unrelated jobs at once:
1. **Admin session refresh** — reads the three admin cookies, calls `refreshAdminSession()` (from the Next.js-free module above), rewrites cookies via `buildAdminSessionCookies`.
2. **End-user auth routing** — `AUTH_ROUTES`, `LOGIN_PATH`, `NEXT_PARAM`, `safeNextPath()` (prevents open-redirect via the post-login `?next=` param) using a `createServerClient` from `@supabase/ssr`.
3. **Site-wide Content-Security-Policy**, built as an explicit array of directives rather than relying on defaults — a comment notes an omitted directive previously silently fell back to `default-src 'self'` and broke the embedded DexScreener chart on token pages, hence every directive (`script-src`, `style-src`, `img-src`, `font-src`, `connect-src`, presumably `frame-src` for the chart) is spelled out.

### 2.4 Rate limiting (`@/lib/rate-limit.ts`)
A minimal fixed-window limiter (`checkRateLimit(key, limit, windowMs)` / `clearRateLimit(key)`) backed by an in-memory `Map`. **Explicitly documented as not a hard guarantee**: the store is per-process memory, so on serverless each instance has its own counter and a cold start resets it — it "raises the cost of a brute force attempt without being a hard guarantee." A shared store (Postgres table or Redis) is flagged as tracked follow-up work, not yet implemented. `clearRateLimit()` is called after a successful admin sign-in so a few mistyped-then-corrected attempts don't burn budget that later locks the legitimate user out.

### 2.5 Server actions (`"use server"` modules)
- **`@/lib/account/actions.ts`** — the main end-user account action set: `setChannelFollowAction`, `setWatchlistMutedAction`, `createAlertRuleAction`, `setAlertRuleActiveAction`, `deleteAlertRuleAction`, `updateProfileAction`, `markAllNotificationsReadAction`. All return a shared `AccountActionResult` shape (success/error + typed code) rather than throwing, matching the same "no generic failure state" philosophy as the auth error taxonomy.
- **`@/lib/account/notification-actions.ts`** — kept as a *separate* module from `actions.ts` specifically because that file "already works and covers watchlist, alert rules and profile" — a new concern (notification prefs) gets its own module rather than touching a stable one. Contains `setNotificationsEnabledAction(enabled)`. Since the whole file carries `"use server"`, every export must be an async function — this is why the shared constant `NOTIFICATIONS_ENABLED_KEY` had to be relocated to `@/lib/account/alert-options.ts` instead of living alongside the action.
- **`@/lib/admin/*` actions** (referenced from `sidebar.tsx`/admin pages, not shown in this excerpt) — channel/ads/moderation mutations gated by the `admin_users` check, generally via `createSupabaseAdmin()`.

### 2.6 Supabase data-access helpers (`@/lib/supabase/*`)
- **`insert.ts`** — the scraper/ingestion-facing write layer: `insertChannel`, `insertToken`, `insertCall`, `updateChannelStats`, all returning a typed `InsertResult<T>`. This is the TypeScript counterpart to the scraper's own inline Supabase calls (the scraper is plain JS and doesn't import this — see §4).
- **`queries.ts`** — paginated/sortable public reads: `getTrendingTokens`, `getTopChannels`, `getRecentCalls`, `getTokenPerformance`, `getChannelStats`, sharing generic `PaginationParams`/`SortParams`/`PaginatedResult<T>` types.
- **`health.ts`** — `runHealthChecks()`, meant to run at server startup (and backs `GET /api/health`, the Railway healthcheck target). Checks: required env vars present and non-placeholder (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), optional env vars (`SIMULATED_INVESTMENT_PER_CALL`, `TELEGRAM_API_ID/HASH`), then a live DB ping plus a per-table existence probe against a hardcoded expected-table list. Returns `{ overall, checks[], timestamp }` with `ok|warning|error` severities and logs a colored summary to console. *(Note: its `EXPECTED_TABLES` list still references `trending_snapshots`, which the 001 baseline migration actually drops/replaces with the `trending_tokens` materialized view — a stale reference worth knowing about if debugging health-check false positives.)*

### 2.7 API routes (`src/app/api/**/route.ts`)
Only one `route.ts` survived intact in this file snapshot (`/auth/sign-out`), but other route files are referenced by name elsewhere in the codebase:
- **`/auth/sign-out`** — `POST` calls `supabase.auth.signOut()` via the cookie-aware server client, then 303-redirects to `/`. Deliberately **POST-only**: a `GET` sign-out endpoint could be triggered by any stray `<img>` tag or link-prefetch on the page, logging people out at random; a stray `GET` here just bounces to `/`.
- **`/api/health`** — the Railway healthcheck target, backed by `runHealthChecks()`.
- **`/api/tokens/live/route.ts`** — referenced in `http.ts`'s comment as the pattern other KeluScore API endpoints mirror.
- `@/lib/http.ts` provides a single shared `jsonResponse(body, status)` helper (JSON content-type, `cache-control: no-store, max-age=0`) so every KeluScore-era API route returns identical headers instead of copy-pasting them.

## 3. Workers (`workers/*.js`) — the KeluScore / intent pipeline

All workers are plain ESM JavaScript (not TypeScript, unlike the web app) and share a `workers/worker-utils.js` module providing: `log`/`LOG_LEVELS`, `chunk`, `mapWithConcurrency`, `withRetry`, `isTransientHttpError`, `toFiniteNumber`, `startWorkerRun`/`finishWorkerRun` (writing to the `worker_runs` observability table), `loadWorkerEnv`, `getEnv`/`getNumberEnv`, `getSupabaseConfig`. Every worker supports `WORKER_RUN_ONCE=true` for cron-style single-shot execution vs. running as a daemon loop.

The four newest workers form one pipeline (matches the DB doc's §4.9 data flow):

```
calls + call_metrics + channel_stats + tokens   (existing tables, read-only)
        │
        ▼
workers/intent-engine.js  ──uses──▶  workers/intent-scoring.js (pure math)
        │                            workers/intent-signals.js (external data)
        ▼
intent_scores / intent_history / score_changes
        │
        ├──▶ workers/intent-alerts.js  ──▶ user_notifications
        │
        └──▶ workers/intent-summaries.js  ──▶ intent_summaries
```

### 3.1 `intent-engine.js` (529 lines) — the orchestrator
Runs a full **cycle**:
1. **Read** — pulls `calls` from the last `LOOKBACK_DAYS` via `selectAllPages()` (bulk, paginated — explicitly avoiding O(tokens) round trips), then aggregates per-token call counts (`aggregateCalls`), pulls `channel_stats`, `call_metrics`, `tokens`, and any `existingScores` (previous `intent_scores` rows) via `selectByIds()`.
2. **External signals** — ranks tokens by 24h/7d call volume and takes only the top `SIGNAL_MAX_TOKENS` candidates for an (optionally) rate-limited Dexscreener call, via `collectExternalSignals()`.
3. **Score** — for every token, calls `computeKeluScore()` (from `intent-scoring.js`) with call counts, average caller win rate (`averageCallerWinRate`), token performance (`tokenPerformance`), hours-since-last-call, and whatever external signals were collected.
4. **Write** — upserts `intent_scores` (`onConflict: token_id`), and conditionally appends to `intent_history` (only if the score moved by at least `HISTORY_MIN_DELTA`, keeping the history table from growing on every no-op cycle) and `score_changes` (only if the delta exceeds `SCORE_CHANGE_THRESHOLD`). All writes are chunked (`WRITE_CHUNK_SIZE`) and per-chunk errors are logged and skipped rather than aborting the whole cycle.
5. Wraps the whole cycle in `startWorkerRun`/`finishWorkerRun` so `worker_runs` always has a `succeeded`/`failed` record with details, even on partial failure.

### 3.2 `intent-scoring.js` (385 lines) — the pure scoring model
Explicitly **pure functions only** — "No I/O, no Supabase, no network, no clock reads," so the model is unit-testable without a database. Deliberately lives in plain JS in the worker rather than being ported to TypeScript in `src/lib`, specifically so there's only ever **one** place a score is calculated — the app only ever reads finished rows.

- `SCORE_VERSION = 1` and `WEIGHTS`:

  | Sub-score | Weight |
  |---|---|
  | conviction | 0.28 |
  | momentum | 0.24 |
  | breadth | 0.16 |
  | performance | 0.16 |
  | freshness | 0.08 |
  | liquidity | 0.04 |
  | marketing | 0.02 |
  | community | 0.02 |

- `composite(subScores)` **renormalizes over whichever sub-scores are actually present** — a missing input (e.g. no liquidity data) doesn't drag the score toward zero, it's excluded from both numerator and denominator. This is the code-level enforcement of the DB comment ("null means not enough data, never default to 0").
- `saturate(value, halfPoint)` — a saturating curve (`value / (value + halfPoint)`) used throughout instead of linear scaling, specifically so one outlier (e.g. 400 calls on a single token) can't flatten the whole leaderboard the way linear scaling would.
- `convictionScore({ averageWinRatePct, uniqueChannels })` — quality (win rate) scaled by a confidence factor that grows with the number of distinct callers via `saturate(uniqueChannels, 2)`; a single 70%-win-rate channel outweighs five unknown channels, but breadth still matters.
- `momentumScore({ calls24h, calls7d, calls30d })` — compares last-24h activity against the **token's own trailing baseline** (not other tokens): `baseline = max(dailyFrom30d, dailyFrom7d, 0.05)`, then blends a "burst" ratio (70% weight) with absolute volume (30% weight). A token that normally gets one call/week suddenly getting four in a day scores higher than a constantly-called token having an average day.
- `gradeFor(score)` — **A** ≥75, **B** ≥55, **C** ≥35, else **D**.
- `buildSignals()` — generates the human-readable bullet points shown in `intent-panel.tsx` (tone: positive/neutral/warning), e.g. "3 calls in the last 24h."

### 3.3 `intent-signals.js` (264 lines) — external data collection
Deliberately **reuses** the same Dexscreener token endpoint that `workers/price-update.js` already calls, but extracts the fields that worker discards (volume, liquidity, `info.socials`) instead of introducing a new provider or touching `price-update.js`. Every collector follows a strict contract: resolve to a plain object or `null` (never throw — a provider outage must never fail the scoring cycle), and be independently skippable via config. Picks the trading pair with the deepest liquidity per contract, "the one a real buyer would route through."

### 3.4 `intent-alerts.js` (331 lines) — dispatch
Deliberately a **separate worker** from `intent-engine.js` rather than a branch inside it — scoring and notifying are different jobs with different failure modes; a bug here must never be able to block scores from being written, and this can run on its own schedule. Reads pending (`notified_at is null`) `score_changes`, checks `loadEnabledUserIds()` (from `alert-prefs.js`) against matching `user_alert_rules`, and inserts into `user_notifications`. **Delivery is at-least-once by design**: notifications are inserted *before* the source `score_changes` row is marked `notified_at` — a crash between those two steps re-sends rather than silently drops. "Duplicate notifications are annoying; missing alerts are a broken feature."

### 3.5 `intent-summaries.js` (370 lines) — LLM narrative generation
Calls an **OpenAI-compatible chat-completions endpoint over plain HTTPS** using Node 22's built-in `fetch` — deliberately no SDK dependency, both to avoid `package-lock.json` drift breaking `npm ci` on Vercel and because "any OpenAI-compatible provider works by changing one env var." Summaries are cached in `intent_summaries` and only regenerated when the score has moved meaningfully or the cached text has gone stale, capped per run — cost control is the explicit design goal. Kept as its own table/worker (see DB doc §4.9) so a dead API key can never block the hot scoring path.

### 3.6 `alert-prefs.js` (78 lines) — shared preference gate
`notificationsEnabled(preferences)` reads a single master switch, `NOTIFICATIONS_ENABLED_KEY = "notifications_enabled"`, off the `profiles.preferences` jsonb bag (not its own column, so adding future prefs never needs a migration). **Absent means on** — accounts created before this switch shipped have empty `preferences` and must keep receiving alerts they explicitly asked for via `user_alert_rules`. The comment explicitly flags that this constant name must stay in sync with `NOTIFICATIONS_ENABLED_KEY` in `@/lib/account/alert-options.ts` — two independent constants, one meaning, and renaming one without the other silently breaks the master switch.

### 3.7 Other workers (named in README, not read in full here)
`price-update.js` (live token prices), `trending-aggregate.js` (recomputes trending aggregates — likely calls `refresh_public_analytics()`), `token-logo-backfill.js`, `trending-alerts.js` (a second, older alert dispatcher for trending tokens, separate from the intent-alerts pipeline).

### 3.8 `channel-avatar-sync.js` (130 lines) — standalone script
Not part of the intent pipeline. Fetches each channel's Telegram profile photo via the **Telegram Bot API** (not GramJS — this uses the bot token, `TELEGRAM_BOT_TOKEN`) and writes the public photo URL into `channels.avatar_url`. Meant to run manually or as a weekly cron (`npm run worker:avatars`).

## 4. Scraper (`scraper/index.js`, 803 lines) — real-time ingestion

The scraper is a **long-running GramJS (`telegram`) client**, logically distinct from the bot (which uses Telegraf and only sends outbound messages). It authenticates once via `npm run scraper:login` (`scraper/login.js`, prompts interactively via the `input` package and produces a `StringSession`), then runs continuously.

Startup: `loadScraperEnv()` / `validateScraperEnv()` (from `src/lib/env/scraper-env.js`) load and sanity-check `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`/session plus Supabase env vars before connecting.

Core pipeline per incoming message (`handleMessage(channelId, message)`):
1. Skip if the message text is empty or under 10 chars.
2. `parseCallMessage(text)` — detects a "call" using contract-address regexes, `$SYMBOL` mentions, `CA:` labels, and GMGN/DEX link parsing (per-chain detection in `detectChain()`/`chainFromUrlSegment()` covering Solana, Ethereum, BSC, Base, Arbitrum, Polygon, Avalanche, Sui, Tron). Returns `null` if nothing looks like a call.
3. `fetchDexScreenerData(contractAddress)` — one request gets both entry price and token logo.
4. `upsertToken({ symbol, contractAddress, chain, logoUrl })` — idempotent by `(chain, contract_address_normalized)`/`(chain, symbol_normalized)` per the DB unique constraints.
5. `insertCall({ channelId, tokenId, messageText, calledAt, telegramMessageId, entryPriceUsd })` — idempotent by the DB's `(channel_id, telegram_message_id, token_id)` unique constraint.

Other responsibilities in the same file:
- **`processTrackingQueue(client)`** — periodically checks `tracking_requests` (added in migration 004) for new channels to start monitoring, joins them, and adds them to `channels`.
- **`loadTrackedChannels()` / `touchChannel()`** — reads the active channel list and updates `last_scraped_at`.
- **`backfillChannel(client, channel, limit = 50)`** — on startup, pulls the last N historical messages per channel so a newly tracked channel isn't empty until its next organic post.
- **Live handler** — `client.addEventHandler(..., new NewMessage({}))` at the bottom of `main()` is the actual real-time listener: every new message across all joined channels is routed through `handleMessage`.

Standalone one-off scripts alongside it (`test-insert.js`, `test-supabase.js`, `test-read.js`) are manual connectivity checks, not part of the running pipeline — they load `.env` directly and exercise a single `insert`/`select` against Supabase or a Telegram session.

## 5. Bot service (Telegraf, `apps/bot`)

Referenced by the DB layer (migration 002: `telegram_users`, `telegram_subscriptions`, `telegram_alert_preferences`, `bot_events`) but its source wasn't included in this file set beyond the SQL. What's known structurally:
- Runs as `@KeluCallsAlerts_bot`, entirely `service_role`-gated at the DB level (no `anon`/`authenticated` access to any of its tables).
- Consumes the `bot_events` queue written by other workers (`event_type` ∈ achievement/new_call/trending/coordinated_call), sends the Telegram message, and marks `processed = true` — or calls the `increment_bot_event_attempts()` RPC on failure (capped at `attempts < 5` per the DB's partial index).
- Users manage their subscriptions and thresholds via `telegram_subscriptions`/`telegram_alert_preferences`, which the bot itself reads/writes when a user interacts with it in Telegram.

## 6. Cross-cutting backend conventions worth remembering

- **Additive-only migrations are a stated policy**, not just a habit — 006/007/008 explicitly document "no existing table altered" as a design constraint, and 007 calls out a real Postgres gotcha it had to work around (`ALTER TYPE ... ADD VALUE` can't be used in the same transaction it's added in).
- **Two of everything, kept deliberately separate, appears repeatedly**: two auth systems (admin vs. end-user), two Supabase server clients (service-role singleton vs. cookie-aware per-request), two alert pipelines (older `trending-alerts.js` vs. newer `intent-alerts.js`), two error-taxonomy modules (admin `AdminAuthError` vs. end-user `AuthErrorCode`) — each pair has an explicit code comment explaining *why* they must not be merged.
- **Errors are typed and coded everywhere**, never a bare generic message — this is the single most repeated backend design principle across auth, admin auth, and account actions, always justified the same way: a broken/misconfigured server must never be indistinguishable from user error.
- **Workers never let a partial/external failure block the critical write path**: `intent-summaries.js` is split from `intent_scores` so a dead LLM key can't block scoring; `intent-signals.js` collectors never throw so a Dexscreener outage can't block scoring; `intent-alerts.js` is a separate worker so a notification bug can't block scoring.
- **At-least-once delivery, not exactly-once**, is the explicit choice for both `bot_events` (retry via `attempts`) and `score_changes`→`user_notifications` dispatch (insert-then-mark ordering) — duplicates are treated as strictly preferable to silent drops.
- **The scoring/ranking math is computed in exactly one runtime** (the worker, plain JS) and only *mirrored* (not shared) in the frontend's `computeRankingScore()` in `@/lib/metrics.ts` for the simpler channel Smart Score — see the database-architecture doc §6 for the SQL-level version of that formula.