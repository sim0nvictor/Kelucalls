import { computeRankingScore, toNumber } from "@/lib/metrics";
import { isSupabaseConfigured } from "@/lib/server-env";
import { withSupabase } from "@/lib/supabase";
import type {
  ChannelDetail,
  ChannelSummary,
  DashboardSnapshot,
  LiveCall,
  PublicSubmission,
  RankingMode,
  SponsoredPlacement,
  TrendingToken
} from "@/types/kelucalls";

type ChannelRow = {
  id: string;
  slug: string;
  title: string;
  telegram_handle: string;
  telegram_url: string;
  description: string | null;
  status: ChannelSummary["status"];
  is_paid_channel: boolean;
  is_verified: boolean;
  channel_stats: Array<Record<string, unknown>> | null;
};

type CallRow = {
  id: string;
  called_at: string;
  entry_price_usd: number | string;
  channels: Array<{ slug: string; title: string }> | null;
  tokens: Array<{ symbol: string; contract_address: string | null }> | null;
  call_metrics: Array<{
    current_price_usd: number | string | null;
    peak_price_usd: number | string | null;
    current_roi_pct: number | string;
    peak_multiple: number | string;
    hit_2x: boolean;
    hit_10x: boolean;
    hit_100x: boolean;
  }> | null;
};

type SubmissionRow = {
  id: string;
  telegram_handle: string;
  channel_name: string;
  description: string | null;
  submitter_contact: string | null;
  fast_track_requested: boolean;
  status: PublicSubmission["status"];
  created_at: string;
};

function mapChannelSummary(row: ChannelRow): ChannelSummary {
  const stats = row.channel_stats?.[0] ?? {};
  const averageRoiPct = toNumber(stats.average_roi_pct);
  const winRatePct = toNumber(stats.win_rate_pct);
  const totalCalls = toNumber(stats.total_calls);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    telegramHandle: row.telegram_handle,
    telegramUrl: row.telegram_url,
    description: row.description,
    status: row.status,
    isPaidChannel: row.is_paid_channel,
    isVerified: row.is_verified,
    rankingScore: toNumber(stats.ranking_score, computeRankingScore(averageRoiPct, winRatePct, totalCalls)),
    totalCalls,
    winRatePct,
    averageRoiPct,
    averagePeakRoiPct: toNumber(stats.average_peak_roi_pct),
    averageMultiple: toNumber(stats.average_multiple, 1),
    bestMultiple: toNumber(stats.best_multiple, 1),
    hit2xCount: toNumber(stats.hit_2x_count),
    hit10xCount: toNumber(stats.hit_10x_count),
    hit100xCount: toNumber(stats.hit_100x_count),
    simulatedInvestmentUsd: toNumber(stats.simulated_investment_usd),
    simulatedCurrentValueUsd: toNumber(stats.simulated_current_value_usd),
    simulatedCurrentPnlUsd: toNumber(stats.simulated_current_pnl_usd),
    simulatedPeakPnlUsd: toNumber(stats.simulated_peak_pnl_usd),
    refreshedAt: typeof stats.refreshed_at === "string" ? stats.refreshed_at : null
  };
}

function mapLiveCall(row: CallRow): LiveCall {
  const channel = row.channels?.[0] ?? null;
  const token = row.tokens?.[0] ?? null;
  const metrics = row.call_metrics?.[0] ?? null;

  return {
    id: row.id,
    calledAt: row.called_at,
    channelSlug: channel?.slug ?? "unknown",
    channelTitle: channel?.title ?? "Unknown channel",
    tokenSymbol: token?.symbol ?? "UNKNOWN",
    contractAddress: token?.contract_address ?? null,
    entryPriceUsd: toNumber(row.entry_price_usd),
    currentPriceUsd: metrics?.current_price_usd == null ? null : toNumber(metrics.current_price_usd),
    peakPriceUsd: metrics?.peak_price_usd == null ? null : toNumber(metrics.peak_price_usd),
    currentRoiPct: toNumber(metrics?.current_roi_pct),
    peakMultiple: toNumber(metrics?.peak_multiple, 1),
    hit2x: Boolean(metrics?.hit_2x),
    hit10x: Boolean(metrics?.hit_10x),
    hit100x: Boolean(metrics?.hit_100x)
  };
}

function sortChannels(channels: ChannelSummary[], rankingMode: RankingMode) {
  const items = [...channels];

  items.sort((left, right) => {
    switch (rankingMode) {
      case "roi":
        return right.averageRoiPct - left.averageRoiPct;
      case "win-rate":
        return right.winRatePct - left.winRatePct;
      case "pnl":
        return right.simulatedCurrentPnlUsd - left.simulatedCurrentPnlUsd;
      default:
        return right.rankingScore - left.rankingScore;
    }
  });

  return items;
}

export async function getLeaderboard(rankingMode: RankingMode = "smart", limit = 12) {
  const rows = await withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("channels")
      .select(`
        id,
        slug,
        title,
        telegram_handle,
        telegram_url,
        description,
        status,
        is_paid_channel,
        is_verified,
        channel_stats (
          total_calls,
          win_rate_pct,
          average_roi_pct,
          average_peak_roi_pct,
          average_multiple,
          best_multiple,
          hit_2x_count,
          hit_10x_count,
          hit_100x_count,
          simulated_investment_usd,
          simulated_current_value_usd,
          simulated_current_pnl_usd,
          simulated_peak_pnl_usd,
          ranking_score,
          refreshed_at
        )
      `)
      .in("status", ["active", "paused"]);

    if (error) {
      throw error;
    }

    return (data ?? []) as ChannelRow[];
  }, []);

  return sortChannels(rows.map(mapChannelSummary).filter((channel) => !channel.isPaidChannel), rankingMode).slice(0, limit);
}

export async function getSponsoredPlacements(limit = 3) {
  return withSupabase(async (supabase) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("ads")
      .select(`
        id,
        label,
        placement,
        destination_url,
        creative_copy,
        channels (
          slug,
          title
        )
      `)
      .eq("status", "active")
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("priority", { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const channel = Array.isArray(row.channels) ? row.channels[0] : row.channels;
      return {
        id: String(row.id),
        label: String(row.label),
        placement: String(row.placement),
        destinationUrl: String(row.destination_url),
        creativeCopy: row.creative_copy ? String(row.creative_copy) : null,
        channelSlug: channel && typeof channel === "object" && "slug" in channel ? String(channel.slug) : "unknown",
        channelTitle: channel && typeof channel === "object" && "title" in channel ? String(channel.title) : "Sponsored"
      } satisfies SponsoredPlacement;
    });
  }, []);
}

export async function getLiveCalls(limit = 8) {
  const rows = await withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("calls")
      .select(`
        id,
        called_at,
        entry_price_usd,
        channels (
          slug,
          title
        ),
        tokens (
          symbol,
          contract_address
        ),
        call_metrics (
          current_price_usd,
          peak_price_usd,
          current_roi_pct,
          peak_multiple,
          hit_2x,
          hit_10x,
          hit_100x
        )
      `)
      .order("called_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return (data ?? []) as unknown as CallRow[];
  }, []);

  return rows.map(mapLiveCall);
}

export async function getTrendingTokens(limit = 6) {
  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("trending_tokens")
      .select("*")
      .order("unique_channels", { ascending: false })
      .order("total_calls", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      symbol: String(row.symbol),
      name: row.name ? String(row.name) : null,
      chain: String(row.chain),
      contractAddress: row.contract_address ? String(row.contract_address) : null,
      totalCalls: toNumber(row.total_calls),
      uniqueChannels: toNumber(row.unique_channels),
      averageRoiPct: toNumber(row.average_roi_pct),
      bestMultiple: toNumber(row.best_multiple, 1),
      lastCalledAt: row.last_called_at ? String(row.last_called_at) : null
    } satisfies TrendingToken));
  }, []);
}

export async function getDashboardSnapshot(rankingMode: RankingMode = "smart"): Promise<DashboardSnapshot> {
  const [leaderboard, liveCalls, trendingTokens, sponsoredPlacements] = await Promise.all([
    getLeaderboard(rankingMode, 12),
    getLiveCalls(8),
    getTrendingTokens(6),
    getSponsoredPlacements(3)
  ]);

  const trackedCalls = leaderboard.reduce((sum, channel) => sum + channel.totalCalls, 0);
  const totalWinRate = leaderboard.reduce((sum, channel) => sum + channel.winRatePct, 0);
  const totalPnl = leaderboard.reduce((sum, channel) => sum + channel.simulatedCurrentPnlUsd, 0);

  return {
    isConfigured: isSupabaseConfigured(),
    leaderboard,
    liveCalls,
    trendingTokens,
    sponsoredPlacements,
    totals: {
      trackedChannels: leaderboard.length,
      trackedCalls,
      simulatedPnlUsd: totalPnl,
      winRatePct: leaderboard.length > 0 ? totalWinRate / leaderboard.length : 0
    }
  };
}

export async function getChannelDetail(slug: string): Promise<ChannelDetail | null> {
  const leaderboard = await getLeaderboard("smart", 100);
  const summary = leaderboard.find((channel) => channel.slug === slug);

  if (!summary) {
    return null;
  }

  const recentCalls = await withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("calls")
      .select(`
        id,
        called_at,
        entry_price_usd,
        channels (
          slug,
          title
        ),
        tokens (
          symbol,
          contract_address
        ),
        call_metrics (
          current_price_usd,
          peak_price_usd,
          current_roi_pct,
          peak_multiple,
          hit_2x,
          hit_10x,
          hit_100x
        )
      `)
      .eq("channel_id", summary.id)
      .order("called_at", { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    return (data ?? []) as unknown as CallRow[];
  }, []);

  return {
    summary,
    recentCalls: recentCalls.map(mapLiveCall)
  };
}

export async function getPendingSubmissions(limit = 12) {
  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("submissions")
      .select("id, telegram_handle, channel_name, description, submitter_contact, fast_track_requested, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return ((data ?? []) as SubmissionRow[]).map((row) => ({
      id: row.id,
      telegramHandle: row.telegram_handle,
      channelName: row.channel_name,
      description: row.description,
      submitterContact: row.submitter_contact,
      fastTrackRequested: row.fast_track_requested,
      status: row.status,
      createdAt: row.created_at
    }));
  }, []);
}
