/**
 * Live token market data (DexScreener).
 *
 * Shared by the /tokens market table, the token detail page and the
 * /api/tokens/live polling endpoint used by the browser.
 *
 * Snapshots are memoised in-process for a few seconds so that many concurrent
 * visitors polling at the same time do not each hit DexScreener.
 */

const DEX_TOKENS_ENDPOINT = "https://api.dexscreener.com/latest/dex/tokens/";

/** DexScreener accepts up to 30 comma separated addresses per request. */
export const DEX_BATCH_SIZE = 30;

/** Hard cap on how many addresses one request may ask for. */
export const MAX_LIVE_ADDRESSES = 150;

/** How long a snapshot is reused before we refetch it. */
const SNAPSHOT_TTL_MS = 15_000;

const REQUEST_TIMEOUT_MS = 8_000;

export type TokenMarketSnapshot = {
  /** Address as reported by DexScreener (original casing). */
  address: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  change5m: number | null;
  change1h: number | null;
  change6h: number | null;
  change24h: number | null;
  chainId: string | null;
  dexId: string | null;
  pairUrl: string | null;
  logoUrl: string | null;
  fetchedAt: string;
};

/** Keyed by lowercased contract address. */
export type TokenMarketSnapshotMap = Record<string, TokenMarketSnapshot>;

type CacheEntry = { snapshot: TokenMarketSnapshot; expiresAt: number };

const snapshotCache = new Map<string, CacheEntry>();

/** Map key helper. Addresses stay case-sensitive on Solana, so only keys are lowercased. */
export function snapshotKey(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function pairBaseAddress(pair: Record<string, unknown>) {
  const base = readRecord(pair.baseToken);
  return readString(base?.address) ?? "";
}

function pairLiquidityUsd(pair: Record<string, unknown>) {
  const liquidity = readRecord(pair.liquidity);
  return toFiniteNumber(liquidity?.usd) ?? 0;
}

function toSnapshot(
  pair: Record<string, unknown>,
  fetchedAt: string
): TokenMarketSnapshot {
  const priceChange = readRecord(pair.priceChange);
  const volume = readRecord(pair.volume);
  const liquidity = readRecord(pair.liquidity);
  const info = readRecord(pair.info);

  return {
    address: pairBaseAddress(pair),
    priceUsd: toFiniteNumber(pair.priceUsd),
    // Brand new pairs often report fdv but not marketCap.
    marketCapUsd: toFiniteNumber(pair.marketCap) ?? toFiniteNumber(pair.fdv),
    fdvUsd: toFiniteNumber(pair.fdv),
    liquidityUsd: toFiniteNumber(liquidity?.usd),
    volume24hUsd: toFiniteNumber(volume?.h24),
    change5m: toFiniteNumber(priceChange?.m5),
    change1h: toFiniteNumber(priceChange?.h1),
    change6h: toFiniteNumber(priceChange?.h6),
    change24h: toFiniteNumber(priceChange?.h24),
    chainId: readString(pair.chainId),
    dexId: readString(pair.dexId),
    pairUrl: readString(pair.url),
    logoUrl: readString(info?.imageUrl),
    fetchedAt,
  };
}

async function fetchBatch(addresses: string[]): Promise<TokenMarketSnapshotMap> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const requestUrl = DEX_TOKENS_ENDPOINT + addresses.map(encodeURIComponent).join(",");
    const response = await fetch(requestUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[token-market] DexScreener responded with an error status", {
        status: response.status,
        count: addresses.length,
      });
      return {};
    }

    const payload = readRecord(await response.json());
    const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
    const fetchedAt = new Date().toISOString();
    const wanted = new Set(addresses.map((address) => address.toLowerCase()));

    // A token can trade in many pairs. Keep the deepest liquidity pair, which
    // is the one DexScreener itself treats as the primary market.
    const best = new Map<string, Record<string, unknown>>();

    for (const entry of pairs) {
      const pair = readRecord(entry);
      if (!pair) continue;

      const key = pairBaseAddress(pair).toLowerCase();
      if (!key || !wanted.has(key)) continue;

      const existing = best.get(key);
      if (!existing || pairLiquidityUsd(pair) > pairLiquidityUsd(existing)) {
        best.set(key, pair);
      }
    }

    const snapshots: TokenMarketSnapshotMap = {};
    for (const [key, pair] of Array.from(best.entries())) {
      snapshots[key] = toSnapshot(pair, fetchedAt);
    }

    return snapshots;
  } catch (error) {
    console.warn("[token-market] DexScreener batch failed", {
      count: addresses.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

function pruneCache(now: number) {
  if (snapshotCache.size <= 2_000) return;
  for (const [key, entry] of Array.from(snapshotCache.entries())) {
    if (entry.expiresAt < now) snapshotCache.delete(key);
  }
}

/**
 * Fetch live price / market cap snapshots for the given contract addresses.
 *
 * Never throws: on failure it returns whatever is known (possibly stale cache
 * entries, possibly nothing) so callers can always fall back to stored values.
 */
export async function getTokenMarketSnapshots(
  rawAddresses: Array<string | null | undefined>,
  options: { force?: boolean } = {}
): Promise<TokenMarketSnapshotMap> {
  const now = Date.now();

  // Dedupe case-insensitively but keep the original casing for the request:
  // Solana addresses are case-sensitive base58.
  const requestAddresses: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawAddresses) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed === "") continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    requestAddresses.push(trimmed);
    if (requestAddresses.length >= MAX_LIVE_ADDRESSES) break;
  }

  const snapshots: TokenMarketSnapshotMap = {};
  const missing: string[] = [];

  for (const address of requestAddresses) {
    const key = address.toLowerCase();
    const cached = snapshotCache.get(key);

    if (!options.force && cached && cached.expiresAt > now) {
      snapshots[key] = cached.snapshot;
    } else {
      missing.push(address);
    }
  }

  if (missing.length > 0) {
    const batches = await Promise.all(
      chunk(missing, DEX_BATCH_SIZE).map((batch) => fetchBatch(batch))
    );

    const expiresAt = Date.now() + SNAPSHOT_TTL_MS;

    for (const batch of batches) {
      for (const [key, snapshot] of Object.entries(batch)) {
        snapshots[key] = snapshot;
        snapshotCache.set(key, { snapshot, expiresAt });
      }
    }

    // If a refetch failed, serve the last known snapshot rather than nothing.
    for (const address of missing) {
      const key = address.toLowerCase();
      if (snapshots[key]) continue;

      const cached = snapshotCache.get(key);
      if (cached) snapshots[key] = cached.snapshot;
    }

    pruneCache(Date.now());
  }

  return snapshots;
}
