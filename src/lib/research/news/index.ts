import { coindeskProvider } from "./coindesk";
import { cointelegraphProvider } from "./cointelegraph";
import { gdeltProvider } from "./gdelt";
import { newsApiProvider } from "./newsapi";
import { techCrunchAiProvider } from "./techcrunch-ai";
import { buildNewsResearchSnapshot } from "./normalizer";
import type { NewsProvider } from "./providers";
import type {
  NewsProviderStatus,
  NewsResearchSnapshot,
  NewsSource,
  ResearchItem
} from "../types";

const PROVIDERS: NewsProvider[] = [
  newsApiProvider,
  gdeltProvider,
  coindeskProvider,
  cointelegraphProvider,
  techCrunchAiProvider
];

const PROVIDER_RETRIES = 3;
const PROVIDER_RETRY_DELAY_MS = 500;

function emptyStatus(source: NewsSource, fetchedAt: string, error: string | null): NewsProviderStatus {
  return {
    ok: error === null,
    source,
    fetchedAt,
    itemCount: 0,
    error
  };
}

async function fetchProvider(provider: NewsProvider): Promise<{
  items: ResearchItem[];
  status: NewsProviderStatus;
}> {
  const fetchedAt = new Date().toISOString();

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= PROVIDER_RETRIES; attempt += 1) {
    try {
      const items = await provider.fetchItems();
      return {
        items,
        status: {
          ...emptyStatus(provider.source, fetchedAt, null),
          itemCount: items.length
        }
      };
    } catch (error) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isLastAttempt = attempt === PROVIDER_RETRIES;
      console.warn("[research-news] provider failed", { 
        provider: provider.source, 
        attempt,
        ...(isLastAttempt && { reason: errorMsg })
      });
      if (attempt < PROVIDER_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, PROVIDER_RETRY_DELAY_MS * attempt));
      }
    };
  }

  return {
    items: [],
    status: emptyStatus(
      provider.source,
      fetchedAt,
      lastError instanceof Error ? lastError.message : String(lastError)
    )
  };
}

export async function collectNewsResearchSnapshot(): Promise<NewsResearchSnapshot> {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.all(PROVIDERS.map((provider) => fetchProvider(provider)));

  // Every provider in PROVIDERS is represented in `results` (success or
  // failure), so this Record is fully populated even when some providers
  // failed. We then hand it to the normalizer as a full record; the
  // returned NewsResearchSnapshot already types providerStatus as Partial,
  // so downstream consumers tolerate missing keys.
  const providerStatus = results.reduce(
    (acc, result) => {
      acc[result.status.source] = result.status;
      return acc;
    },
    {} as Record<NewsSource, NewsProviderStatus>
  );

  const items = results.flatMap((result) => result.items);
  return buildNewsResearchSnapshot(items, providerStatus, fetchedAt);
}
