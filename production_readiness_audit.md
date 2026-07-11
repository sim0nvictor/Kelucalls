# Kelucalls Production Readiness Audit

Audit date: 2026-06-27  
Target: current working tree in `C:\Users\ASUS\KeluCall`  
Scope: Next.js app, Supabase schema/policies, API routes, admin server actions, Telegram scraper, workers, Railway config, dependencies, GitHub readiness.

## Critical Issues (Must fix before deployment)

1. **Public request paths use Supabase service-role clients and bypass RLS.**
   - Locations:
     - `src/lib/supabase.ts:4-19`
     - `src/lib/supabase/server.ts:16-30`
     - `src/app/api/submissions/route.ts:27-39`
     - `src/app/api/track/route.ts:79-83`, `94-99`, `129-137`, `145-153`, `166-175`
     - `src/app/api/search/route.ts:17-37`, `62-75`
     - `src/app/api/ads/click/route.ts:20-45`
     - `src/app/api/ads/impression/route.ts:41-49`
   - Evidence:
     ```ts
     // src/lib/supabase.ts:4-15
     export function getSupabaseServerClient() {
       const url = getSupabaseUrl();
       const key = getSupabaseServiceRoleKey();
       return createClient(url, key, { ... });
     }
     ```
   - Impact: Any bug in validation, routing, or query construction executes with full database privileges. RLS policies in `supabase/migrations/001_kelucalls_baseline.sql:817-831` are bypassed by the web server for public endpoints.
   - Fix: Split clients by trust boundary. Public read APIs should use anon/RLS or scoped RPCs. Public write APIs should call narrowly scoped `security definer` RPCs that validate fields server-side. Keep service role only in admin actions, scrapers, and internal workers.

2. **Database schema does not define `tracking_requests`, but production code depends on it.**
   - Locations:
     - `src/app/api/track/route.ts:95`, `130`, `146`, `167`
     - `src/app/api/track/status/route.ts:18`
     - `scraper/index.js:464`, `483`, `494`, `559`, `573`, `583`, `592`
   - Evidence:
     ```ts
     // src/app/api/track/route.ts:167
     const { data, error } = await sb.from("tracking_requests").insert({ ... })
     ```
     `rg "tracking_requests" supabase` finds no migration creating or securing that table.
   - Impact: `/api/track`, `/api/track/status`, and queue processing will fail after a clean Supabase reset/Railway deploy. If a manually created table exists, its RLS/indexes/grants are not represented in source control.
   - Fix: Add a migration for `tracking_requests` with columns used by the app, unique/indexed normalized handle, statuses, timestamps, RLS, grants, and queue-claiming RPC.

3. **`npm audit` reports high-severity vulnerabilities in production dependencies.**
   - Locations:
     - `package.json:39-40`, `47`
     - `package-lock.json`
   - Evidence from `npm audit --json`: 15 vulnerabilities total, 4 high. High findings include `next <15.5.18` middleware/proxy bypass and SSRF/DoS advisories, `form-data <4.0.6`, and `ws <8.21.0`.
   - Impact: The current `next` version is in vulnerable ranges that specifically affect App Router middleware/proxy auth boundaries and DoS resilience.
   - Fix: Upgrade at minimum to a patched Next.js release outside the reported ranges, then rerun `npm audit`. Remove unused `next-auth` or upgrade/migrate because it pulls vulnerable `uuid`.

4. **Production build is not clean.**
   - Locations:
     - `src/app/track/page.tsx:13`, `662`, `670`
     - `src/app/api/telegram-lookup/route.ts:86`, `94`
     - `src/app/api/track/route.ts:37`, `40`
   - Evidence:
     - `npm run lint` fails with unused imports and `react-hooks/set-state-in-effect`.
     - `npm run build` compiled but timed out during lint/type validation after 3 minutes; TypeScript diagnostics appeared for Telegram entity casts and a state comparison in `src/app/track/page.tsx`.
   - Impact: Railway Nixpacks normally runs the build script. Deployment can fail or ship with unchecked type errors if checks are bypassed.
   - Fix: Make lint/typecheck pass in CI before deployment. Add a dedicated `npm run typecheck`.

5. **Public health endpoint leaks internal environment and database state.**
   - Locations:
     - `src/app/api/health/route.ts:7-12`
     - `src/lib/supabase/health.ts:13-23`, `47-62`, `89-95`
   - Evidence:
     ```ts
     // src/lib/supabase/health.ts:50-54
     results.push({ name: `env:${name}`, status: "error", message: `Missing required env var (${scope})` });
     results.push({ name: `env:${name}`, status: "ok", message: `Set (${scope})` });
     ```
   - Impact: Anyone can enumerate required secrets and table names and observe deployment misconfiguration.
   - Fix: Expose a minimal unauthenticated `/api/health` returning only `{ ok: true }` or 503. Move detailed checks to an admin-only endpoint or Railway private diagnostics.

## High Priority

1. **No durable rate limiting on abuse-prone public endpoints.**
   - Locations:
     - `src/app/api/submissions/route.ts:19-47`
     - `src/app/api/track/route.ts:59-188`
     - `src/app/api/telegram-lookup/route.ts:67-164`
     - `src/lib/admin/rate-limit.ts:6-29`
   - Evidence:
     ```ts
     // src/lib/admin/rate-limit.ts:6
     const store = new Map<string, Bucket>();
     ```
   - Impact: In-memory limits reset on restart, do not work across Railway replicas, and can grow unbounded with attacker-controlled keys. Public Telegram lookup and tracking can be used to burn Telegram API quota and database writes.
   - Fix: Use Redis/Upstash/Railway Redis for IP/user/action limits; add CAPTCHA/Turnstile on `/api/track` and submissions; enforce request body size limits; add edge/WAF throttles.

2. **Admin cookie middleware is only a hint, and there are two conflicting middleware files.**
   - Locations:
     - Active root `middleware.ts:11-45`
     - Unused or misleading `src/middleware.ts:19-59`
     - Admin verification in `src/lib/admin/auth.ts:132-163`
   - Evidence:
     ```ts
     // middleware.ts:44-45
     matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|icons.svg).*)"]
     ```
   - Impact: Duplicated middleware creates deploy confusion. The active root middleware is broader and forwards request headers globally. With current vulnerable Next.js ranges, middleware bypass advisories are especially relevant.
   - Fix: Keep one middleware file, document that protected layouts/actions call `requireAdminIdentity()`, and upgrade Next.js.

3. **Ad click endpoint performs database-controlled open redirects.**
   - Location: `src/app/api/ads/click/route.ts:20-45`
   - Evidence:
     ```ts
     return NextResponse.redirect(data.destination_url);
     ```
   - Impact: If an admin account is compromised or a bad ad is entered, Kelucalls becomes a phishing redirector. DB checks only enforce `^https?://` in `supabase/migrations/001_kelucalls_baseline.sql:388`, not domain trust.
   - Fix: Add an allowlist/review workflow for advertiser domains, reject private/internal hosts, and show an interstitial for untrusted external destinations.

4. **Search endpoint interpolates user input into PostgREST `.or()` filter strings.**
   - Location: `src/app/api/search/route.ts:13-36`, `60-75`
   - Evidence:
     ```ts
     const term = `%${q}%`;
     .or(`title.ilike.${term},telegram_handle.ilike.${term}`)
     ```
   - Impact: Special PostgREST filter characters in `q` can alter query syntax or cause expensive errors. This is not raw SQL injection, but it is unsafe query-language construction.
   - Fix: Use escaped filter values, RPC search functions, full-text search, or normalized generated columns with parameterized equality/prefix queries. Cap `q` length.

5. **Telegram lookup runs in public API routes and can exhaust Telegram session/API quota.**
   - Locations:
     - `src/app/api/telegram-lookup/route.ts:37-58`, `78-83`
     - `src/app/api/track/route.ts:19-36`, `109`
   - Evidence:
     ```ts
     const entity = await client.getEntity(`@${username}`);
     ```
   - Impact: Anonymous users can trigger network calls to Telegram. `/api/track` creates a new Telegram client per request and connects on each call.
   - Fix: Queue lookups behind rate limits; cache negative/positive lookups; reuse a managed client in one worker; make `/api/track` enqueue only and let the scraper resolve.

6. **Bot webhook server reads unbounded request bodies and does not validate Telegram secret header.**
   - Location: `apps/bot/src/index.ts:19-38`
   - Evidence:
     ```ts
     req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
     const update = JSON.parse(Buffer.concat(chunks).toString("utf8"));
     ```
   - Impact: Memory DoS against the bot service; relying on secret-in-path is weaker than checking `X-Telegram-Bot-Api-Secret-Token`.
   - Fix: Enforce max body size, timeout, content type, and validate Telegram’s secret token header before parsing.

7. **Railway process model is incomplete and ambiguous.**
   - Locations:
     - `railway.json:9-19`
     - `Procfile:9-12`
     - `package.json:21-24`
   - Evidence:
     ```procfile
     scraper: node index.js
     price-worker: node workers/price-update.js
     trending-worker: node workers/trending-aggregate.js
     ```
   - Impact: Railway may deploy only the web service unless each worker is configured as a separate service/process. Running all workers in one service is fragile.
   - Fix: Create separate Railway services for web, scraper, price worker, trending worker, and bot. Give each its own health check, restart policy, env vars, and logs.

## Medium Priority

1. **No security headers are configured.**
   - Evidence: `rg "Content-Security-Policy|X-Frame-Options|Referrer-Policy|Permissions-Policy|X-Content-Type-Options"` only found unrelated `headers()` calls.
   - Impact: Weaker XSS/clickjacking/ MIME-sniffing defense.
   - Fix: Add `headers()` in `next.config` for CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors` or `X-Frame-Options`.

2. **Admin roles are not enforced per action.**
   - Locations: `src/lib/admin/auth.ts:16-23`, `src/app/kx-admin/actions.ts:122-471`
   - Evidence: actions call `requireAdminIdentity()` but do not check `identity.role` for mutation authorization.
   - Impact: `analyst` and `moderator` roles can perform broad ad/channel/submission mutations if allowlisted.
   - Fix: Add `requireAdminRole(["super_admin", "admin"])` style authorization per action.

3. **Admin audit IP is not hashed despite field name.**
   - Location: `src/lib/admin/auth.ts:226-238`
   - Evidence:
     ```ts
     ip_hash: metadata.forwardedFor || null
     ```
   - Impact: Stores raw IP/header values in an `ip_hash` field; privacy and data-minimization issue.
   - Fix: Hash canonical client IP with a server-side salt and never trust arbitrary `x-forwarded-for` except from Railway proxy semantics.

4. **Ad analytics endpoints use service role because RLS has no insert policy for public event inserts.**
   - Locations:
     - `src/app/api/ads/impression/route.ts:41-49`
     - `src/app/api/ads/click/route.ts:34-43`
     - Policies only grant admin read: `supabase/migrations/001_kelucalls_baseline.sql:1128-1153`
   - Impact: Public event insert paths require full DB power.
   - Fix: Add narrow RPCs for `record_ad_impression` and `record_ad_click` or insert policies constrained by validated active ad IDs.

5. **Health schema expects `trending_snapshots`, but baseline migration drops it and does not recreate it.**
   - Locations:
     - `src/lib/supabase/health.ts:25-38`
     - `supabase/migrations/001_kelucalls_baseline.sql:40`
   - Impact: Fresh deployments will report degraded health even when the current schema is correct.
   - Fix: Remove obsolete table from health checks or add the table if still required.

6. **Public submission endpoint returns raw Supabase error messages.**
   - Location: `src/app/api/submissions/route.ts:41-43`
   - Evidence:
     ```ts
     return NextResponse.json({ error: error.message }, { status: 500 });
     ```
   - Impact: Leaks schema/constraint details.
   - Fix: Log sanitized server details and return a generic client error.

7. **Scraper queue claiming is race-prone.**
   - Location: `scraper/index.js:462-485`
   - Evidence: selects queued rows, then updates status separately.
   - Impact: Multiple scraper instances can process the same queued item.
   - Fix: Use `SELECT ... FOR UPDATE SKIP LOCKED` in an RPC, or a job queue with lease/visibility timeout.

## Low Priority

1. `.gitignore` duplicates entries and misses some generated/local artifacts.
   - Locations: `.gitignore:10`, `30-32`
   - Add: `.playwright-cli/*.log`, `*.tsbuildinfo`, `apps/**/.env`, `scraper/*.session`, `*.session`, `coverage/`, `playwright-report/`, `test-results/`, `.vercel/`, `.railway/`, `*.tgz`.

2. `package.json` has stale Prisma scripts while Prisma files are deleted.
   - Locations: `package.json:25-27`; git status shows deleted `prisma/*`.
   - Fix: remove scripts or restore Prisma intentionally.

3. Unused dependencies likely exist.
   - Locations: `package.json:33`, `37`, `40`, `60-61`
   - Evidence: `bcryptjs`, `next-auth`, `init`, root `npm` package are not referenced in app code; `input` appears only in `scraper/login.js`.
   - Fix: remove unused runtime dependencies, keep `input` as dev-only if only used for session generation.

## Security Findings

- No hardcoded real secrets were found in tracked files. `.env` and `apps/bot/.env` exist locally but are not tracked by `git ls-files`; do not push or paste them. Rotate any secret that was ever committed before this audit.
- Service-role usage is overbroad in public Next.js APIs. This is the largest security design risk.
- Admin cookies use `httpOnly`, `sameSite: "lax"`, and production `secure` flags in `src/lib/admin/auth.ts:78-104`; that part is reasonable.
- CSRF exposure is limited for public unauthenticated JSON APIs, but admin Server Actions rely on Next.js origin protections and should also upgrade Next.js due middleware/action advisories.
- No `dangerouslySetInnerHTML`, `eval`, `localStorage`, `postMessage`, or obvious DOM XSS sinks were found in app source.
- Public health output and raw DB errors leak operational information.
- Public ad redirect should be domain-reviewed, not just URL-shaped.
- Public Telegram lookup/track endpoints need bot protection and durable rate limiting.

## Scalability Findings

- `getDashboardSnapshot()` fans out to five database reads per request in `src/lib/dashboard-data.ts:332-347`, and pages call the same data repeatedly. At 100k+ users this needs edge/app caching or precomputed public snapshots.
- `getLeaderboard()` loads all active/paused channels then sorts in Node and slices in `src/lib/dashboard-data.ts:187-229`. This becomes expensive as channel count grows.
- `getChannelDetail()` first calls `getLeaderboard("smart", 100)` and then searches in memory in `src/lib/dashboard-data.ts:369-403`; channels beyond the top 100 are unreachable by API.
- `getAnalyticsSummary()` loads all 30-day impressions/clicks into memory in `src/lib/admin/data.ts:220-305`; this will break with high ad traffic.
- Price worker fetches up to 500 open calls and processes external price requests sequentially every five minutes in `workers/price-update.js:98-105`, `278-304`.
- `refresh_trending_tokens()` uses non-concurrent materialized view refresh in `supabase/migrations/001_kelucalls_baseline.sql:789-795`, which can block reads/writes as data grows.
- In-memory rate limiter Map can grow with attacker-provided IP/header keys in `src/lib/admin/rate-limit.ts:6-29`.
- Scraper backfills every channel sequentially on startup in `scraper/index.js:703-706`.

## Performance Findings

- `npm run lint` fails; `npm run build` did not finish within 180s after compiling.
- No app-level cache headers are set for public API routes.
- `noStore()` in `getDashboardSnapshot()` (`src/lib/dashboard-data.ts:333`) disables caching of one of the most expensive public reads.
- Search uses `%term%` `ilike` across text columns (`src/app/api/search/route.ts:13-75`), which will need trigram indexes or full-text search.
- `next.config.ts:3-7` raises Server Action body size to 4 MB without a documented need.
- Images allow remote GitHub/Dex/CoinGecko/Telegram domains (`next.config.ts:8-31`); ensure image optimizer caching and host allowlist stay tight.

## Railway Readiness

- `railway.json` configures one replica and `/api/health` on port 3000 (`railway.json:9-19`), but workers and bot need separate Railway services.
- The health endpoint is too detailed for public use and currently checks an obsolete table.
- `Procfile` references root `index.js`, not `scraper/index.js`, and package script also uses root `index.js`; choose one implementation.
- Root workers call `dotenv.config()` / `.env` loaders. Railway should inject secrets; local `.env` loading is fine but should not be required in production.
- Add deployment variables at minimum:
  - Web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NODE_ENV=production`
  - Scraper: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Bot: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`
  - Workers: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, interval/retry vars as needed
- Add Railway Redis or equivalent for rate limiting, job locks, and queues.

## GitHub Readiness

- Safe to push only after reviewing untracked/modified files. Current git status has many modified/deleted/untracked files.
- `.env` is ignored and not tracked, but local secret files exist:
  - `.env`
  - `apps/bot/.env`
- Generated/local artifacts present:
  - `.next/`
  - `node_modules/`
  - `next-dev.log`
  - `next-dev-admin.log`
  - `next-dev-channel-card.log`
  - `tsconfig.tsbuildinfo`
  - `.playwright-cli/*.log`
- `git ls-files` currently only reports `.env.example` among env/log/build artifact patterns, but add ignore rules before future commits.

## Recommended Fixes

1. Upgrade `next`, `eslint-config-next`, and vulnerable transitive packages; rerun `npm audit`.
2. Add the missing `tracking_requests` migration with RLS, indexes, queue lease fields, and RPC claiming.
3. Refactor public APIs away from service-role clients.
4. Add Redis-backed rate limiting and bot protection to `/api/track`, `/api/telegram-lookup`, `/api/submissions`, ad analytics, and admin sign-in.
5. Make `npm run lint`, `npm run build`, and a new `npm run typecheck` pass.
6. Replace `/api/health` output with a minimal public status and move detailed checks behind admin auth.
7. Consolidate scraper implementations and run every long-lived process as its own Railway service.
8. Batch/cached price updates and use distributed locks/queues for workers.
9. Add security headers in `next.config.ts`.
10. Remove stale Prisma scripts and unused dependencies.

## Overall Deployment Score (0-100)

**42 / 100**

The product has a solid schema direction and RLS exists, but it is not production-ready because the public app bypasses RLS with the service role, the tracked-channel queue schema is missing, dependency advisories include high-severity Next.js issues, builds are not clean, and Railway worker topology is not settled.

## Estimated Maximum Capacity Before First Major Architecture Upgrade

**Current architecture: roughly 1,000-5,000 active monthly users, or much less under scraper/API abuse.**

The first major upgrade will be needed when public traffic or Telegram tracking volume grows enough that uncached dashboard reads, `%ilike%` search, in-memory rate limits, sequential price polling, and non-locked queue processing become unreliable. With the recommended fixes, the same product shape can likely reach 50,000-100,000 users before moving to a fuller event/queue/cache architecture.
