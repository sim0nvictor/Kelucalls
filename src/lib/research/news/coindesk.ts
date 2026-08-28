/**
 * CoinDesk RSS provider.
 *
 * Public RSS feed (no API key):
 *   https://www.coindesk.com/arc/outboundfeeds/rss/
 *
 * 15-minute in-memory cache, 25 items per fetch, 8s timeout.
 */

import { createRssProvider } from "./rss-provider";

export const coindeskProvider = createRssProvider({
  source: "coindesk",
  feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
  userAgent: "kelucalls-research/1.0 (+https://kelucall.com)",
  timeoutMs: 8_000,
  cacheTtlMs: 15 * 60_000,
  maxItems: 25
});
