import { unstable_noStore as noStore } from "next/cache";

import { withSupabase } from "@/lib/supabase";
import { WELL_KNOWN_TOKEN_LOGOS } from "@/lib/well-known-token-logos";

/**
 * A tracked token plus its call analytics and the last price / market cap the
 * price worker stored. Live values are layered on top of this in the browser.
 */
export type TokenMarketRow = {
  id: string;
  symbol: string;
  name: string | null;
  chain: string;
  contractAddress: string | null;
  logoUrl: string | null;
  totalCalls: number;
  uniqueChannels: number;
  averageRoiPct: number;
  bestMultiple: number;
  lastCalledAt: string | null;
  lastPriceUsd: number | null;
  lastMarketCapUsd: number | null;
  lastSeenAt: string | null;
};

function numberOrZero(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
}

type StoredTokenPrice = {
  contractAddress: string | null;
  lastPriceUsd: number | null;
  lastMarketCapUsd: number | null;
  lastSeenAt: string | null;
};

/**
 * Every tracked token with its call analytics, ordered by call volume.
 * Stored prices come from the tokens table (kept fresh by the price worker).
 */
export async function getTokenMarketRows(limit = 200): Promise<TokenMarketRow[]> {
  noStore();

  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("trending_tokens")
      .select("*")
      .order("total_calls", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const rows = data ?? [];
    const ids = rows.map((row) => String(row.id));
    const stored = new Map<string, StoredTokenPrice>();

    if (ids.length > 0) {
      const { data: tokenRows, error: tokenError } = await supabase
        .from("tokens")
        .select("id, contract_address, last_price_usd, last_market_cap_usd, last_seen_at")
        .in("id", ids);

      if (tokenError) throw tokenError;

      for (const tokenRow of tokenRows ?? []) {
        stored.set(String(tokenRow.id), {
          contractAddress: stringOrNull(tokenRow.contract_address),
          lastPriceUsd: numberOrNull(tokenRow.last_price_usd),
          lastMarketCapUsd: numberOrNull(tokenRow.last_market_cap_usd),
          lastSeenAt: stringOrNull(tokenRow.last_seen_at),
        });
      }
    }

    return rows.map((row) => {
      const id = String(row.id);
      const symbol = String(row.symbol);
      const price = stored.get(id);

      return {
        id,
        symbol,
        name: stringOrNull(row.name),
        chain: String(row.chain),
        contractAddress: price?.contractAddress ?? stringOrNull(row.contract_address),
        logoUrl:
          stringOrNull(row.logo_url) ??
          WELL_KNOWN_TOKEN_LOGOS[symbol.toUpperCase()] ??
          null,
        totalCalls: numberOrZero(row.total_calls),
        uniqueChannels: numberOrZero(row.unique_channels),
        averageRoiPct: numberOrZero(row.average_roi_pct),
        bestMultiple: numberOrZero(row.best_multiple, 1),
        lastCalledAt: stringOrNull(row.last_called_at),
        lastPriceUsd: price?.lastPriceUsd ?? null,
        lastMarketCapUsd: price?.lastMarketCapUsd ?? null,
        lastSeenAt: price?.lastSeenAt ?? null,
      } satisfies TokenMarketRow;
    });
  }, [] as TokenMarketRow[]);
}
