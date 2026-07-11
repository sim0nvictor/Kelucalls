# Kelucalls Telegram Bot

Production Telegram bot microservice for Kelucalls alerts. It runs independently from the Next.js app and talks directly to Supabase with the service role key.

## What It Does

- Registers Telegram users with `/start`
- Stores subscriptions and alert preferences in Supabase
- Reads precomputed Kelucalls analytics from `channels`, `calls`, `call_metrics`, `channel_stats`, and `trending_tokens`
- Polls `bot_events` for alert events inserted by workers
- Sends Telegram alerts for achievements, new calls, trending tokens, and coordinated calls
- Exposes `GET /health` for Railway health checks

The bot does not calculate ROI, rankings, trending scores, or milestones. Those values remain owned by workers/database analytics.

## Commands

- `/start` - register and subscribe
- `/help` - show commands
- `/sub` - enable alerts
- `/unsub` - disable subscriptions
- `/list` - show active subscriptions and preferences
- `/callalerts` - enable smart call alerts
- `/stopcallalert` - disable smart call alerts
- `/minscore 80` - set minimum call confidence score
- `/chains solana ethereum` - filter smart alerts by chain
- `/topkols` - show top KOL leaderboard
- `/trending` - show trending tokens

## Setup

1. Apply the migration:

```bash
supabase db push
```

2. Configure environment variables from `.env.example`:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
BOT_POLL_INTERVAL_MS=5000
```

`TELEGRAM_WEBHOOK_URL` is optional. If present, the bot uses webhook mode at `/telegram/:secret`. If absent, it uses Telegram long polling while still serving `/health`.

3. Install dependencies and run:

```bash
npm install
npm run bot:build
npm run bot:start
```

For local development:

```bash
npm run bot:dev
```

## Event Flow

Workers insert rows into `bot_events`:

```sql
insert into public.bot_events (event_type, call_id, token_id, payload)
values ('new_call', '<call uuid>', '<token uuid>', '{"source":"worker"}');
```

The bot polls unprocessed events, fetches the related precomputed data, sends matching alerts, then sets `processed = true` and `processed_at = now()`.

## Railway

Deploy the repo root with `apps/bot/railway.json` settings or configure these commands manually:

```bash
npm install && npm run bot:build
npm run bot:start
```

Health check path:

```text
/health
```

Set Railway environment variables from `.env.example`. For webhook mode, set `TELEGRAM_WEBHOOK_URL` to the Railway public URL.

## Folder Map

- `src/config` - environment validation
- `src/commands` - Telegraf command registration
- `src/db` - Supabase service-role client
- `src/services` - users, subscriptions, queries, event processing
- `src/jobs` - bounded event poller
- `src/utils` - logging, retry, and Telegram formatting
- `src/types` - bot domain types
- `src/handlers` - HTTP health/webhook helpers

## Scaling Notes

Run one bot process per Telegram token unless event claiming is added. The current poller is bounded and overlap-safe inside one process. For multiple replicas, add a claim/lock column update around event selection or convert `bot_events` delivery to a queue worker with row-level locking.
