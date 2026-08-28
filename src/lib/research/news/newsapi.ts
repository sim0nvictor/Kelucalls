import type { NewsProvider } from "./providers";
import type { ResearchItem } from "../types";
import { fetchJson, readArray, readRecord, readString, stableId, type CacheEntry } from "./providers";

const NEWSAPI_URL = "https://newsapi.org/v2/everything";
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 15 * 60_000;
const PAGE_SIZE = 50;

let cache: CacheEntry<ResearchItem[]> | null = null;

const QUERY = [
  "bitcoin",
  "ethereum",
  "stablecoin",
  "crypto regulation",
  "Federal Reserve",
  "inflation",
  "interest rates",
  "artificial intelligence",
  "semiconductor",
  "sanctions"
].join(" OR ");

function getApiKey(): string | null {
  const value = process.env.NEWS_API_KEY;
  return value && value.trim().length > 0 ? value.trim() : null;
}

function lookbackIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function parseArticle(article: unknown, collectedAt: string): ResearchItem | null {
  const record = readRecord(article);
  if (!record) return null;

  const title = readString(record.title);
  const url = readString(record.url);
  const publishedAt = readString(record.publishedAt);
  if (!title || !url || !publishedAt || Number.isNaN(Date.parse(publishedAt))) return null;

  const description = readString(record.description);

  return {
    id: stableId("newsapi", url, title),
    source: "newsapi",
    source_type: "news",
    title,
    url,
    published_at: new Date(publishedAt).toISOString(),
    collected_at: collectedAt,
    category: "macro",
    description,
    summary: null,
    entities: []
  };
}

export const newsApiProvider: NewsProvider = {
  source: "newsapi",
  async fetchItems(): Promise<ResearchItem[]> {
    const now = Date.now();
    if (cache && cache.expiresAt > now) return cache.value;

    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("NEWS_API_KEY is not set");
    }

    const collectedAt = new Date().toISOString();
    const url = new URL(NEWSAPI_URL);
    url.searchParams.set("q", QUERY);
    url.searchParams.set("searchIn", "title,description");
    url.searchParams.set("from", lookbackIso(24));
    url.searchParams.set("language", "en");
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    url.searchParams.set("page", "1");

    const payload = await fetchJson(url, "newsapi", REQUEST_TIMEOUT_MS, {
      "x-api-key": apiKey
    });
    const root = readRecord(payload);
    if (!root || root.status !== "ok") {
      throw new Error("NewsAPI returned a non-ok payload");
    }

    const items = readArray(root.articles)
      .map((article) => parseArticle(article, collectedAt))
      .filter((item): item is ResearchItem => item !== null);

    cache = { value: items, expiresAt: now + CACHE_TTL_MS };
    return items;
  }
};
