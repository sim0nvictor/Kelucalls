# Kelucalls Workers

Background workers for Kelucalls platform.

## Workers

### 1. Price Update Worker (`price-update.js`)

- Updates `call_metrics.current_price_usd` by polling DexScreener
- Updates `call_metrics.peak_price_usd` when new high is detected
- Runs every 5 minutes
- Uses exponential backoff for API failures

### 2. Trending Aggregation Worker (`trending-aggregate.js`)

- Aggregates token statistics into `trending_tokens` table
- Calculates unique channels, total calls, average ROI, best multiple
- Runs every 15 minutes

## Running Workers

```bash
# Price update worker
node workers/price-update.js

# Trending aggregation worker
node workers/trending-aggregate.js
```

## Railway Deployment

Add to Procfile:

```
worker: node workers/price-update.js && node workers/trending-aggregate.js
```

Or run individually:

```
price-worker: node workers/price-update.js
trending-worker: node workers/trending-aggregate.js
```

### Daily Research Pipeline

`npm run worker:research` is a one-shot worker. It collects provider data,
stores the snapshot, runs deterministic signals, generates and validates a
report, saves the report as a draft in the existing Insights `articles` table,
and notifies active admins through `user_notifications`. It records the
execution in `research_run` and skips an already completed UTC date.

This repository does not currently define a Railway cron schedule. Configure a
Railway Cron Job or separate worker service to invoke `npm run worker:research`
only after the migration is applied and one manual run succeeds. Do not add a
second in-process scheduler.
