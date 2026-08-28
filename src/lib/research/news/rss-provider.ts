/**
 * RSS-based news provider factory.
 *
 * CoinDesk, Cointelegraph, and TechCrunch all expose public RSS 2.0 feeds
 * (no API key, no auth, no rate-limit header to honor). They share the same
 * shape — <item><title/><link/><pubDate/><description/></item> — so we
 * parameterize a single parser over (source, feedUrl, userAgent).
 *
 * Each provider is independent: a CoinDesk outage does not affect
 * Cointelegraph or TechCrunch, and vice versa. The fetcher in providers.ts
 * is already failure-tolerant (throws on non-2xx / non-XML), and the
 * orchestrator in news/index.ts catches per-provider exceptions.
 */

import type { NewsSource, ResearchItem } from "../types";
import {
  fetchText,
  readString,
  stableId,
  type CacheEntry
} from "./providers";
import { parseRssFeed } from "./rss";

/** One feed's worth of configuration. */
export interface RssFeedConfig {
  /** The provider's source name (e.g. "coindesk"). Becomes the item.source. */
  source: NewsSource;
  /** The feed URL. */
  feedUrl: string;
  /** User-Agent header. Some CDNs (TechCrunch) reject bare bot UAs. */
  userAgent: string;
  /** Per-fetch timeout in ms. */
  timeoutMs: number;
  /** In-memory cache TTL in ms. */
  cacheTtlMs: number;
  /** Maximum items to keep from the feed. */
  maxItems: number;
}

function parsePubDate(value: string, collectedAt: string): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/** Build a NewsProvider that consumes a single RSS feed. */
export function createRssProvider(config: RssFeedConfig) {
  let cache: CacheEntry<ResearchItem[]> | null = null;

  return {
    source: config.source,
    async fetchItems(): Promise<ResearchItem[]> {
      const now = Date.now();
      if (cache && cache.expiresAt > now) return cache.value;

      const collectedAt = new Date().toISOString();
      const url = new URL(config.feedUrl);
      const body = await fetchText(url, config.source, config.timeoutMs, config.userAgent);
      const raw = parseRssFeed(body);

      const items: ResearchItem[] = [];
      for (const entry of raw) {
        const title = readString(entry.title);
        const link = readString(entry.link);
        const publishedAt = parsePubDate(entry.pubDate, collectedAt);
        if (!title || !link || !publishedAt) continue;

        const description = readString(entry.description) ?? null;

        items.push({
          id: stableId(config.source, link, title),
          source: config.source,
          source_type: "news",
          title,
          url: link,
          published_at: publishedAt,
          collected_at: collectedAt,
          category: "macro",
          description,
          summary: null,
          entities: []
        });

        if (items.length >= config.maxItems) break;
      }

      cache = { value: items, expiresAt: now + config.cacheTtlMs };
      return items;
    }
  };
}
