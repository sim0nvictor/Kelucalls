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