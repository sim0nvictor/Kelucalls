/**
 * Token OHLCV (price history) data access.
 *
 * This module is the single source of truth for token price history.
 * It is provider-agnostic: the chart component only ever talks to our own
 * `/api/tokens/ohlcv` route, and that route only ever talks to the provider
 * selected here. Swapping GeckoTerminal for DexScreener / Birdeye / Moralis /
 * CoinMarketCap / our own OHLCV table only requires implementing another
 * `OhlcvProvider` and changing `activeProvider` below.
 *
 * No API key, no database migration, no workers, no cron jobs.
 */

// ---------------------------------------------------------------------------
// Public contract (shared with the API route and the chart)
// ---------------------------------------------------------------------------

export const OHLCV_TIMEFRAMES = ["1H", "24H", "7D", "30D"] as const;

export type OhlcvTimeframe = (typeof OHLCV_TIMEFRAMES)[number];

export const DEFAULT_OHLCV_TIMEFRAME: OhlcvTimeframe = "24H";

/** A single normalized candle. `time` is a unix timestamp in seconds (UTC). */
export type OhlcvCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type OhlcvFailureReason =
  | "unsupported_chain"
  | "invalid_address"
  | "invalid_timeframe"
  | "no_pools"
  | "no_data"
  | "rate_limited"
  | "upstream_error";

export type OhlcvRequest = {
  chain: string;
  contractAddress: string;
  timeframe: OhlcvTimeframe;
};

export type OhlcvSuccess = {
  ok: true;
  source: string;
  network: string;
  poolAddress: string | null;
  timeframe: OhlcvTimeframe;
  candles: OhlcvCandle[];
};

export type OhlcvFailure = {
  ok: false;
  reason: OhlcvFailureReason;
  /** Safe, user-facing message. Never contains upstream error payloads. */
  message: string;
};

export type OhlcvResult = OhlcvSuccess | OhlcvFailure;

/** Implement this to plug in a different data source later. */
export interface OhlcvProvider {
  readonly id: string;
  supportsChain(chain: string): boolean;
  fetchCandles(request: OhlcvRequest): Promise<OhlcvResult>;
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function normalizeChain(chain: string): string {
  return chain.trim().toLowerCase().replace(/\s+/g, "-");
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseTimeframe(value: string | null | undefined): OhlcvTimeframe | null {
  if (!value) return DEFAULT_OHLCV_TIMEFRAME;
  const upper = value.trim().toUpperCase();
  return (OHLCV_TIMEFRAMES as readonly string[]).includes(upper)
    ? (upper as OhlcvTimeframe)
    : null;
}

function failure(reason: OhlcvFailureReason, message: string): OhlcvFailure {
  return { ok: false, reason, message };
}

// ---------------------------------------------------------------------------
// GeckoTerminal provider
// ---------------------------------------------------------------------------

const GECKO_TERMINAL_BASE_URL = "https://api.geckoterminal.com/api/v2";
const GECKO_TERMINAL_TIMEOUT_MS = 8_000;

/**
 * Our chain names -> GeckoTerminal network ids.
 * Aliases are included so scraped/bot-inserted rows still resolve.
 */
const GECKO_TERMINAL_NETWORKS: Record<string, string> = {
  solana: "solana",
  sol: "solana",
  ethereum: "eth",
  eth: "eth",
  mainnet: "eth",
  bsc: "bsc",
  bnb: "bsc",
  "bnb-chain": "bsc",
  binance: "bsc",
  "binance-smart-chain": "bsc",
  base: "base",
  arbitrum: "arbitrum",
  "arbitrum-one": "arbitrum",
  arb: "arbitrum",
  polygon: "polygon_pos",
  "polygon-pos": "polygon_pos",
  polygon_pos: "polygon_pos",
  matic: "polygon_pos",
  // GeckoTerminal's network id for Avalanche C-Chain is "avax".
  avalanche: "avax",
  "avalanche-c": "avax",
  avax: "avax",
};

/** Candle granularity + window per timeframe, plus the ISR window for it. */
const TIMEFRAME_CONFIG: Record<
  OhlcvTimeframe,
  { unit: "minute" | "hour" | "day"; aggregate: number; limit: number; revalidate: number }
> = {
  "1H": { unit: "minute", aggregate: 1, limit: 60, revalidate: 60 },
  "24H": { unit: "minute", aggregate: 15, limit: 96, revalidate: 60 },
  "7D": { unit: "hour", aggregate: 1, limit: 168, revalidate: 300 },
  "30D": { unit: "hour", aggregate: 4, limit: 180, revalidate: 900 },
};

type GeckoPoolRow = {
  attributes?: {
    address?: unknown;
    reserve_in_usd?: unknown;
  };
};

type GeckoPoolsResponse = { data?: GeckoPoolRow[] };

type GeckoOhlcvResponse = {
  data?: { attributes?: { ohlcv_list?: unknown } };
};

class UpstreamError extends Error {
  constructor(readonly reason: OhlcvFailureReason, message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

async function geckoFetch<T>(path: string, revalidate: number): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${GECKO_TERMINAL_BASE_URL}${path}`, {
      headers: { Accept: "application/json;version=20230302" },
      signal: AbortSignal.timeout(GECKO_TERMINAL_TIMEOUT_MS),
      // Next.js fetch cache — this is what keeps us off rate limits.
      next: { revalidate },
    });
  } catch {
    throw new UpstreamError("upstream_error", "Price data provider is unreachable.");
  }

  if (response.status === 429) {
    throw new UpstreamError("rate_limited", "Price data is temporarily rate limited.");
  }

  if (response.status === 404) {
    throw new UpstreamError("no_data", "No price data found for this token.");
  }

  if (!response.ok) {
    // Deliberately do not surface the provider body.
    throw new UpstreamError("upstream_error", "Price data provider returned an error.");
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new UpstreamError("upstream_error", "Price data provider returned an invalid response.");
  }
}

/** Returns the address of the token's deepest (most liquid) pool. */
async function findMostLiquidPool(
  network: string,
  contractAddress: string,
  revalidate: number
): Promise<string> {
  const payload = await geckoFetch<GeckoPoolsResponse>(
    `/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(contractAddress)}/pools?page=1`,
    // Pool composition changes slowly; cache it longer than the candles.
    Math.max(revalidate, 300)
  );

  const best = (payload.data ?? []).reduce<{ address: string; reserve: number } | null>(
    (winner, row) => {
      const address = row.attributes?.address;
      if (typeof address !== "string" || address.length === 0) return winner;

      const reserve = toFiniteNumber(row.attributes?.reserve_in_usd) ?? 0;
      if (!winner || reserve > winner.reserve) return { address, reserve };
      return winner;
    },
    null
  );

  if (!best) {
    throw new UpstreamError("no_pools", "No liquidity pools found for this token.");
  }

  return best.address;
}

/** GeckoTerminal returns `[timestamp, open, high, low, close, volume]` tuples. */
function normalizeOhlcvList(raw: unknown): OhlcvCandle[] {
  if (!Array.isArray(raw)) return [];

  const candles: OhlcvCandle[] = [];

  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 6) continue;

    const time = toFiniteNumber(entry[0]);
    const open = toFiniteNumber(entry[1]);
    const high = toFiniteNumber(entry[2]);
    const low = toFiniteNumber(entry[3]);
    const close = toFiniteNumber(entry[4]);
    const volume = toFiniteNumber(entry[5]);

    if (time === null || open === null || high === null || low === null || close === null) {
      continue;
    }

    candles.push({ time, open, high, low, close, volume: volume ?? 0 });
  }

  // Provider returns newest-first; charts want oldest-first.
  return candles.sort((a, b) => a.time - b.time);
}

export const geckoTerminalProvider: OhlcvProvider = {
  id: "geckoterminal",

  supportsChain(chain: string) {
    return Boolean(GECKO_TERMINAL_NETWORKS[normalizeChain(chain)]);
  },

  async fetchCandles({ chain, contractAddress, timeframe }: OhlcvRequest): Promise<OhlcvResult> {
    const network = GECKO_TERMINAL_NETWORKS[normalizeChain(chain)];

    if (!network) {
      return failure("unsupported_chain", "This chain is not yet supported.");
    }

    const address = contractAddress.trim();
    if (!address) {
      return failure("invalid_address", "A token contract address is required.");
    }

    const config = TIMEFRAME_CONFIG[timeframe];

    try {
      const poolAddress = await findMostLiquidPool(network, address, config.revalidate);

      const payload = await geckoFetch<GeckoOhlcvResponse>(
        `/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(poolAddress)}` +
          `/ohlcv/${config.unit}?aggregate=${config.aggregate}&limit=${config.limit}&currency=usd`,
        config.revalidate
      );

      const candles = normalizeOhlcvList(payload.data?.attributes?.ohlcv_list);

      if (candles.length === 0) {
        return failure("no_data", "No historical data available.");
      }

      return {
        ok: true,
        source: geckoTerminalProvider.id,
        network,
        poolAddress,
        timeframe,
        candles,
      };
    } catch (error) {
      if (error instanceof UpstreamError) {
        return failure(error.reason, error.message);
      }
      return failure("upstream_error", "Unable to load price history right now.");
    }
  },
};

// ---------------------------------------------------------------------------
// Active provider
// ---------------------------------------------------------------------------

const activeProvider: OhlcvProvider = geckoTerminalProvider;

export function isSupportedChain(chain: string): boolean {
  return activeProvider.supportsChain(chain);
}

/**
 * Fetch normalized OHLCV candles for a token.
 * Never throws — always resolves to an `OhlcvResult`.
 */
export async function getTokenOhlcv(request: OhlcvRequest): Promise<OhlcvResult> {
  return activeProvider.fetchCandles(request);
}
