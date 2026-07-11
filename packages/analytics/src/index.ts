/**
 * Analytics are intentionally produced by database functions/workers.
 * Bot services should read precomputed tables/views only.
 */
export const ANALYTICS_TABLES = {
  channels: "channels",
  calls: "calls",
  callMetrics: "call_metrics",
  channelStats: "channel_stats",
  trendingTokens: "trending_tokens"
} as const;
