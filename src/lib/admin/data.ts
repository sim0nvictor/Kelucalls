import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env";

export function createAdminDb() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase service configuration.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type JoinedRecord = Record<string, unknown> & {
  channels?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  tokens?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  submissions?: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

export async function getAdminOverview() {
  const db = createAdminDb();
  const now = new Date().toISOString();

  const [
    channelsResult,
    tokensResult,
    adsResult,
    placementsResult,
    submissionsResult,
    reportsResult,
    impressionsResult,
    clicksResult,
    liveCallsResult
  ] = await Promise.all([
    db.from("channels").select("id, status", { count: "exact" }),
    db.from("tokens").select("id", { count: "exact" }),
    db.from("ads").select("id, status", { count: "exact" }),
    db
      .from("sponsored_placements")
      .select("id, status, starts_at, ends_at, surface", { count: "exact" }),
    db.from("submissions").select("id", { count: "exact" }).eq("status", "pending"),
    db.from("moderation_reports").select("id", { count: "exact" }).in("status", ["open", "reviewing"]),
    db.from("ad_impressions").select("id", { count: "exact" }),
    db.from("ad_clicks").select("id", { count: "exact" }),
    db.from("calls").select("id", { count: "exact" }).gte("called_at", new Date(Date.now() - 86400000).toISOString())
  ]);

  const placements = placementsResult.data ?? [];
  const activePlacements = placements.filter(
    (placement) =>
      String(placement.status) === "active" &&
      String(placement.starts_at) <= now &&
      (!placement.ends_at || String(placement.ends_at) > now)
  ).length;

  return {
    trackedChannels: channelsResult.count ?? 0,
    trackedTokens: tokensResult.count ?? 0,
    adsTotal: adsResult.count ?? 0,
    activePlacements,
    pendingSubmissions: submissionsResult.count ?? 0,
    openReports: reportsResult.count ?? 0,
    adImpressions: impressionsResult.count ?? 0,
    adClicks: clicksResult.count ?? 0,
    liveCalls24h: liveCallsResult.count ?? 0
  };
}

export async function listAdminChannels() {
  const db = createAdminDb();
  const { data, error } = await db
    .from("channels")
    .select("id, title, slug, status")
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ id: string; title: string; slug: string; status: string }>;
}

export async function listAdminTokens() {
  const db = createAdminDb();
  const { data, error } = await db
    .from("tokens")
    .select("id, symbol, chain, status")
    .order("symbol", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ id: string; symbol: string; chain: string; status: string }>;
}

export async function listAdminAds() {
  const db = createAdminDb();
  const { data, error } = await db
    .from("ads")
    .select("id, label, placement, destination_url, status, starts_at, ends_at, image_url, creative_copy, created_at")
    .order("starts_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as JoinedRecord[]).map((row) => ({
    id:             String(row.id),
    label:          String(row.label),
    placement:      String(row.placement),
    destinationUrl: String(row.destination_url),
    status:         String(row.status),
    startsAt:       String(row.starts_at),
    endsAt:         row.ends_at ? String(row.ends_at) : null,
    imageUrl:       row.image_url ? String(row.image_url) : null,
    imagePath:      null as string | null,   // added by migration — safe fallback
    creativeCopy:   row.creative_copy ? String(row.creative_copy) : null,
  }));
}

export async function listSponsoredPlacements() {
  const db = createAdminDb();
  const { data, error } = await db
    .from("sponsored_placements")
    .select("id, title, surface, placement_subtype, destination_url, status, starts_at, ends_at, priority, logo_url, token_symbol, contract_address, channels(title, slug)")
    .order("starts_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as JoinedRecord[]).map((row) => ({
    id:               String(row.id),
    title:            String(row.title),
    surface:          String(row.surface),
    placementSubtype: String(row.placement_subtype ?? "channel_placement"),
    destinationUrl:   String(row.destination_url),
    status:           String(row.status),
    startsAt:         String(row.starts_at),
    endsAt:           row.ends_at ? String(row.ends_at) : null,
    priority:         toNumber(row.priority),
    logoUrl:          row.logo_url ? String(row.logo_url) : null,
    tokenSymbol:      row.token_symbol ? String(row.token_symbol) : null,
    contractAddress:  row.contract_address ? String(row.contract_address) : null,
    channelTitle:     Array.isArray(row.channels)
      ? String(row.channels[0]?.title ?? "")
      : String(row.channels?.title ?? ""),
    channelSlug:      Array.isArray(row.channels)
      ? String(row.channels[0]?.slug ?? "")
      : String(row.channels?.slug ?? ""),
  }));
}

export async function listPendingSubmissions(limit = 20) {
  const db = createAdminDb();
  const { data, error } = await db
    .from("submissions")
    .select("id, channel_name, telegram_handle, description, fast_track_requested, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{
    id: string;
    channel_name: string;
    telegram_handle: string;
    description: string | null;
    fast_track_requested: boolean;
    created_at: string;
  }>;
}

export async function listModerationReports(limit = 20) {
  const db = createAdminDb();
  const { data, error } = await db
    .from("moderation_reports")
    .select("id, report_type, reason, details, status, created_at, channels(title), tokens(symbol), submissions(channel_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as JoinedRecord[]).map((row) => ({
    id: String(row.id),
    reportType: String(row.report_type),
    reason: String(row.reason),
    details: row.details ? String(row.details) : null,
    status: String(row.status),
    createdAt: String(row.created_at),
    channelTitle: Array.isArray(row.channels)
      ? String(row.channels[0]?.title ?? "")
      : String(row.channels?.title ?? ""),
    tokenSymbol: Array.isArray(row.tokens)
      ? String(row.tokens[0]?.symbol ?? "")
      : String(row.tokens?.symbol ?? ""),
    submissionName: Array.isArray(row.submissions)
      ? String(row.submissions[0]?.channel_name ?? "")
      : String(row.submissions?.channel_name ?? "")
  }));
}

export async function getAnalyticsSummary() {
  const db = createAdminDb();
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

  const [ads, placements, impressions, clicks] = await Promise.all([
    db.from("ads").select("id, label, status"),
    db.from("sponsored_placements").select("id, title, status"),
    db
      .from("ad_impressions")
      .select("id, ad_id, sponsored_placement_id, occurred_at")
      .gte("occurred_at", since),
    db
      .from("ad_clicks")
      .select("id, ad_id, sponsored_placement_id, occurred_at")
      .gte("occurred_at", since)
  ]);

  const adImpressions = new Map<string, number>();
  const placementImpressions = new Map<string, number>();
  const adClicks = new Map<string, number>();
  const placementClicks = new Map<string, number>();

  for (const row of impressions.data ?? []) {
    if (row.ad_id) {
      adImpressions.set(String(row.ad_id), (adImpressions.get(String(row.ad_id)) ?? 0) + 1);
    }

    if (row.sponsored_placement_id) {
      placementImpressions.set(
        String(row.sponsored_placement_id),
        (placementImpressions.get(String(row.sponsored_placement_id)) ?? 0) + 1
      );
    }
  }

  for (const row of clicks.data ?? []) {
    if (row.ad_id) {
      adClicks.set(String(row.ad_id), (adClicks.get(String(row.ad_id)) ?? 0) + 1);
    }

    if (row.sponsored_placement_id) {
      placementClicks.set(
        String(row.sponsored_placement_id),
        (placementClicks.get(String(row.sponsored_placement_id)) ?? 0) + 1
      );
    }
  }

  return {
    windowLabel: "Last 30 days",
    totals: {
      impressions: (impressions.data ?? []).length,
      clicks: (clicks.data ?? []).length,
      ctr:
        (clicks.data ?? []).length > 0 && (impressions.data ?? []).length > 0
          ? ((clicks.data ?? []).length / (impressions.data ?? []).length) * 100
          : 0
    },
    ads: ((ads.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const impressionCount = adImpressions.get(String(row.id)) ?? 0;
      const clickCount = adClicks.get(String(row.id)) ?? 0;

      return {
        id: String(row.id),
        label: String(row.label),
        status: String(row.status),
        impressions: impressionCount,
        clicks: clickCount,
        ctr: impressionCount > 0 ? (clickCount / impressionCount) * 100 : 0
      };
    }),
    placements: ((placements.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const impressionCount = placementImpressions.get(String(row.id)) ?? 0;
      const clickCount = placementClicks.get(String(row.id)) ?? 0;

      return {
        id: String(row.id),
        title: String(row.title),
        status: String(row.status),
        impressions: impressionCount,
        clicks: clickCount,
        ctr: impressionCount > 0 ? (clickCount / impressionCount) * 100 : 0
      };
    })
  };
}