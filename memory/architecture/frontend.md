# Kelucalls — Frontend Architecture


## 1. Stack

- **Framework:** Next.js 16, App Router, React 19, TypeScript
- **Styling:** Tailwind CSS 4 (`@import "tailwindcss"` in `globals.css`), CSS variables for theme tokens (dark, near-black background `#040814`, cyan/teal accent gradients)
- **UI primitives:** shadcn/ui, `"new-york"` style, `baseColor: neutral`, icon library `lucide-react`
- **Charts:** `recharts`
- **Auth/data:** Supabase (`@supabase/ssr`, `@supabase/supabase-js`) — both a cookie-based admin auth system and a separate end-user auth system live in this same app
- **Path aliases** (from `components.json`):
  - `@/components` → `src/components`
  - `@/components/ui` → shadcn primitives
  - `@/lib` → `src/lib`
  - `@/hooks` → `src/hooks`

## 2. Site map / route groups

From the README and `navbar.tsx` / `sidebar.tsx` nav arrays, the app router has (at least) these route groups:

**Public marketing/dashboard surface** (`navLinks` in `navbar.tsx`):
- `/` — Home dashboard (market snapshot, leaderboard, trending, live calls)
- `/trending` — Trending tokens
- `/opportunities` — Opportunities
- `/top-callers` — Top callers
- `/channels`, `/channels/:slug` — Channel leaderboard + channel profile
- `/tokens`, `/tokens?symbol=...` — Token list / detail
- `/live` — Live call feed
- `/insights` — Insights/articles
- `/track` — Track
- `/help`, `/faq`, `/ranking-methodology`, `/community-guidelines`, `/listing-policy`, `/advertiser-policy`, `/contact`
- `/terms`, `/privacy`, `/cookies`, `/disclaimer`, `/dmca` — legal pages (use `legal-layout.tsx`)

**Account area** (`ACCOUNT_BASE_PATH`, nav from `account-nav.tsx`):
- Overview, `/notifications`, `/watchlist`, `/alerts`, `/submissions`, `/settings`

**Admin area** (`ADMIN_BASE_PATH`, nav from `sidebar.tsx` → `AdminSidebar`):
- Overview, `/channels`, `/insights`, `/ads`, `/placements`, `/moderation`, `/analytics`
- Styled as an internal "Control Studio" surface, visually distinct (dark glass panel) from the public site
- Has its own cookie-based session system, separate from end-user auth (see §5)

## 3. Layout composition

`layout.tsx` (root layout) is a server component that:
- Sets global `metadata`/`viewport` (OG tags, icons, `siteConfig`-driven title template)
- Injects `JsonLd` (Organization + Website schema from `@/lib/schema`)
- Wraps every page in `<Navbar />` + `{children}` + `<Footer />` + `<AdPopup />`
- Fetches `getActiveAds()` server-side for the popup
- Imports `./globals.css`

`legal-layout.tsx` is a nested layout for the legal/policy pages (terms, privacy, etc.) giving them a shared reading-page chrome (likely with `<TableOfContents />`).

Admin and account areas each have their own nested layout + sidebar/nav pattern rather than reusing the public navbar.

## 4. Key component inventory (by domain)

### Navigation / chrome
- `navbar.tsx` — client component. Sticky nav with live search (debounced, queries channels + tokens), mobile menu, `NotificationBell`. Exports `SearchBox` (reused on the homepage hero).
- `footer.tsx` — server component. Social links (X/Telegram/Bot) from `siteConfig.social`, product links, resource links.
- `sidebar.tsx` → `AdminSidebar` — client component, admin-only nav, active-route highlighting via `usePathname`.
- `account-nav.tsx` → `AccountNav` — client component, tab-style nav for the account area.
- `page-header.tsx`, `breadcrumb.tsx`, `section-heading.tsx`, `table-of-contents.tsx` — generic page-chrome primitives.

### Dashboard / market data
- `data-table.tsx` — the core generic table system. Exports `DataTable`, `DataTableHeader`, `DataTableRow`, `SortableColumn`, plus data-shaped cell components: `MetricValue`, `PerformanceValue`, `ChannelIdentity`, `TokenIdentity`, `StatusBadge`, `VerificationBadge`. This is the shared building block for the leaderboard, trending, and live-calls tables.
- `leaderboard-with-placements.tsx` — leaderboard table that interleaves organic rankings with sponsored placements (kept visually distinct per the ranking-methodology rules in the README).
- `token-market.tsx` — large client component (~24K) for the live token market view: search, sort, live snapshot refresh via `@/lib/token-market` (`findSnapshot`, `snapshotKey`, `symbolKey`).
- `trending-controls.tsx`, `live-ticker.tsx`, `live-market-cells.tsx`, `live-token-price.tsx` — trending/live-feed widgets, mostly client components for polling/streaming price + call data.
- `token-chart.tsx`, `dex-chart.tsx`, `callers-chart.tsx`, `score-history-chart.tsx` — `recharts`-based visualizations for token price, DEX data, caller performance, and intent score history.
- `channel-card.tsx`, `channel-avatar.tsx`, `featured-channel.tsx`, `chain-icon.tsx`, `token-avatar.tsx` — identity/display atoms reused across tables and cards.
- `opportunity-card.tsx`, `sponsored-placement-card.tsx` — card layouts for `/opportunities` and paid placements.
- `score-badge.tsx`, `score-bar.tsx` — Smart Score display atoms.

### Intent system (alerting/scoring feature)
- `intent-panel.tsx` — composes `IntentSummary`, `ScoreBadge`, `ScoreBar`, `ScoreHistoryChart` (all under `@/components/intent/...`), backed by `@/lib/intent/queries` and `@/lib/intent/types`. This is the UI for the "intent engine" (see backend workers `intent-engine.js`, `intent-scoring.js`, `intent-signals.js`, `intent-alerts.js`, `intent-summaries.js`).
- `intent-summary.tsx` — the summary sub-component.

### Auth
- `auth-shell.tsx` — deliberately a **server component** wrapper (no client JS) shared by every auth screen (login/signup/reset/forgot), so only the form inside ships as client code.
- `login-form.tsx`, `signup-form.tsx`, `forgot-password-form.tsx`, `reset-password-form.tsx` — client forms, each rendered inside `AuthShell`.
- `form-primitives.tsx` — shared input/label/error primitives for all auth + other forms.
- Two parallel auth systems: **end-user auth** (`@/lib/auth/*`, `ACCOUNT_BASE_PATH`, `LOGIN_PATH`) and **admin auth** (`@/lib/admin/*`, cookie-based, `ADMIN_ACCESS_COOKIE`/`ADMIN_REFRESH_COOKIE`/`ADMIN_EXPIRES_COOKIE`, refreshed via `refreshAdminSession` in middleware).

### Account-area features
- `notification-bell.tsx` — client component; **deliberately fetches its own unread count client-side after hydration** rather than reading session server-side, so that public/static pages using the navbar stay cacheable and don't pay a per-request session-query cost. Only signed-in users trigger the fetch.
- `notification-item.tsx`, `notifications-master-switch.tsx`, `mark-all-read-button.tsx` — notification list UI.
- `alert-rule-controls.tsx`, `create-alert-form.tsx` — user-configurable alert rules (feeding the intent-alerts worker).
- `mute-channel-toggle.tsx`, `follow-channel-button.tsx`, `vote-button.tsx` — per-channel user actions.
- `profile-form.tsx` — account settings form.
- `confirm-delete-button.tsx` — generic destructive-action confirm pattern.

### Submission / forms
- `submission-form.tsx` — channel submission for listing (feeds admin moderation queue).
- `contact-form.tsx` — `/contact` page form.
- `image-url-field.tsx`, `ad-banner-uploader.tsx`, `date-range-picker.tsx` — form field building blocks, mainly used in admin (ads/placements management).

### Content / marketing
- `article-banner.tsx`, `article-share.tsx` — insights/blog article chrome.
- `search-bar.tsx` — standalone search input (distinct from navbar's inline `SearchBox`).
- `json-ld.tsx` — structured-data injector used in root layout.
- `ad-popup.tsx` — site-wide promotional popup, fed by `getActiveAds()`.
- `stat-card.tsx`, `status-pill.tsx`, `callout.tsx`, `badge.tsx`, `card.tsx`, `button.tsx`, `accordion.tsx` — generic/shadcn-derived UI atoms.

## 5. Data / lib layer powering the frontend

- **`@/lib/dashboard-data.ts`** — main server-side data-fetching module for the public dashboard: `getDashboardSnapshot`, `getLeaderboard`, `getTrendingTokens`, `getLiveCalls`, `getSponsoredPlacements`, `getSponsoredTokenPlacements`, `getActiveAds`, `getChannelDetail`, `getPendingSubmissions`. Pages call these directly (e.g. `page.tsx` home page uses `getDashboardSnapshot` + `getSponsoredTokenPlacements`, sets `export const dynamic = "force-dynamic"` / `revalidate = 0` since it's live market data).
- **`@/lib/queries.ts`** (multiple modules under this name across the tree) — lower-level, paginated/sortable query helpers: `getTrendingTokens`, `getTopChannels`, `getRecentCalls`, `getTokenPerformance`, `getChannelStats`, with shared `PaginationParams` / `SortParams` / `PaginatedResult<T>` types.
- **`@/lib/metrics.ts`** — pure formatting/calc utilities used throughout the UI: `computeRoiPercent`, `computeMultiple`, `computeMilestones`, `computeSimulatedPnl`, `computeRankingScore` (implements the Smart Score formula from the README), plus `formatPercent`, `formatMultiple`, `formatPrice`, `formatCurrency`, `formatCompactCurrency`, `formatNumber`.
- **`@/lib/session.ts`** — end-user session: `getCurrentUser`, `getCurrentProfile` (both `React.cache`-wrapped), `requireUser`, `displayNameFor`.
- **`@/lib/auth.ts`** (admin) — `AdminIdentity`/`AdminRole` (`super_admin | admin | analyst | moderator`) and admin auth helpers, backed by Supabase service-role client + custom cookie session (not Supabase's own session cookies).
- **`@/lib/admin.ts`** — `createSupabaseAdmin()`, a service-role Supabase client factory for privileged server-side queries.
- **`@/types/kelucalls.ts` / `types.ts`** — hand-maintained types mirroring the Supabase schema (`ChannelStatus`, `CallStatus`, `SubmissionStatus`, `AdStatus`, `ArticleStatus`, `RankingMode`, etc.); comment notes they should be regenerated with `npx supabase gen types typescript` when the schema changes.
- **`@/lib/intent/queries.ts`, `@/lib/intent/types.ts`** — data + types for the intent/scoring panel.
- **`@/lib/token-market.ts`** — live snapshot helpers for the token market view.
- **`@/config/site.ts`** — `siteConfig`: name, org/schema info, SEO description, URL, contact emails, social links. Central source for footer, navbar, layout metadata, and JSON-LD.
- **`@/lib/schema.ts`** — `graph`, `organizationSchema`, `websiteSchema` builders for JSON-LD.

## 6. Middleware & security

`middleware.ts` handles, in one file:
- **Admin session refresh**: reads `ADMIN_ACCESS_COOKIE` / `ADMIN_REFRESH_COOKIE` / `ADMIN_EXPIRES_COOKIE`, calls `refreshAdminSession`, rewrites cookies via `buildAdminSessionCookies`.
- **End-user auth routing**: `AUTH_ROUTES`, `LOGIN_PATH`, `NEXT_PARAM`, `safeNextPath` for post-login redirects.
- **Supabase SSR client** (`createServerClient` from `@supabase/ssr`) for reading the user's Supabase session in middleware.
- **Site-wide Content-Security-Policy**, defined as an explicit directive array so nothing silently falls back to `default-src 'self'` — a comment notes this previously broke the token-price chart until `connect-src`/`frame-src` were opened up for the embedded DexScreener chart on token pages.

## 7. Notable frontend conventions/patterns worth remembering

- **Server-by-default, client-only-when-needed**: e.g. `AuthShell` is kept server-side specifically so only the inner `<form>` ships client JS; `legal-layout`/`footer` are server components.
- **Session-free public pages**: `NotificationBell` intentionally fetches client-side post-hydration instead of reading session at render time, to keep marketing/dashboard pages statically cacheable and avoid a DB query per page view for anonymous visitors.
- **Two separate auth/session systems** in one app: end-user (`@/lib/auth/*`, `@/lib/session.ts`) vs. admin (`@/lib/admin/*`, custom cookie session, service-role Supabase client) — don't conflate them when reasoning about a bug.
- **Sponsored content is structurally separated, not just styled differently**: `SponsoredPlacementCard` / `leaderboard-with-placements.tsx` and `getSponsoredPlacements`/`getSponsoredTokenPlacements` are distinct code paths from the organic ranking data, matching the "sponsored placements excluded from ranking inputs" rule in the README.
- **Smart Score formula** (`Score = ROI×0.5 + WinRate×0.3 + log(TotalCalls+1)×0.2`) is implemented in `computeRankingScore` in `@/lib/metrics.ts` — the single source of truth for ranking math on the frontend.
- **Live/real-time pages opt out of caching explicitly** (`export const dynamic = "force-dynamic"`, `revalidate = 0`) rather than relying on defaults, since market data must be fresh.

## 8. Known gap in this snapshot

The mounted project directory has many Next.js route files that share generic names (`page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`) across different folders in the real repo, but only one copy of each survived into this flattened `/mnt/project` snapshot (the home page, root layout, etc.). This doc is built from the ~69 uniquely-named component/lib files (which are complete and real) plus the README's site map — it does not enumerate every individual route folder's `page.tsx`/`route.ts` contents beyond the home page and root layout shown above.