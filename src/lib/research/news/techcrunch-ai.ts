/**
 * TechCrunch AI category RSS provider.
 *
 * Public RSS feed (no API key):
 *   https://techcrunch.com/category/artificial-intelligence/feed/
 *
 * TechCrunch's WordPress-fronted feed sometimes rejects minimal UAs; we
 * pass a more browser-like UA. 15-minute in-memory cache, 20 items per
 * fetch (smaller than the crypto feeds because AI stories are slower to
 * turn over), 10s timeout.
 */

import { createRssProvider } from "./rss-provider";

export const techCrunchAiProvider = createRssProvider({
  source: "techcrunch_ai",
  feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/",
  userAgent:
    "Mozilla/5.0 (compatible; kelucalls-research/1.0; +https://kelucall.com)",
  timeoutMs: 10_000,
  cacheTtlMs: 15 * 60_000,
  maxItems: 20
});
