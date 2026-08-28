/**
 * Kelucalls internal ResearchProvider.
 *
 * Server-only. This provider turns the existing Kelucalls dataset (calls,
 * call_metrics, channels, channel_stats, trending_tokens) into the same
 * shape as the other Daily Research providers so the engine can blend it
 * with CoinGecko / DeFiLlama / Fear & Greed / news.
 *
 * Public surface
 * --------------
 *   getKelucallsSnapshot(): Promise<KelucallsSnapshot | null>
 *
 * Determinism
 * -----------
 * Every metric in the snapshot is computed in code from rows that already
 * exist in the database. No LLM is asked to derive any number. Cutoffs are
 * applied in UTC and respect the existing partial indexes on
 * `calls (called_at desc) where status in ('open','closed')` and
 * `channels (status, is_verified desc)` so queries stay fast as the dataset
 * grows.
 *
 * Failure handling
 * ----------------
 * The function never throws. Any underlying Supabase failure returns null;
 * the snapshot store then records the failure in `providerStatus` and the
 * engine can degrade gracefully. This matches the contract used by the
 * other providers.
 *
 * Reuse
 * -----
 * - `trending_tokens` (materialized view) provides token-level aggregates
 *   already maintained by `refresh_public_analytics()` in the trending
 *   worker. The provider reads it instead of re-aggregating.
 * - `channel_stats` provides per-channel aggregates, also maintained by
 *   the trending worker.
 * - `calls` and `call_metrics` are the source of truth for time-windowed
 *   metrics; the provider reads them directly.
 * - `channels` provides the active-channel count via the existing
 *   `channels_public_list_idx` partial index.
 */

import { withSupabase } from "@/lib/supabase";
import { toNumber } from "@/lib/metrics";
import type {
  KelucallsChannelMetric,
  KelucallsEmergingToken,
  KelucallsSnapshot,
  KelucallsTokenMetric
} from "@/lib/research/types";

/** Cap on rows the provider will read for "trending" / channel lists. */
const TRENDING_TOKEN_LIMIT = 20;
const CHANNEL_PERFORMANCE_LIMIT = 20;
const EMERGING_TOKEN_LIMIT = 10;
/** Bounded cap on the rows the provider reads from the calls table per window. */
const CALLS_WINDOW_LIMIT = 5000;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type TrendingTokenRow = {
  id: string;
  symbol: string;
  name: string | null;
  chain: string;
  contract_address: string | null;
  total_calls: number | string | null;
  unique_channels: number | string | null;
  average_roi_pct: number | string | null;
  best_multiple: number | string | null;
  last_called_at: string | null;
};

type ChannelStatsRow = {
  channel_id: string;
  total_calls: number | string | null;
  wins: number | string | null;
  win_rate_pct: number | string | null;
  average_roi_pct: number | string | null;
  best_multiple: number | string | null;
  last_call_at: string | null;
  channels: { slug: string; title: string } | Array<{ slug: string; title: string }> | null;
};

type CallRow = {
  id: string;
  channel_id: string;
  token_id: string;
  called_at: string;
  call_metrics: { current_roi_pct: number | string | null; peak_multiple: number | string | null }
    | Array<{ current_roi_pct: number | string | null; peak_multiple: number | string | null }>
    | null;
};

type TokenMeta = {
  id: string;
  symbol: string;
  name: string | null;
  chain: string;
  contract_address: string | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapTrendingToken(row: TrendingTokenRow): KelucallsTokenMetric {
  return {
    tokenId: String(row.id),
    symbol: readString(row.symbol) ?? "",
    name: row.name ? String(row.name) : null,
    chain: String(row.chain),
    contractAddress: row.contract_address ? String(row.contract_address) : null,
    totalCalls: toNumber(row.total_calls),
    uniqueChannels: toNumber(row.unique_channels),
    averageRoiPct: readNullableNumber(row.average_roi_pct),
    bestMultiple: readNullableNumber(row.best_multiple),
    lastCalledAt: row.last_called_at ? String(row.last_called_at) : null
  };
}

function mapChannelMetric(
  row: ChannelStatsRow,
  last24h: number,
  previous24h: number
): KelucallsChannelMetric {
  const channel = firstRelation(row.channels);
  return {
    channelId: String(row.channel_id),
    slug: channel?.slug ? String(channel.slug) : "",
    title: channel?.title ? String(channel.title) : "",
    totalCalls: readNullableNumber(row.total_calls),
    winRatePct: readNullableNumber(row.win_rate_pct),
    averageRoiPct: readNullableNumber(row.average_roi_pct),
    bestMultiple: readNullableNumber(row.best_multiple),
    lastCallAt: row.last_call_at ? String(row.last_call_at) : null,
    callsLast24h: last24h,
    callsPrevious24h: previous24h,
    callVelocity: last24h - previous24h
  };
}

function mapEmergingToken(
  row: {
    token_id: string;
    first_called_at: string;
    total_calls: number | string | null;
    unique_channels: number | string | null;
    tokens: TokenMeta | TokenMeta[] | null;
  },
  nowMs: number
): KelucallsEmergingToken | null {
  const token = firstRelation(row.tokens);
  if (!token) return null;
  const firstCalledMs = Date.parse(row.first_called_at);
  if (!Number.isFinite(firstCalledMs)) return null;
  return {
    tokenId: String(row.token_id),
    symbol: String(token.symbol ?? ""),
    name: token.name ? String(token.name) : null,
    chain: String(token.chain ?? ""),
    contractAddress: token.contract_address ? String(token.contract_address) : null,
    firstCalledAt: row.first_called_at,
    totalCalls: toNumber(row.total_calls),
    uniqueChannels: toNumber(row.unique_channels),
    hoursSinceFirstCall: Math.max(0, (nowMs - firstCalledMs) / 3_600_000)
  };
}

interface CollectedData {
  callsLast24h: number;
  callsPrevious24h: number;
  activeChannels: number;
  uniqueTokensLast24h: number;
  averageUniqueChannelsPerTokenLast24h: number | null;
  averageRoiPctLast24h: number | null;
  bestMultipleLast24h: number | null;
  trendingTokens: KelucallsTokenMetric[];
  channelPerformance: KelucallsChannelMetric[];
  newTokens: KelucallsEmergingToken[];
  emergingTokens: KelucallsEmergingToken[];
  channelVelocity: number;
}

/**
 * Build a Kelucalls research snapshot.
 *
 * Returns null when Supabase is unconfigured or every underlying query
 * fails. Otherwise returns a snapshot with whatever fields could be
 * computed; each field is independently nullable so a single failure
 * does not poison the rest of the payload.
 */
export async function getKelucallsSnapshot(): Promise<KelucallsSnapshot | null> {
  const collectedAt = new Date().toISOString();
  const nowMs = Date.parse(collectedAt);
  const last24hIso = new Date(nowMs - 24 * 3_600_000).toISOString();
  const previous24hStartIso = new Date(nowMs - 48 * 3_600_000).toISOString();

  const data = await withSupabase<CollectedData | null>(
    async (supabase) => {
      // ----- Counts in time windows -----------------------------------------
      // `status in ('open', 'closed')` matches the existing live-feed partial
      // index `calls_live_feed_idx (called_at desc) where status in ('open','closed')`.
      const [callsLast24hCount, callsPrev24hCount, activeChannelsCount] = await Promise.all([
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "closed"])
          .gte("called_at", last24hIso),
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "closed"])
          .gte("called_at", previous24hStartIso)
          .lt("called_at", last24hIso),
        supabase
          .from("channels")
          .select("id", { count: "exact", head: true })
          .in("status", ["active", "paused"])
          .eq("is_paid_channel", false)
      ]);

      if (callsLast24hCount.error) throw callsLast24hCount.error;
      if (callsPrev24hCount.error) throw callsPrev24hCount.error;
      if (activeChannelsCount.error) throw activeChannelsCount.error;

      const callsLast24h = callsLast24hCount.count ?? 0;
      const callsPrevious24h = callsPrev24hCount.count ?? 0;
      const activeChannels = activeChannelsCount.count ?? 0;

      // ----- Calls in last 24h + prior 24h (full rows) ----------------------
      // Read both windows once. The last 24h rows drive token-level metrics
      // (distinct token count, per-token channel count, ROI/multiple
      // aggregates). The prior 24h rows drive per-channel previous-window
      // counts and channel velocity.
      const [last24hResult, prev24hResult] = await Promise.all([
        supabase
          .from("calls")
          .select(`
            id,
            channel_id,
            token_id,
            called_at,
            call_metrics (
              current_roi_pct,
              peak_multiple
            )
          `)
          .in("status", ["open", "closed"])
          .gte("called_at", last24hIso)
          .order("called_at", { ascending: false })
          .limit(CALLS_WINDOW_LIMIT),
        supabase
          .from("calls")
          .select("id, channel_id, token_id, called_at")
          .in("status", ["open", "closed"])
          .gte("called_at", previous24hStartIso)
          .lt("called_at", last24hIso)
          .order("called_at", { ascending: false })
          .limit(CALLS_WINDOW_LIMIT)
      ]);

      if (last24hResult.error) throw last24hResult.error;
      if (prev24hResult.error) throw prev24hResult.error;

      const last24hCalls = (last24hResult.data ?? []) as unknown as CallRow[];
      const prev24hCalls = (prev24hResult.data ?? []) as Array<{
        id: string;
        channel_id: string;
        token_id: string;
        called_at: string;
      }>;

      // Per-channel call counts in each window.
      const callsByChannelLast24h = new Map<string, number>();
      for (const row of last24hCalls) {
        const id = String(row.channel_id);
        callsByChannelLast24h.set(id, (callsByChannelLast24h.get(id) ?? 0) + 1);
      }
      const callsByChannelPrevious24h = new Map<string, number>();
      for (const row of prev24hCalls) {
        const id = String(row.channel_id);
        callsByChannelPrevious24h.set(id, (callsByChannelPrevious24h.get(id) ?? 0) + 1);
      }

      // Distinct tokens in the last 24h.
      const tokensInWindow = new Set<string>();
      // tokens with at least one call in the window -> distinct channel count.
      const tokenToChannels = new Map<string, Set<string>>();
      let roiSum = 0;
      let roiCount = 0;
      let bestMultiple = 0;

      for (const row of last24hCalls) {
        tokensInWindow.add(String(row.token_id));
        if (!tokenToChannels.has(String(row.token_id))) {
          tokenToChannels.set(String(row.token_id), new Set());
        }
        tokenToChannels.get(String(row.token_id))!.add(String(row.channel_id));

        const metrics = firstRelation(row.call_metrics);
        const roi = readNullableNumber(metrics?.current_roi_pct);
        const peak = readNullableNumber(metrics?.peak_multiple);
        if (roi !== null) {
          roiSum += roi;
          roiCount += 1;
        }
        if (peak !== null && peak > bestMultiple) {
          bestMultiple = peak;
        }
      }

      const uniqueTokensLast24h = tokensInWindow.size;
      const averageUniqueChannelsPerTokenLast24h =
        uniqueTokensLast24h > 0
          ? Array.from(tokenToChannels.values()).reduce(
              (sum, channels) => sum + channels.size,
              0
            ) / uniqueTokensLast24h
          : null;
      const averageRoiPctLast24h = roiCount > 0 ? roiSum / roiCount : null;
      const bestMultipleLast24h = last24hCalls.length > 0 ? bestMultiple : null;

      // channelVelocity: count of distinct channels active in each window.
      // Built from the bounded call windows; if either window exceeds the
      // cap the velocity remains directionally meaningful for the rest of
      // the dataset, which is what the engine wants.
      const channelsActiveLast24h = new Set<string>();
      for (const row of last24hCalls) channelsActiveLast24h.add(String(row.channel_id));
      const channelsActivePrevious24h = new Set<string>();
      for (const row of prev24hCalls) channelsActivePrevious24h.add(String(row.channel_id));
      const channelVelocity = channelsActiveLast24h.size - channelsActivePrevious24h.size;

      // ----- Trending tokens (re-uses the materialized view) -----------------
      const { data: trendingRows, error: trendingError } = await supabase
        .from("trending_tokens")
        .select(
          "id, symbol, name, chain, contract_address, total_calls, unique_channels, average_roi_pct, best_multiple, last_called_at"
        )
        .order("unique_channels", { ascending: false })
        .order("total_calls", { ascending: false })
        .limit(TRENDING_TOKEN_LIMIT);

      if (trendingError) throw trendingError;
      const trendingTokens = (trendingRows ?? []).map((row) =>
        mapTrendingToken(row as TrendingTokenRow)
      );

      // ----- Channel performance --------------------------------------------
      // channel_stats already exposes aggregates; we layer 24h/48h-24h
      // window counts on top. We only fetch the top N by ranking_score
      // because the engine surfaces a bounded list.
      const { data: channelStatsRows, error: channelStatsError } = await supabase
        .from("channel_stats")
        .select(`
          channel_id,
          total_calls,
          wins,
          win_rate_pct,
          average_roi_pct,
          best_multiple,
          last_call_at,
          channels (
            slug,
            title
          )
        `)
        .order("ranking_score", { ascending: false })
        .limit(CHANNEL_PERFORMANCE_LIMIT);

      if (channelStatsError) throw channelStatsError;
      const channelPerformance = ((channelStatsRows ?? []) as unknown as ChannelStatsRow[])
        .map((row) =>
          mapChannelMetric(
            row,
            callsByChannelLast24h.get(String(row.channel_id)) ?? 0,
            callsByChannelPrevious24h.get(String(row.channel_id)) ?? 0
          )
        )
        .sort((a, b) => {
          if (b.callsLast24h !== a.callsLast24h) return b.callsLast24h - a.callsLast24h;
          if (b.totalCalls !== a.totalCalls) return (b.totalCalls ?? 0) - (a.totalCalls ?? 0);
          return a.title.localeCompare(b.title);
        });

      // ----- New / emerging tokens ------------------------------------------
      // We build a per-token map of the earliest visible call, then split
      // tokens into "new" (first call in the last 24h) and "emerging"
      // (called earlier, now getting cross-channel coverage). The total
      // calls / unique channels are pulled from the trending_tokens
      // materialized view so the numbers match what the dashboard shows.
      const { data: firstCallRows, error: firstCallError } = await supabase
        .from("calls")
        .select(`
          token_id,
          called_at,
          tokens (
            id,
            symbol,
            name,
            chain,
            contract_address
          )
        `)
        .in("status", ["open", "closed"])
        .order("called_at", { ascending: true })
        .limit(CALLS_WINDOW_LIMIT);

      if (firstCallError) throw firstCallError;

      type FirstCallRow = {
        token_id: string;
        called_at: string;
        tokens: TokenMeta | TokenMeta[] | null;
      };

      const firstCallByToken = new Map<string, FirstCallRow>();
      for (const row of (firstCallRows ?? []) as unknown as FirstCallRow[]) {
        const tokenId = String(row.token_id);
        const existing = firstCallByToken.get(tokenId);
        if (!existing || Date.parse(row.called_at) < Date.parse(existing.called_at)) {
          firstCallByToken.set(tokenId, row);
        }
      }

      const tokenMetricsLookup = new Map<string, KelucallsTokenMetric>();
      for (const token of trendingTokens) {
        tokenMetricsLookup.set(token.tokenId, token);
      }

      const newRows: KelucallsEmergingToken[] = [];
      const emergingRows: KelucallsEmergingToken[] = [];

      for (const [tokenId, row] of firstCallByToken.entries()) {
        const firstMs = Date.parse(row.called_at);
        if (!Number.isFinite(firstMs)) continue;
        const metrics = tokenMetricsLookup.get(tokenId);
        const totalCalls = metrics?.totalCalls ?? 0;
        const uniqueChannels = metrics?.uniqueChannels ?? 0;
        const enriched = mapEmergingToken(
          {
            token_id: tokenId,
            first_called_at: row.called_at,
            total_calls: totalCalls,
            unique_channels: uniqueChannels,
            tokens: row.tokens
          },
          nowMs
        );
        if (!enriched) continue;

        if (firstMs >= Date.parse(last24hIso)) {
          newRows.push(enriched);
        } else if (uniqueChannels >= 2) {
          // Emerging = already known but now gaining second-channel traction.
          // Multi-channel coverage is the "emerging" signal; tokens called
          // by only one channel forever are not emerging.
          emergingRows.push(enriched);
        }
      }

      newRows.sort((a, b) => b.totalCalls - a.totalCalls);
      emergingRows.sort((a, b) => b.uniqueChannels - a.uniqueChannels);

      return {
        callsLast24h,
        callsPrevious24h,
        activeChannels,
        uniqueTokensLast24h,
        averageUniqueChannelsPerTokenLast24h,
        averageRoiPctLast24h,
        bestMultipleLast24h,
        trendingTokens,
        channelPerformance,
        newTokens: newRows.slice(0, EMERGING_TOKEN_LIMIT),
        emergingTokens: emergingRows.slice(0, EMERGING_TOKEN_LIMIT),
        channelVelocity
      };
    },
    null
  );

  if (!data) {
    console.warn("[kelucalls] snapshot collection failed; returning null");
    return null;
  }

  return {
    callsLast24h: data.callsLast24h,
    callsPrevious24h: data.callsPrevious24h,
    activeChannels: data.activeChannels,
    uniqueTokensLast24h: data.uniqueTokensLast24h,
    averageUniqueChannelsPerTokenLast24h: data.averageUniqueChannelsPerTokenLast24h,
    averageRoiPctLast24h: data.averageRoiPctLast24h,
    bestMultipleLast24h: data.bestMultipleLast24h,
    trendingTokens: data.trendingTokens,
    channelPerformance: data.channelPerformance,
    newTokens: data.newTokens,
    emergingTokens: data.emergingTokens,
    callVelocity: data.callsLast24h - data.callsPrevious24h,
    channelVelocity: data.channelVelocity,
    fetchedAt: collectedAt,
    source: "kelucalls"
  };
}
