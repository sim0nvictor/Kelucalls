import { unstable_noStore as noStore } from "next/cache";
import { toNumber } from "@/lib/metrics";
import { isSupabaseConfigured } from "@/lib/server-env";
import { withSupabase } from "@/lib/supabase";
import { WELL_KNOWN_TOKEN_LOGOS } from "@/lib/well-known-token-logos";
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
 
// ---------------------------------------------------------------------------
// Row types (match actual Supabase schema)
// ---------------------------------------------------------------------------
 
type ChannelRow = {
  id: string;
  slug: string;
  title: string;
  telegram_handle: string;
  telegram_url: string;
  description: string | null;
  avatar_url: string | null;
  status: ChannelSummary["status"];
  is_paid_channel: boolean;
  is_verified: boolean;
  channel_stats: Array<Record<string, unknown>> | Record<string, unknown> | null;
};
 
type CallRow = {
  id: string;
  called_at: string;
  entry_price_usd: number | string;
  // PostgREST returns these as a plain object (one-to-one FK) or array
  // depending on how the relationship is defined. Handle both defensively.
  channels: Array<{ slug: string; title: string }> | { slug: string; title: string } | null;
  tokens: Array<{ symbol: string; contract_address: string | null; logo_url: string | null }> | { symbol: string; contract_address: string | null; logo_url: string | null } | null;
  call_metrics: Array<{
    current_price_usd: number | string | null;
    peak_price_usd: number | string | null;
    current_roi_pct: number | string;
    peak_multiple: number | string;
    hit_2x: boolean;
    hit_10x: boolean;
    hit_100x: boolean;
  }> | {
    current_price_usd: number | string | null;
    peak_price_usd: number | string | null;
    current_roi_pct: number | string;
    peak_multiple: number | string;
    hit_2x: boolean;
    hit_10x: boolean;
    hit_100x: boolean;
  } | null;
};
 
type AdRow = {
  id: string;
  label: string;
  placement: string;
  placement_subtype: "channel_placement" | "token_placement" | null;
  destination_url: string;
  creative_copy: string | null;
  logo_url: string | null;
  token_symbol: string | null;
  contract_address: string | null;
  channels:
    | ChannelRef
    | Array<ChannelRef>
    | null;
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
 
type ChannelRef = { slug: string; title: string };
// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
 
function mapChannelSummary(row: ChannelRow): ChannelSummary {
  const stats = (Array.isArray(row.channel_stats)
  ? row.channel_stats[0]
  : row.channel_stats) ?? {};
  const averageRoiPct = toNumber(stats.average_roi_pct);
  const winRatePct    = toNumber(stats.win_rate_pct);
  const totalCalls    = toNumber(stats.total_calls);
 
  // ranking_score is NULL in the DB for zero-call and paid channels (by design
  // in refresh_channel_stats). We must preserve that NULL so nullSafeDesc()
  // pushes them to the bottom of every sort. Using toNumber() with a fallback
  // would replace NULL with 0, which sorts ABOVE negative scores — wrong.
  const rawScore = stats.ranking_score;
  const rankingScore: number | null =
    rawScore === null || rawScore === undefined
      ? null
      : toNumber(rawScore);
 
  return {
    id:                       row.id,
    slug:                     row.slug,
    title:                    row.title,
    avatarUrl:                row.avatar_url ?? null,
    telegramHandle:           row.telegram_handle,
    telegramUrl:              row.telegram_url,
    description:              row.description,
    status:                   row.status,
    isPaidChannel:            row.is_paid_channel,
    isVerified:               row.is_verified,
    rankingScore,
    totalCalls,
    winRatePct,
    averageRoiPct,
    averagePeakRoiPct:        toNumber(stats.average_peak_roi_pct),
    averageMultiple:          toNumber(stats.average_multiple, 1),
    bestMultiple:             toNumber(stats.best_multiple, 1),
    hit2xCount:               toNumber(stats.hit_2x_count),
    hit10xCount:              toNumber(stats.hit_10x_count),
    hit100xCount:             toNumber(stats.hit_100x_count),
    simulatedInvestmentUsd:   toNumber(stats.simulated_investment_usd),
    simulatedCurrentValueUsd: toNumber(stats.simulated_current_value_usd),
    simulatedCurrentPnlUsd:   toNumber(stats.simulated_current_pnl_usd),
    simulatedPeakPnlUsd:      toNumber(stats.simulated_peak_pnl_usd),
    refreshedAt:              typeof stats.refreshed_at === "string" ? stats.refreshed_at : null,
   
  };
}
 
function mapLiveCall(row: CallRow): LiveCall {
  // PostgREST returns related rows as either a plain object (one-to-one FK)
  // or an array (one-to-many). Handle both shapes defensively.
  const channel = Array.isArray(row.channels)
    ? row.channels[0] ?? null
    : row.channels ?? null;
 
  const token = Array.isArray(row.tokens)
    ? row.tokens[0] ?? null
    : row.tokens ?? null;
 
  const metrics = Array.isArray(row.call_metrics)
    ? row.call_metrics[0] ?? null
    : row.call_metrics ?? null;
 
  const symbol = token?.symbol ?? "UNKNOWN";
 
  return {
    id:              row.id,
    calledAt:        row.called_at,
    channelSlug:     channel?.slug  ?? "unknown",
    channelTitle:    channel?.title ?? "Unknown channel",
    tokenSymbol:     symbol,
    tokenLogoUrl:    token?.logo_url
      ?? WELL_KNOWN_TOKEN_LOGOS[symbol.toUpperCase()]
      ?? null,
    contractAddress: token?.contract_address ?? null,
    entryPriceUsd:   toNumber(row.entry_price_usd),
    currentPriceUsd: metrics?.current_price_usd == null ? null : toNumber(metrics.current_price_usd),
    peakPriceUsd:    metrics?.peak_price_usd    == null ? null : toNumber(metrics.peak_price_usd),
    currentRoiPct:   toNumber(metrics?.current_roi_pct),
    peakMultiple:    toNumber(metrics?.peak_multiple, 1),
    hit2x:           Boolean(metrics?.hit_2x),
    hit10x:          Boolean(metrics?.hit_10x),
    hit100x:         Boolean(metrics?.hit_100x)
  };
}
function normalizeChannelReference(value: unknown): ChannelRef | null {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object" && "slug" in first && "title" in first) {
      return {
        slug: String((first as { slug?: unknown }).slug ?? ""),
        title: String((first as { title?: unknown }).title ?? ""),
      };
    }
    return null;
  }

  if (value && typeof value === "object" && "slug" in value && "title" in value) {
    return {
      slug: String((value as { slug?: unknown }).slug ?? ""),
      title: String((value as { title?: unknown }).title ?? ""),
    };
  }

  return null;
}
 
function mapSponsoredPlacement(row: AdRow): SponsoredPlacement {
  const subtype = row.placement_subtype ?? "channel_placement";
  const channel = normalizeChannelReference(row.channels);

  return {
    id: row.id,
    label: row.label,
    placement: row.placement,
    placementSubtype: subtype,
    destinationUrl: row.destination_url,
    creativeCopy: row.creative_copy ?? null,
    logoUrl: row.logo_url ?? null,
    imageUrl: row.logo_url ?? null,
    imageAlt: row.label ?? null,
    channelSlug: channel?.slug ?? null,
    channelTitle: channel?.title ?? null,
    tokenSymbol: row.token_symbol ?? null,
    contractAddress: row.contract_address ?? null,
  };
}
 
// Null-safe descending comparator.
// Channels where the metric is null (zero calls, paid) always sort to the bottom.
function nullSafeDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;   // a goes below b
  if (b === null) return -1;  // b goes below a
  return b - a;
}
 
function sortChannels(channels: ChannelSummary[], rankingMode: RankingMode) {
  return [...channels].sort((left, right) => {
    switch (rankingMode) {
      case "roi":      return nullSafeDesc(left.averageRoiPct,          right.averageRoiPct);
      case "win-rate": return nullSafeDesc(left.winRatePct,             right.winRatePct);
      case "pnl":      return nullSafeDesc(left.simulatedCurrentPnlUsd, right.simulatedCurrentPnlUsd);
      default:         return nullSafeDesc(left.rankingScore,           right.rankingScore);
    }
  });
}
 
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
 
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
        avatar_url,
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
 
    if (error) throw error;
    return (data ?? []) as ChannelRow[];
  }, []);
 
  return sortChannels(
    rows.map(mapChannelSummary).filter((ch) => !ch.isPaidChannel),
    rankingMode
  ).slice(0, limit);
}
 
// getSponsoredPlacements — channel placements only (for leaderboard injection)
export async function getSponsoredPlacements(limit = 3) {
  return withSupabase(async (supabase) => {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("sponsored_placements")
      .select(`
        id,
        title,
        subtitle,
        surface,
        placement_subtype,
        destination_url,
        logo_url,
        token_symbol,
        contract_address,
        channels (
          slug,
          title
        )
      `)
      .eq("status", "active")
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("priority", { ascending: true })
      .limit(limit);

    if (error) throw error;

    const channelRows = (data ?? []).filter(
      (row) => !row.placement_subtype || row.placement_subtype === "channel_placement"
    );

    return channelRows.map((row) =>
      mapSponsoredPlacement({
        id: row.id,
        label: row.title ?? "",
        placement: row.surface ?? "homepage",
        placement_subtype:
          (row.placement_subtype as "channel_placement" | "token_placement") ??
          "channel_placement",
        destination_url: row.destination_url,
        creative_copy: row.subtitle ?? null,
        logo_url: row.logo_url ?? null,
        token_symbol: null,
        contract_address: null,
        channels: Array.isArray(row.channels)
          ? (row.channels[0] as ChannelRef | null)
          : (row.channels as ChannelRef | null),
      })
    );
  }, [] as SponsoredPlacement[]);
}

// getSponsoredTokenPlacements — token placements (shown at top of feeds)
export async function getSponsoredTokenPlacements(surface: string, limit = 2) {
  return withSupabase(async (supabase) => {
    const now = new Date().toISOString();
 
    const { data, error } = await supabase
      .from("sponsored_placements")
      .select(`
        id,
        title,
        subtitle,
        surface,
        placement_subtype,
        destination_url,
        logo_url,
        token_symbol,
        contract_address,
        channels (
          slug,
          title
        )
      `)
      .eq("status", "active")
      .eq("placement_subtype", "token_placement")
      .eq("surface", surface)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("priority", { ascending: true })
      .limit(limit);
 
    if (error) throw error;
 
    return (data ?? []).map((row) => mapSponsoredPlacement({
      id:                row.id,
      label:             row.title ?? "",
      placement:         row.surface ?? surface,
      placement_subtype: "token_placement",
      destination_url:   row.destination_url,
      creative_copy:     row.subtitle ?? null,
      logo_url:          row.logo_url ?? null,
      token_symbol:      row.token_symbol ?? null,
      contract_address:  row.contract_address ?? null,
      channels:          null,
    }));
  }, [] as SponsoredPlacement[]);
}
 
// getActiveAds — popup floating ads (separate from sponsored placements)
export async function getActiveAds(limit = 3) {
  return withSupabase(async (supabase) => {
    const now = new Date().toISOString();
 
    const { data, error } = await supabase
      .from("ads")
      .select("id, label, destination_url, creative_copy, image_url")
      .eq("status", "active")
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("priority", { ascending: true })
      .limit(limit);
 
    if (error) throw error;
 
    return (data ?? []).map((row) => ({
      id:             String(row.id),
      label:          String(row.label),
      destinationUrl: String(row.destination_url),
      creativeCopy:   row.creative_copy ? String(row.creative_copy) : null,
      imageUrl:       row.image_url ? String(row.image_url) : null,
    }));
  }, [] as Array<{ id: string; label: string; destinationUrl: string; creativeCopy: string | null; imageUrl: string | null }>);
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
          contract_address,
          logo_url
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
      // FIX: without this filter anon users are blocked by RLS
      .in("status", ["open", "closed"])
      .order("called_at", { ascending: false })
      .limit(limit);
 
    if (error) throw error;
    return (data ?? []) as unknown as CallRow[];
  }, []);
 
  return rows.map(mapLiveCall);
}
 
export async function getTrendingTokens(limit = 6, orderBy: "unique_channels" | "total_calls" | "average_roi_pct" | "best_multiple" = "unique_channels") {
  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("trending_tokens")
      .select("*")
      .order(orderBy,       { ascending: false })
      .order("total_calls", { ascending: false })
      .limit(limit);
 
    if (error) throw error;
 
    return (data ?? []).map((row) => {
      const symbol = String(row.symbol);
      return {
        id:              String(row.id),
        symbol,
        name:            row.name            ? String(row.name)            : null,
        chain:           String(row.chain),
        contractAddress: row.contract_address ? String(row.contract_address) : null,
        logoUrl:         row.logo_url
          ? String(row.logo_url)
          : WELL_KNOWN_TOKEN_LOGOS[symbol.toUpperCase()] ?? null,
        totalCalls:      toNumber(row.total_calls),
        uniqueChannels:  toNumber(row.unique_channels),
        averageRoiPct:   toNumber(row.average_roi_pct),
        bestMultiple:    toNumber(row.best_multiple, 1),
        lastCalledAt:    row.last_called_at  ? String(row.last_called_at)  : null,
      } satisfies TrendingToken;
    });
  }, [] as TrendingToken[]);
}
 
export async function getDashboardSnapshot(rankingMode: RankingMode = "smart"): Promise<DashboardSnapshot> {
  noStore();
  const [leaderboard, liveCalls, trendingTokens, sponsoredPlacements, totalTokenCount, totalChannelCount] = await Promise.all([
    getLeaderboard(rankingMode, 12),
    getLiveCalls(8),
    getTrendingTokens(6),
    getSponsoredPlacements(3),
    // Fetch real total token count separately — trending tokens on homepage
    // are capped at 6 for display, but the stat card should show the real number
    withSupabase(async (supabase) => {
      const { count } = await supabase
        .from("trending_tokens")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    }, 0),
    // Fetch real total tracked channel count separately — the leaderboard
    // above is capped at 12 for display, but the stat card should show the
    // real number of tracked (non-paid, active/paused) channels.
    withSupabase(async (supabase) => {
      const { count } = await supabase
        .from("channels")
        .select("id", { count: "exact", head: true })
        .in("status", ["active", "paused"])
        .eq("is_paid_channel", false);
      return count ?? 0;
    }, 0),
  ]);

  const trackedCalls = leaderboard.reduce((sum, ch) => sum + ch.totalCalls, 0);
  const totalWinRate = leaderboard.reduce((sum, ch) => sum + ch.winRatePct, 0);
  const totalPnl     = leaderboard.reduce((sum, ch) => sum + ch.simulatedCurrentPnlUsd, 0);

  return {
    isConfigured: isSupabaseConfigured(),
    leaderboard,
    liveCalls,
    trendingTokens,
    sponsoredPlacements,
    totals: {
      trackedChannels: totalChannelCount,
      trackedCalls,
      simulatedPnlUsd: totalPnl,
      winRatePct: leaderboard.length > 0 ? totalWinRate / leaderboard.length : 0,
      trackedTokens: totalTokenCount,
    }
  };
}
 
export async function getChannelDetail(slug: string): Promise<ChannelDetail | null> {
  const leaderboard = await getLeaderboard("smart", 100);
  const summary     = leaderboard.find((ch) => ch.slug === slug);
 
  if (!summary) return null;
 
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
      .in("status", ["open", "closed"])
      .order("called_at", { ascending: false })
      .limit(20);
 
    if (error) throw error;
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
 
    if (error) throw error;
 
    return ((data ?? []) as SubmissionRow[]).map((row) => ({
      id:                   row.id,
      telegramHandle:       row.telegram_handle,
      channelName:          row.channel_name,
      description:          row.description,
      submitterContact:     row.submitter_contact,
      fastTrackRequested:   row.fast_track_requested,
      status:               row.status,
      createdAt:            row.created_at
    }));
  }, []);
}