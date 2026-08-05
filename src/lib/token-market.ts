/**
 * Live token market data (DexScreener).
 *
 * Shared by the /tokens market table, the token detail page, the trending and
 * live feed surfaces, and the /api/tokens/live polling endpoint.
 *
 * Snapshots are memoised in-process for a few seconds so that many concurrent
 * visitors polling at the same time do not each hit DexScreener.
 */

const DEX_TOKENS_ENDPOINT = "https://api.dexscreener.com/latest/dex/tokens/";
const DEX_SEARCH_ENDPOINT = "https://api.dexscreener.com/latest/dex/search?q=";

/** DexScreener accepts up to 30 comma separated addresses per request. */
export const DEX_BATCH_SIZE = 30;

/** Hard cap on how many addresses one request may ask for. */
export const MAX_LIVE_ADDRESSES = 150;

/**
 * Symbol search costs one request per token, so it is only ever used as a
 * fallback for tokens we could not resolve by address, and it is capped.
 */
export const MAX_SYMBOL_LOOKUPS = 25;

const SYMBOL_LOOKUP_CONCURRENCY = 5;

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

/** Keyed by lowercased contract address, plus "symbol:<lowercased symbol>". */
export type TokenMarketSnapshotMap = Record<string, TokenMarketSnapshot>;

/**
 * A token to price. Tokens with a missing or wrong contract address still get
 * a price via their ticker symbol.
 */
export type TokenMarketQuery = {
  address?: string | null;
  symbol?: string | null;
};

type CacheEntry = { snapshot: TokenMarketSnapshot; expiresAt: number };

const snapshotCache = new Map<string, CacheEntry>();

/** Map key helper. Addresses stay case-sensitive on Solana, so only keys are lowercased. */
export function snapshotKey(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Map key helper for symbol-resolved snapshots. */
export function symbolKey(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim().toLowerCase() : "";
  return trimmed === "" ? "" : "symbol:" + trimmed;
}

/**
 * Looks up a snapshot for a token that may or may not have a usable address.
 * Use this everywhere on the client instead of indexing the map directly.
 */
export function findSnapshot(
  snapshots: TokenMarketSnapshotMap,
  address: string | null | undefined,
  symbol?: string | null
): TokenMarketSnapshot | null {
  const byAddress = snapshots[snapshotKey(address)];
  if (byAddress) return byAddress;

  const bySymbol = snapshots[symbolKey(symbol)];
  return bySymbol ?? null;
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

function pairBaseSymbol(pair: Record<string, unknown>) {
  const base = readRecord(pair.baseToken);
  return readString(base?.symbol) ?? "";
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

async function fetchJson(requestUrl: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[token-market] DexScreener responded with an error status", {
        status: response.status,
      });
      return null;
    }

    return readRecord(await response.json());
  } catch (error) {
    console.warn("[token-market] DexScreener request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBatch(addresses: string[]): Promise<TokenMarketSnapshotMap> {
  const requestUrl = DEX_TOKENS_ENDPOINT + addresses.map(encodeURIComponent).join(",");
  const payload = await fetchJson(requestUrl);
  if (!payload) return {};

  const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
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
}

/**
 * Resolve a token by ticker symbol.
 *
 * This is the fallback for tokens whose contract address is missing or does
 * not match anything on DexScreener. We only accept pairs whose base token
 * symbol matches exactly, then keep the deepest liquidity match so we do not
 * price a copycat token.
 */
async function fetchBySymbol(symbol: string): Promise<TokenMarketSnapshot | null> {
  const requestUrl = DEX_SEARCH_ENDPOINT + encodeURIComponent(symbol);
  const payload = await fetchJson(requestUrl);
  if (!payload) return null;

  const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
  const wanted = symbol.trim().toLowerCase();

  let best: Record<string, unknown> | null = null;

  for (const entry of pairs) {
    const pair = readRecord(entry);
    if (!pair) continue;
    if (pairBaseSymbol(pair).trim().toLowerCase() !== wanted) continue;

    if (!best || pairLiquidityUsd(pair) > pairLiquidityUsd(best)) {
      best = pair;
    }
  }

  return best ? toSnapshot(best, new Date().toISOString()) : null;
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

/**
 * Fetch snapshots for tokens, falling back to a ticker symbol search for any
 * token that could not be resolved by contract address.
 *
 * Results are keyed by lowercased address and, for symbol-resolved tokens,
 * also by "symbol:<lowercased symbol>". Use findSnapshot() to read them.
 */
export async function getTokenMarketSnapshotsForTokens(
  queries: TokenMarketQuery[],
  options: { force?: boolean } = {}
): Promise<TokenMarketSnapshotMap> {
  const addresses: string[] = [];
  const seenAddress = new Set<string>();

  /** Lowercased address -> symbol, so we can retry failures by symbol. */
  const symbolForAddress = new Map<string, string>();

  const symbolOnly: string[] = [];
  const seenSymbol = new Set<string>();

  for (const query of queries) {
    const address = typeof query?.address === "string" ? query.address.trim() : "";
    const symbol = typeof query?.symbol === "string" ? query.symbol.trim() : "";

    if (address !== "") {
      const key = address.toLowerCase();
      if (!seenAddress.has(key)) {
        seenAddress.add(key);
        addresses.push(address);
      }
      if (symbol !== "" && !symbolForAddress.has(key)) {
        symbolForAddress.set(key, symbol);
      }
      continue;
    }

    if (symbol !== "") {
      const key = symbolKey(symbol);
      if (!seenSymbol.has(key)) {
        seenSymbol.add(key);
        symbolOnly.push(symbol);
      }
    }
  }

  const snapshots =
    addresses.length > 0 ? await getTokenMarketSnapshots(addresses, options) : {};

  // Everything still unpriced gets one symbol search.
  const pending: string[] = [];
  const pendingSeen = new Set<string>();

  const queueSymbol = (symbol: string) => {
    const key = symbolKey(symbol);
    if (key === "" || pendingSeen.has(key)) return;
    if (snapshots[key]) return;

    pendingSeen.add(key);
    pending.push(symbol);
  };

  for (const symbol of symbolOnly) queueSymbol(symbol);

  for (const [addressKey, symbol] of Array.from(symbolForAddress.entries())) {
    if (snapshots[addressKey]) continue;
    queueSymbol(symbol);
  }

  if (pending.length === 0) return snapshots;

  const now = Date.now();
  const toFetch: string[] = [];

  for (const symbol of pending) {
    const key = symbolKey(symbol);
    const cached = snapshotCache.get(key);

    if (!options.force && cached && cached.expiresAt > now) {
      snapshots[key] = cached.snapshot;
      continue;
    }

    toFetch.push(symbol);
    if (toFetch.length >= MAX_SYMBOL_LOOKUPS) break;
  }

  for (const group of chunk(toFetch, SYMBOL_LOOKUP_CONCURRENCY)) {
    const results = await Promise.all(
      group.map(async (symbol) => ({ symbol, snapshot: await fetchBySymbol(symbol) }))
    );

    const expiresAt = Date.now() + SNAPSHOT_TTL_MS;

    for (const { symbol, snapshot } of results) {
      const key = symbolKey(symbol);

      if (!snapshot) {
        // Serve a stale hit rather than nothing.
        const cached = snapshotCache.get(key);
        if (cached) snapshots[key] = cached.snapshot;
        continue;
      }

      snapshots[key] = snapshot;
      snapshotCache.set(key, { snapshot, expiresAt });

      // Also expose it under the address DexScreener reported.
      const addressKey = snapshot.address.toLowerCase();
      if (addressKey !== "" && !snapshots[addressKey]) {
        snapshots[addressKey] = snapshot;
      }
    }
  }

  pruneCache(Date.now());

  return snapshots;
}
