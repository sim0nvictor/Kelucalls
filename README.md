# Kelucalls

**Performance-first crypto call intelligence.**

Kelucalls is a crypto intelligence platform that tracks Telegram signal ("call") channels, ranks them on *realized* performance, and surfaces trending tokens and live calls in a single dashboard.

🔗 [kelucalls.com](https://kelucalls.com)

**Stack:** Next.js 16 (React 19, TypeScript) · Supabase (Postgres/Auth) · Prisma · NextAuth · Telegraf/GramJS (Telegram bot & scraper) · Tailwind CSS 4 · npm workspaces monorepo

---

## What it does

Kelucalls monitors public Telegram channels that post crypto trading calls (buy/entry signals) and algorithmically tracks what happens to those calls afterward — price movement, ROI, win/loss outcome — to build a transparent, data-driven leaderboard of signal providers.

Core surfaces on the platform:

| Feature | Description |
|---|---|
| **Channel Leaderboard** | Ranks tracked Telegram channels by realized call performance using a transparent trust/scoring model. |
| **Trending Tokens** | Aggregates the tokens most frequently called across tracked channels, with ROI, call count, chain, and best/last-call data. |
| **Live Calls** | Real-time feed of incoming calls with live ROI tracking, peak performance, and breakout detection. |
| **Channel Submission** | Telegram signal providers can submit their channel for tracking and verification. |
| **Bot / Alerts** | A companion Telegram bot ([@KeluCallsAlerts_bot](https://t.me/KeluCallsAlerts_bot)) surfaces call alerts. |

## Ranking methodology

Kelucalls uses a "Smart Score" trust model, calculated as:

```
Score = (Average ROI × 0.5) + (Win Rate × 0.3) + (log(Total Calls + 1) × 0.2)
```

Additional principles:
- Rankings are **purely data-driven** — no manual or editorial intervention.
- **Sponsored/paid placements are excluded from ranking inputs** and are always visually labeled separately from organic results.
- Alternative sort views are available: Smart ranking, ROI, Win rate, and PnL.
- Outcomes are verified by checking whether a called token reached its stated price target within the stated timeframe; historical stats are recalculated as new outcomes are verified.

## Channel submission & verification

- Channel owners can submit their Telegram channel for listing via the [Listing Policy](https://kelucalls.com/listing-policy) page.
- Channels must be **public**, focused on crypto trading signals, and meet minimum activity thresholds to be eligible.
- Verified channels (ownership confirmed) receive a badge.
- Channels found manipulating stats are subject to removal; removal requests from owners are processed within 5–7 business days (historical data may persist in archives).

## Advertising

Kelucalls accepts sponsored placements from legitimate crypto projects, governed by an [Advertiser Policy](https://kelucalls.com/advertiser-policy). Ads from scams, phishing sites, fake airdrops, Ponzi schemes, and illegal financial services are rejected. Sponsored content is always labeled and never influences organic leaderboard scores.

## Disclaimer

Kelucalls is an **analytics and tracking tool, not investment advice**:
- It does not guarantee profitable calls.
- Past channel performance does not guarantee future results.
- Crypto trading carries significant risk; users should only trade with funds they can afford to lose and should independently verify signals before acting on them.

See the full [Disclaimer](https://kelucalls.com/disclaimer), [Terms](https://kelucalls.com/terms), [Privacy Policy](https://kelucalls.com/privacy), and [Cookies Policy](https://kelucalls.com/cookies) for details.

## Links

- **Site:** https://kelucalls.com
- **Twitter/X:** https://x.com/kelucalls
- **Telegram channel:** https://t.me/kELUSCALLGOOOO
- **Alerts bot:** https://t.me/KeluCallsAlerts_bot
- **Built by:** [Sevmeta](https://sevmeta.xyz)
- **Partner:** [SevLabs](https://sevlabx.xyz)

## Site map

- `/` — Market overview dashboard (tracked channels/tokens/calls stats, trending tokens, live calls, leaderboard)
- `/channels` — Full channel leaderboard
- `/channels/:slug` — Individual channel profile
- `/trending` — Trending tokens
- `/tokens?symbol=...` — Individual token detail
- `/live` — Live call feed
- `/help` — Help Center
- `/faq` — Frequently Asked Questions
- `/ranking-methodology` — Full ranking methodology writeup
- `/community-guidelines` — Community guidelines
- `/listing-policy` — Channel submission / listing rules
- `/advertiser-policy` — Advertising guidelines
- `/contact` — Contact form
- `/terms`, `/privacy`, `/cookies`, `/disclaimer`, `/dmca` — Legal pages

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) `22.x`
- npm `11.x`

(Both pinned in `engines` in `package.json`.)

### Installation

```bash
git clone <repo-url>
cd kelucall
npm install
```

This is an **npm workspaces monorepo** — a single install at the root pulls in dependencies for all workspaces (`apps/bot`, `packages/shared`, `packages/db`, `packages/analytics`).

### Environment variables

Copy the example env file and fill in the required values:

```bash
cp .env.example .env.local
```

<!-- TODO: pull the exact variable names from .env.example — the app depends on credentials for each of these services: -->
| Service | Needed for |
|---|---|
| **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) | Database access, and/or auth session handling on the server/client |
| **Prisma** | ORM layer over the primary database (likely the same Postgres instance as Supabase) — needs a `DATABASE_URL` |
| **NextAuth** (`next-auth`) | Site authentication — needs a secret and provider credentials |
| **Telegram Bot API** (`telegraf`) | Powers `apps/bot` / the `@KeluCallsAlerts_bot` alerts bot — needs a bot token |
| **Telegram Client API** (`telegram` / GramJS) | Powers the channel/call scraper — needs API ID/hash and a logged-in session (see `npm run scraper:login`) |

### Running locally

```bash
npm run dev          # Next.js web app → http://localhost:3000
npm run bot:dev       # Telegram bot (apps/bot workspace)
```

### Build & production

```bash
npm run build
npm run start
```

## Available scripts

From the root `package.json`:

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Build the Next.js app for production |
| `npm run start` | Run the production Next.js build |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run bot:dev` / `bot:build` / `bot:start` / `bot:typecheck` | Run/build/typecheck the Telegram bot (`@kelucalls/bot` workspace, `apps/bot`) |
| `npm run scraper` | Run the Telegram channel/call scraper (`scraper/index.js`) |
| `npm run scraper:login` | Authenticate the scraper's Telegram client session (`scraper/login.js`) |
| `npm run worker:price` | Update live token prices (`workers/price-update.js`) |
| `npm run worker:trending` | Recompute trending-token aggregates (`workers/trending-aggregate.js`) |
| `npm run worker:all` | Run the price and trending workers together |
| `npm run worker:avatars` | Sync channel avatars (`scripts/channel-avatar-sync.js`) |
| `npm run worker:logos` | Backfill token logos (`workers/token-logo-backfill.js`) |
| `npm run worker:intent` | Run the intent-detection engine (`workers/intent-engine.js`) |
| `npm run worker:alerts` | Send intent-based alerts (`workers/intent-alerts.js`) |
| `npm run worker:trending-alerts` | Send trending-token alerts (`workers/trending-alerts.js`) |
| `npm run worker:summaries` | Generate intent summaries (`workers/intent-summaries.js`) |
| `npm run prisma:generate` | Generate the Prisma client |
| `npm run prisma:migrate` | Run Prisma migrations in dev |
| `npm run db:seed` | Seed the database (`prisma/seed.mjs`) |

## Project structure

```
.
├── apps/
│   └── bot/                  # @kelucalls/bot — Telegraf-based Telegram alerts bot
├── packages/
│   ├── shared/                # Shared types/utils across web, bot, workers
│   ├── db/                    # Prisma schema/client (@kelucalls/db)
│   └── analytics/             # Ranking / scoring / analytics logic
├── scraper/
│   ├── index.js                # Telegram channel & call scraper (GramJS)
│   └── login.js                 # Scraper Telegram session auth
├── workers/
│   ├── price-update.js
│   ├── trending-aggregate.js
│   ├── token-logo-backfill.js
│   ├── intent-engine.js
│   ├── intent-alerts.js
│   ├── trending-alerts.js
│   └── intent-summaries.js
├── scripts/
│   └── channel-avatar-sync.js
├── prisma/
│   └── seed.mjs
├── app/                        # Next.js app router (web frontend)
├── .env.example
├── package.json                 # npm workspaces root
└── README.md
```

<!-- TODO: confirm exact web-app directory (app/ vs src/app/) and any dirs not reflected above -->

## Architecture notes

- **Web app** — Next.js 16 / React 19 frontend serving the dashboard, leaderboard, and public pages, with NextAuth for auth and Supabase as a backing service.
- **Data layer** — Prisma ORM (`packages/db`) against a Postgres database, likely hosted via Supabase.
- **Ingestion** — `scraper/` uses GramJS (`telegram`) to read calls directly from tracked Telegram channels; requires an authenticated user session via `npm run scraper:login`.
- **Bot** — `apps/bot` uses Telegraf to run `@KeluCallsAlerts_bot`, the alerts-delivery bot.
- **Workers** — a set of standalone Node scripts (`workers/`) handle recurring jobs: live price updates, trending-token aggregation, logo/avatar backfills, and an "intent engine" that appears to drive alerting/summary features.
- **Analytics** — `packages/analytics` likely houses the Smart Score / ranking-methodology calculations (see [Ranking methodology](#ranking-methodology)).

## Deployment

<!-- TODO: confirm hosting provider and CI/CD pipeline; workers/scraper/bot likely need long-running processes or scheduled jobs separate from the Next.js deployment -->
The production site is deployed at [kelucalls.com](https://kelucalls.com). The web app, bot, scraper, and workers are separate runtime processes and may be deployed/scheduled independently.

## Contributing

- Open an issue before starting significant work.
- Run `npm run lint` and `npm run typecheck` before submitting a PR.
- Keep ranking-methodology and data-integrity changes (see [Ranking methodology](#ranking-methodology) and `packages/analytics`) especially well-documented and reviewed, since they directly affect the public leaderboard.
- Do not commit secrets — use `.env.local` (gitignored) for local credentials.
- If you touch the scraper or bot, be mindful of Telegram API rate limits and terms of service.

## License

<!-- TODO: add license (e.g. proprietary / All rights reserved, or an OSS license) -->
© 2026 Kelucalls. All rights reserved. `"private": true` in `package.json` — not published to a registry.

---

*© 2026 Kelucalls. All rights reserved.*