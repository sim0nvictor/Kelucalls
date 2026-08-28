/**
 * DeFiLlama market-data provider.
 *
 * Server-only. DeFiLlama's public endpoints require no API key, so this
 * module has no secrets and no env-var reads. It is the ONLY place in the
 * project that should touch the DeFiLlama API.
 *
 * Public surface
 * --------------
 *   getDefiLlamaSnapshot(): Promise<DefiLlamaSnapshot | null>
 *
 * The function is intentionally non-throwing: on any failure (timeout,
 * network error, non-2xx, malformed JSON, schema mismatch) it logs a
 * warning and returns null. The caller (future Daily Research Engine
 * worker) decides how to handle "no data this cycle."
 *
 * Endpoints consumed (all public, no auth):
 *   - https://api.llama.fi/v2/chains
 *       Per-chain current TVL. Returns [{name, tokenSymbol, tvl, ...}, ...].
 *
 *   - https://api.llama.fi/v2/historicalChainTvl
 *       Aggregate daily TVL series across every chain.
 *       Returns [{date: <unix seconds>, tvl: <number>}, ...] (oldest -> newest).
 *       Last entry is "today" (or the most recent daily sample).
 *
 *   - https://stablecoins.llama.fi/stablecoins
 *       All stablecoins with current circulating supply plus prev-day/week/month
 *       snapshots. Returns {peggedAssets: [{symbol, name, circulating, ...}, ...]}.
 *
 * Endpoints explicitly NOT consumed:
 *   - https://api.llama.fi/global                       — returns 404 today
 *   - https://stablecoins.llama.fi/stablecoincharts/all — redundant with the
 *     snapshots already returned by /stablecoins (which carries prev day/week/month)
 *
 * Why no cache here
 * -----------------
 * Caching belongs to the caller (the worker), not the provider. A snapshot
 * is requested at most once per cycle and the worker persists whatever it
 * gets. Keeping the provider stateless makes it trivially replaceable.
 */

import type {
  ChainTvl,
  DefiLlamaSnapshot,
  StablecoinAsset,
  TotalTvl
} from "@/lib/research/types";

const DEFILLAMA_BASE_URL = "https://api.llama.fi";
const STABLECOINS_BASE_URL = "https://stablecoins.llama.fi";

/** Endpoints */
const CHAINS_PATH = "/v2/chains";
const HISTORICAL_CHAIN_TVL_PATH = "/v2/historicalChainTvl";
const STABLECOINS_PATH = "/stablecoins";

const REQUEST_TIMEOUT_MS = 8_000;
const USER_AGENT = "kelucalls-research/1.0";

/**
 * Chains we surface to the engine. The full /v2/chains list has ~300+
 * entries; we keep only the ones that are relevant to a "daily research"
 * view of the market. Match is case-insensitive on the DeFiLlama `name`.
 */
const WANTED_CHAINS = [
  "Ethereum",
  "Solana",
  "BSC",
  "Arbitrum",
  "Base",
  "Optimism",
  "Polygon",
  "Avalanche"
] as const;

/** How many top stablecoins (by circulating supply) we keep. */
const TOP_STABLECOINS = 10;

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
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Fetch a JSON document with an explicit timeout. Used for both DeFiLlama
 * hosts. Never throws. On any failure (timeout, network error, non-2xx,
 * non-JSON, empty body) it logs a warning and returns null.
 */
async function fetchJson(
  baseUrl: string,
  pathname: string,
  query: Record<string, string> = {}
): Promise<unknown> {
  const url = new URL(baseUrl + pathname);
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
        "user-agent": USER_AGENT
      },
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn("[defillama] request failed", {
        pathname,
        status: response.status
      });
      return null;
    }

    const text = await response.text();
    if (text.trim() === "") {
      console.warn("[defillama] empty response body", { pathname });
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.warn("[defillama] response was not valid JSON", {
        pathname,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }

    if (parsed === null || typeof parsed !== "object") {
      console.warn("[defillama] response was not a JSON object or array", {
        pathname
      });
      return null;
    }

    return parsed;
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.name === "AbortError"
          ? "timeout"
          : error.message
        : String(error);

    console.warn("[defillama] request error", { pathname, reason });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse a single row of the /v2/chains response. Returns null when the
 * row does not look like a chain we want, or when its data is unusable.
 */
function parseChainRow(row: unknown, wantedName: string): ChainTvl | null {
  const record = readRecord(row);
  if (!record) return null;

  const name = readString(record.name);
  if (name === null || name.toLowerCase() !== wantedName.toLowerCase()) return null;

  return {
    name,
    tokenSymbol: readString(record.tokenSymbol),
    tvlUsd: readNumber(record.tvl)
  };
}

/**
 * Build the `chainTvl` array from the /v2/chains payload. Order matches
 * WANTED_CHAINS so the output is stable for the engine.
 */
function parseChains(payload: unknown): ChainTvl[] {
  const rows = readArray(payload);
  const result: ChainTvl[] = [];
  for (const wanted of WANTED_CHAINS) {
    const matched = rows
      .map((row) => parseChainRow(row, wanted))
      .find((parsed): parsed is ChainTvl => parsed !== null);
    if (matched) result.push(matched);
  }
  return result;
}

/**
 * Compute a percentage change. Returns null when the divisor is non-finite
 * or zero (avoids division-by-zero and Infinity poisoning the snapshot).
 */
function pctChange(now: number, then: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(then) || then === 0) return null;
  return ((now - then) / then) * 100;
}

/**
 * Build TotalTvl from the /v2/historicalChainTvl series. The series is
 * ordered oldest -> newest, so:
 *   - index -1  = "today"
 *   - index -2  = "yesterday"
 *   - index -8  = 7 days ago
 *   - index -31 = 30 days ago
 */
function parseTotalTvl(payload: unknown): TotalTvl | null {
  const rows = readArray(payload);
  if (rows.length === 0) return null;

  const readPoint = (idx: number): { tvl: number; date: number | null } | null => {
    if (idx < 0) idx = rows.length + idx;
    if (idx < 0 || idx >= rows.length) return null;
    const record = readRecord(rows[idx]);
    if (!record) return null;
    const tvl = readNumber(record.tvl);
    if (tvl === null) return null;
    const date = readNumber(record.date);
    return { tvl, date };
  };

  const today = readPoint(-1);
  if (!today) return null;

  const yesterday = readPoint(-2);
  const weekAgo = readPoint(-8);
  const monthAgo = readPoint(-31);

  return {
    totalUsd: today.tvl,
    change24hPct: yesterday ? pctChange(today.tvl, yesterday.tvl) : null,
    change7dPct: weekAgo ? pctChange(today.tvl, weekAgo.tvl) : null,
    change30dPct: monthAgo ? pctChange(today.tvl, monthAgo.tvl) : null,
    timestamp: today.date === null ? null : new Date(today.date * 1000).toISOString()
  };
}

/**
 * Parse a single row of /stablecoins (the `peggedAssets` array). The
 * circulating values live under a `peggedUSD` key, regardless of the
 * coin's own denomination. Returns null when nothing usable is present.
 */
function parseStablecoinRow(row: unknown): StablecoinAsset | null {
  const record = readRecord(row);
  if (!record) return null;

  const symbol = readString(record.symbol);
  const name = readString(record.name);
  if (symbol === null && name === null) return null;

  const readPegged = (container: unknown): number | null => {
    const c = readRecord(container);
    if (!c) return null;
    return readNumber(c.peggedUSD);
  };

  const circulating = readPegged(record.circulating);
  const prevDay = readPegged(record.circulatingPrevDay);
  const prevWeek = readPegged(record.circulatingPrevWeek);
  const prevMonth = readPegged(record.circulatingPrevMonth);

  return {
    symbol: (symbol ?? "").toUpperCase(),
    name: name ?? "",
    circulatingUsd: circulating,
    change24hPct: prevDay !== null && circulating !== null ? pctChange(circulating, prevDay) : null,
    change7dPct: prevWeek !== null && circulating !== null ? pctChange(circulating, prevWeek) : null,
    change30dPct: prevMonth !== null && circulating !== null ? pctChange(circulating, prevMonth) : null
  };
}

/**
 * Build the `stablecoins` array. We sort by circulating supply descending
 * and keep the top N, so the engine gets the assets that actually matter
 * (USDT, USDC, DAI, ...) without 100+ noise entries.
 */
function parseStablecoins(payload: unknown): StablecoinAsset[] {
  const root = readRecord(payload);
  if (!root) return [];
  const rows = readArray(root.peggedAssets);

  const parsed: StablecoinAsset[] = [];
  for (const row of rows) {
    const coin = parseStablecoinRow(row);
    if (coin && coin.symbol.length > 0) parsed.push(coin);
  }

  parsed.sort((a, b) => {
    const av = a.circulatingUsd ?? -Infinity;
    const bv = b.circulatingUsd ?? -Infinity;
    return bv - av;
  });

  return parsed.slice(0, TOP_STABLECOINS);
}

/**
 * Produce a normalized DeFiLlama snapshot.
 *
 * Fetches the three endpoints in parallel. Any single endpoint failure
 * degrades to a null/empty contribution rather than failing the whole
 * snapshot. If EVERY endpoint fails, returns null.
 */
export async function getDefiLlamaSnapshot(): Promise<DefiLlamaSnapshot | null> {
  const [chainsPayload, historicalPayload, stablecoinsPayload] = await Promise.all([
    fetchJson(DEFILLAMA_BASE_URL, CHAINS_PATH),
    fetchJson(DEFILLAMA_BASE_URL, HISTORICAL_CHAIN_TVL_PATH),
    fetchJson(STABLECOINS_BASE_URL, STABLECOINS_PATH)
  ]);

  const totalTvl = historicalPayload ? parseTotalTvl(historicalPayload) : null;
  const chainTvl = chainsPayload ? parseChains(chainsPayload) : [];
  const stablecoins = stablecoinsPayload ? parseStablecoins(stablecoinsPayload) : [];

  if (totalTvl === null && chainTvl.length === 0 && stablecoins.length === 0) {
    console.warn("[defillama] all endpoints failed; returning null snapshot");
    return null;
  }

  return {
    totalTvl,
    chainTvl,
    stablecoins,
    fetchedAt: new Date().toISOString(),
    source: "defillama"
  };
}
