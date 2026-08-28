/**
 * CoinGecko market-data provider.
 *
 * Server-only. The API key is read from `COINGECKO_API_KEY` and is NEVER
 * shipped to the browser. This module is the ONLY place in the project that
 * should touch the CoinGecko API.
 *
 * Public surface
 * --------------
 *   getResearchMarketSnapshot(): Promise<ResearchMarketSnapshot | null>
 *
 * The function is intentionally non-throwing: on any failure (missing key,
 * timeout, non-2xx, malformed JSON, schema mismatch) it returns null and
 * logs a warning with NO secrets. The caller (future Daily Research Engine
 * worker) decides how to handle "no data this cycle."
 *
 * Why no cache here
 * -----------------
 * Caching belongs to the caller (the worker), not the provider. A snapshot
 * is requested at most once per cycle and the worker persists whatever it
 * gets. Keeping the provider stateless makes it trivially replaceable.
 */

import type {
  CoinSnapshot,
  GlobalMarketSnapshot,
  ResearchMarketSnapshot
} from "@/lib/research/types";

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

/**
 * Coin ids used by CoinGecko's REST API. Stable identifiers; safe to hardcode.
 * Listed in a single record so the symbols we expose are read from one place.
 */
const COINGECKO_COIN_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana"
} as const;

/** Symbols whose data we always want, in a stable order. */
const WANTED_SYMBOLS = ["BTC", "ETH", "SOL"] as const;
type WantedSymbol = (typeof WANTED_SYMBOLS)[number];

const REQUEST_TIMEOUT_MS = 8_000;
const USER_AGENT = "kelucalls-research/1.0";

/** Path the CoinGecko "coins/markets" endpoint expects. */
const MARKETS_PATH = "/coins/markets";
/** Path the CoinGecko "global" endpoint expects. */
const GLOBAL_PATH = "/global";

/**
 * Read the API key from process.env at call time. The key is never logged,
 * never returned, never cached at module scope.
 *
 * Returns null when the env var is absent so callers can degrade gracefully
 * (the future worker will treat null as "skip this cycle" rather than throw).
 */
function getApiKey(): string | null {
  const value = process.env.COINGECKO_API_KEY;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Fetch a JSON document from CoinGecko with an explicit timeout.
 *
 * Never throws. On any failure (timeout, network error, non-2xx, non-JSON,
 * empty body) it logs a warning with NO secrets and returns null.
 *
 * The returned shape is whatever the endpoint produces — a JSON object OR a
 * JSON array — because CoinGecko's `/coins/markets` returns an array while
 * `/global` returns an object. Callers narrow the value with `readRecord` /
 * `readArray` and decide what to do.
 */
async function fetchJson(
  pathname: string,
  query: Record<string, string>,
  apiKey: string
): Promise<unknown> {
  const url = new URL(COINGECKO_BASE_URL + pathname);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        // Demo keys must send the header; paid keys can use either header or
        // the `x_cg_pro_api_key` query param. Sending the header works for
        // both.
        "x-cg-demo-api-key": apiKey,
        "user-agent": USER_AGENT
      },
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn("[coingecko] request failed", {
        pathname,
        status: response.status
      });
      return null;
    }

    const text = await response.text();
    if (text.trim() === "") {
      console.warn("[coingecko] empty response body", { pathname });
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.warn("[coingecko] response was not valid JSON", {
        pathname,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }

    // Reject only the obviously broken shapes (string, number, boolean, null).
    // Arrays and objects are both valid CoinGecko response shapes depending
    // on the endpoint.
    if (parsed === null || typeof parsed !== "object") {
      console.warn("[coingecko] response was not a JSON object or array", {
        pathname
      });
      return null;
    }

    return parsed;
  } catch (error) {
    // AbortError on timeout, network errors, etc. Same handling: warn + null.
    const reason =
      error instanceof Error
        ? error.name === "AbortError"
          ? "timeout"
          : error.message
        : String(error);

    console.warn("[coingecko] request error", { pathname, reason });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse one row of the /coins/markets response into a CoinSnapshot.
 * Returns null when the row does not look like a coin we want.
 */
function parseMarketRow(row: unknown, wantedId: string): CoinSnapshot | null {
  const record = readRecord(row);
  if (!record) return null;

  const id = readString(record.id);
  if (id !== wantedId) return null;

  const symbol = readString(record.symbol);
  if (symbol === null) return null;

  return {
    symbol: symbol.toUpperCase(),
    coinId: id,
    priceUsd: readNumber(record.current_price),
    change24hPct: readNumber(
      // CoinGecko returns a fraction (0.025 = +2.5%). Convert to percent so
      // every provider exposes the same unit.
      typeof record.price_change_percentage_24h === "number"
        ? record.price_change_percentage_24h
        : readNumber(record.price_change_percentage_24h)
    ),
    marketCapUsd: readNumber(record.market_cap)
  };
}

/**
 * Fetch and parse the /coins/markets response into a symbol->snapshot map.
 * Returns an empty object on failure (callers treat missing keys as null).
 */
async function fetchCoinSnapshots(
  apiKey: string
): Promise<Record<WantedSymbol, CoinSnapshot | null>> {
  const ids = WANTED_SYMBOLS.map((symbol) => COINGECKO_COIN_IDS[symbol]).join(",");

  const payload = await fetchJson(
    MARKETS_PATH,
    {
      vs_currency: "usd",
      ids,
      order: "market_cap_desc",
      per_page: String(WANTED_SYMBOLS.length),
      page: "1",
      sparkline: "false",
      price_change_percentage: "24h"
    },
    apiKey
  );

  const result: Record<WantedSymbol, CoinSnapshot | null> = {
    BTC: null,
    ETH: null,
    SOL: null
  };

  if (!payload) return result;

  const rows = readArray(payload);
  if (rows.length === 0) {
    console.warn("[coingecko] /coins/markets returned an empty array");
    return result;
  }

  for (const symbol of WANTED_SYMBOLS) {
    const wantedId = COINGECKO_COIN_IDS[symbol];
    const matched = rows
      .map((row) => parseMarketRow(row, wantedId))
      .find((parsed): parsed is CoinSnapshot => parsed !== null);

    result[symbol] = matched ?? null;
  }

  return result;
}

/**
 * Parse the /global response. CoinGecko wraps the actual metrics under a
 * `data` key with named nested objects; we pick out only what we expose.
 */
function parseGlobal(payload: unknown): GlobalMarketSnapshot | null {
  const root = readRecord(payload);
  if (!root) return null;
  const data = readRecord(root.data);
  if (!data) return null;

  const totalMarketCap = readRecord(data.total_market_cap);
  const totalVolume = readRecord(data.total_volume);
  const marketCapPercentage = readRecord(data.market_cap_percentage);

  const usdMarketCap = totalMarketCap ? readNumber(totalMarketCap.usd) : null;
  const usdVolume = totalVolume ? readNumber(totalVolume.usd) : null;
  const btcDominance = marketCapPercentage ? readNumber(marketCapPercentage.btc) : null;

  // If nothing useful came back, treat the response as malformed.
  if (usdMarketCap === null && usdVolume === null && btcDominance === null) {
    return null;
  }

  return {
    totalMarketCapUsd: usdMarketCap,
    totalVolume24hUsd: usdVolume,
    btcDominancePct: btcDominance
  };
}

/**
 * Produce a normalized research market snapshot from CoinGecko.
 *
 * - Returns null when COINGECKO_API_KEY is unset or invalid.
 * - Returns null when BOTH /coins/markets and /global failed: a snapshot
 *   with zero data is worse than no snapshot.
 * - Otherwise returns a snapshot with whichever fields could be fetched; the
 *   worker decides whether partial data is good enough to persist.
 */
export async function getResearchMarketSnapshot(): Promise<ResearchMarketSnapshot | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[coingecko] COINGECKO_API_KEY is not set; skipping snapshot");
    return null;
  }

  const [coinsPayload, globalPayload] = await Promise.all([
    fetchCoinSnapshots(apiKey),
    fetchJson(GLOBAL_PATH, {}, apiKey)
  ]);

  const btc: CoinSnapshot | null = coinsPayload.BTC ?? null;
  const eth: CoinSnapshot | null = coinsPayload.ETH ?? null;
  const sol: CoinSnapshot | null = coinsPayload.SOL ?? null;
  const global: GlobalMarketSnapshot | null = globalPayload ? parseGlobal(globalPayload) : null;

  const anyCoin = btc !== null || eth !== null || sol !== null;

  if (!anyCoin && global === null) {
    console.warn("[coingecko] both endpoints failed; returning null snapshot");
    return null;
  }

  return {
    btc,
    eth,
    sol,
    global,
    fetchedAt: new Date().toISOString(),
    source: "coingecko"
  };
}
