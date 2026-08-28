import type {
  NewsProviderStatus,
  NewsSource,
  NewsResearchSnapshot,
  ResearchCategory,
  ResearchEntity,
  ResearchItem
} from "../types";

const CATEGORY_KEYWORDS: Record<ResearchCategory, string[]> = {
  crypto: [
    "bitcoin",
    "btc",
    "ether",
    "ethereum",
    "eth",
    "solana",
    "sol",
    "crypto",
    "stablecoin",
    "defi",
    "blockchain"
  ],
  geopolitics: [
    "war",
    "sanction",
    "election",
    "china",
    "russia",
    "ukraine",
    "iran",
    "taiwan",
    "nato",
    "tariff"
  ],
  economics: [
    "inflation",
    "jobs",
    "unemployment",
    "gdp",
    "recession",
    "consumer prices",
    "retail sales",
    "treasury"
  ],
  technology: [
    "semiconductor",
    "chip",
    "software",
    "cloud",
    "cybersecurity",
    "data center",
    "quantum"
  ],
  ai: [
    "artificial intelligence",
    " ai ",
    "openai",
    "anthropic",
    "nvidia",
    "machine learning",
    "llm"
  ],
  regulation: [
    "sec",
    "cftc",
    "regulation",
    "regulator",
    "lawsuit",
    "compliance",
    "court",
    "bill"
  ],
  macro: [
    "federal reserve",
    "fed",
    "central bank",
    "interest rate",
    "bond",
    "dollar",
    "oil",
    "gold"
  ]
};

const ENTITY_PATTERNS: Array<[ResearchEntity["type"], RegExp]> = [
  ["asset", /\b(BTC|Bitcoin|ETH|Ethereum|SOL|Solana|USDT|Tether|USDC|BNB|XRP|DOGE|Cardano|ADA)\b/gi],
  ["organization", /\b(OpenAI|Anthropic|Nvidia|Microsoft|Google|Apple|Meta|SEC|CFTC|Federal Reserve|Fed|ECB|Binance|Coinbase|BlackRock)\b/gi],
  ["place", /\b(United States|US|U\.S\.|China|Russia|Ukraine|Iran|Taiwan|Europe|European Union|EU|Japan|United Kingdom|UK)\b/gi],
  ["topic", /\b(inflation|interest rates|stablecoins?|ETFs?|tariffs?|sanctions?|regulation|artificial intelligence|semiconductors?)\b/gi]
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

function storyKey(item: ResearchItem): string {
  const normalizedUrl = canonicalUrl(item.url).toLowerCase();
  if (normalizedUrl.length > 0) return normalizedUrl;
  return normalizeWhitespace(item.title).toLowerCase();
}

function titleKey(item: ResearchItem): string {
  return normalizeWhitespace(item.title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}

export function detectResearchCategory(item: Pick<ResearchItem, "title" | "description">): ResearchCategory {
  const text = ` ${item.title} ${item.description ?? ""} `.toLowerCase();
  let best: { category: ResearchCategory; score: number } = { category: "macro", score: 0 };

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [ResearchCategory, string[]]
  >) {
    const score = keywords.reduce((sum, keyword) => {
      return text.includes(keyword.toLowerCase()) ? sum + 1 : sum;
    }, 0);
    if (score > best.score) best = { category, score };
  }

  return best.category;
}

export function detectResearchEntities(
  item: Pick<ResearchItem, "title" | "description">
): ResearchEntity[] {
  const text = `${item.title} ${item.description ?? ""}`;
  const seen = new Set<string>();
  const entities: ResearchEntity[] = [];

  for (const [type, pattern] of ENTITY_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = normalizeWhitespace(match[0]);
      const key = `${type}:${value.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        entities.push({ type, value });
      }
    }
  }

  return entities;
}

export function normalizeResearchItems(items: ResearchItem[]): ResearchItem[] {
  const byUrl = new Map<string, ResearchItem>();
  const byTitle = new Set<string>();

  const ordered = [...items].sort((a, b) => {
    const left = Date.parse(a.published_at);
    const right = Date.parse(b.published_at);
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });

  for (const item of ordered) {
    if (!item.title || !item.url || Number.isNaN(Date.parse(item.published_at))) continue;

    const urlKey = storyKey(item);
    const dedupeTitleKey = titleKey(item);
    if (byUrl.has(urlKey) || byTitle.has(dedupeTitleKey)) continue;

    const normalized: ResearchItem = {
      ...item,
      title: normalizeWhitespace(item.title),
      url: item.url.trim(),
      category: detectResearchCategory(item),
      description: item.description ? normalizeWhitespace(item.description) : null,
      summary: item.summary ? normalizeWhitespace(item.summary) : null,
      entities: item.entities.length > 0 ? item.entities : detectResearchEntities(item)
    };

    byUrl.set(urlKey, normalized);
    byTitle.add(dedupeTitleKey);
  }

  return [...byUrl.values()];
}

export function buildNewsResearchSnapshot(
  providerItems: ResearchItem[],
  providerStatus: Record<NewsSource, NewsProviderStatus>,
  fetchedAt: string
): NewsResearchSnapshot {
  return {
    items: normalizeResearchItems(providerItems),
    providerStatus,
    fetchedAt,
    source: "news"
  };
}
