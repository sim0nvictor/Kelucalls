import type { NewsProvider } from "./providers";
import type { ResearchItem } from "../types";
import { fetchJson, readArray, readRecord, readString, stableId, type CacheEntry } from "./providers";

const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 15 * 60_000;
const MAX_RECORDS = 25;

let cache: CacheEntry<ResearchItem[]> | null = null;

const QUERY =
  '(bitcoin OR ethereum OR stablecoin OR "crypto regulation" OR "Federal Reserve" OR inflation OR "interest rates" OR "artificial intelligence" OR semiconductor OR sanctions)';

function parsePublishedAt(record: Record<string, unknown>): string | null {
  const raw =
    readString(record.seendate) ??
    readString(record.sourceDate) ??
    readString(record.publishedAt) ??
    readString(record.date);
  if (!raw) return null;

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  const candidate = compact
    ? `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`
    : raw;
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function parseArticle(article: unknown, collectedAt: string): ResearchItem | null {
  const record = readRecord(article);
  if (!record) return null;

  const title = readString(record.title);
  const url = readString(record.url);
  const publishedAt = parsePublishedAt(record);
  if (!title || !url || !publishedAt) return null;

  return {
    id: stableId("gdelt", url, title),
    source: "gdelt",
    source_type: "news",
    title,
    url,
    published_at: publishedAt,
    collected_at: collectedAt,
    category: "macro",
    description: null,
    summary: null,
    entities: []
  };
}

export const gdeltProvider: NewsProvider = {
  source: "gdelt",
  async fetchItems(): Promise<ResearchItem[]> {
    const now = Date.now();
    if (cache && cache.expiresAt > now) return cache.value;

    const collectedAt = new Date().toISOString();
    const url = new URL(GDELT_DOC_URL);
    url.searchParams.set("query", QUERY);
    url.searchParams.set("mode", "artlist");
    url.searchParams.set("format", "json");
    url.searchParams.set("timespan", "24h");
    url.searchParams.set("sort", "datedesc");
    url.searchParams.set("maxrecords", String(MAX_RECORDS));

    const payload = await fetchJson(url, "gdelt", REQUEST_TIMEOUT_MS);
    const root = readRecord(payload);
    const rows = readArray(root?.articles);

    const items = rows
      .map((article) => parseArticle(article, collectedAt))
      .filter((item): item is ResearchItem => item !== null);

    cache = { value: items, expiresAt: now + CACHE_TTL_MS };
    return items;
  }
};
