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

// ============================================================================
// Insights / Articles System
// ============================================================================

export async function listArticleCategories() {
  const db = createAdminDb();
  const { data, error } = await db
    .from("article_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
}

export async function listArticleTags() {
  const db = createAdminDb();
  const { data, error } = await db
    .from("article_tags")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    created_at: string;
  }>;
}

export async function listArticles(options?: {
  status?: string;
  categoryId?: string;
  limit?: number;
  offset?: number;
}) {
  const db = createAdminDb();
  let query = db
    .from("articles")
    .select(`
      *,
      category:article_categories(id, name, slug, color)
    `)
    .order("created_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 10) - 1);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    articles: (data ?? []) as Array<Record<string, unknown>>,
    total: count ?? 0
  };
}

export async function getArticleById(id: string) {
  const db = createAdminDb();
  const { data, error } = await db
    .from("articles")
    .select(`
      *,
      category:article_categories(id, name, slug, color),
      tags:article_tags_junction(
        tag:article_tags(id, name, slug)
      )
    `)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function createArticle(article: {
  title: string;
  slug: string;
  summary?: string;
  content: string;
  featured_image_url?: string;
  featured_image_alt?: string;
  author?: string;
  author_avatar_url?: string;
  category_id?: string;
  status?: string;
  published_at?: string;
  scheduled_at?: string;
  is_featured?: boolean;
  is_trending?: boolean;
  is_editor_pick?: boolean;
  reading_time_minutes?: number;
  seo_title?: string;
  meta_description?: string;
  canonical_url?: string;
  keywords?: string[];
  open_graph_image_url?: string;
  twitter_card?: string;
  linked_token_id?: string;
  linked_channel_id?: string;
  tag_ids?: string[];
}) {
  const db = createAdminDb();

  const articleData = {
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    content: article.content,
    featured_image_url: article.featured_image_url,
    featured_image_alt: article.featured_image_alt,
    author: article.author ?? "Kelucalls Team",
    author_avatar_url: article.author_avatar_url,
    category_id: article.category_id,
    status: article.status ?? "draft",
    published_at: article.published_at,
    scheduled_at: article.scheduled_at,
    is_featured: article.is_featured ?? false,
    is_trending: article.is_trending ?? false,
    is_editor_pick: article.is_editor_pick ?? false,
    reading_time_minutes: article.reading_time_minutes ?? 5,
    seo_title: article.seo_title,
    meta_description: article.meta_description,
    canonical_url: article.canonical_url,
    keywords: article.keywords,
    open_graph_image_url: article.open_graph_image_url,
    twitter_card: article.twitter_card ?? "summary_large_image",
    linked_token_id: article.linked_token_id,
    linked_channel_id: article.linked_channel_id
  };

  const { data, error } = await db
    .from("articles")
    .insert(articleData)
    .select()
    .single();

  if (error) throw error;

  // Add tags if provided
  if (article.tag_ids && article.tag_ids.length > 0 && data) {
    const tagJunctions = article.tag_ids.map((tagId) => ({
      article_id: data.id,
      tag_id: tagId
    }));

    await db.from("article_tags_junction").insert(tagJunctions);
  }

  return data;
}

export async function updateArticle(
  id: string,
  article: {
    title?: string;
    slug?: string;
    summary?: string;
    content?: string;
    featured_image_url?: string;
    featured_image_alt?: string;
    author?: string;
    author_avatar_url?: string;
    category_id?: string;
    status?: string;
    published_at?: string;
    scheduled_at?: string;
    is_featured?: boolean;
    is_trending?: boolean;
    is_editor_pick?: boolean;
    reading_time_minutes?: number;
    seo_title?: string;
    meta_description?: string;
    canonical_url?: string;
    keywords?: string[];
    open_graph_image_url?: string;
    twitter_card?: string;
    linked_token_id?: string;
    linked_channel_id?: string;
    tag_ids?: string[];
  }
) {
  const db = createAdminDb();

  const updateData: Record<string, unknown> = {};
  if (article.title !== undefined) updateData.title = article.title;
  if (article.slug !== undefined) updateData.slug = article.slug;
  if (article.summary !== undefined) updateData.summary = article.summary;
  if (article.content !== undefined) updateData.content = article.content;
  if (article.featured_image_url !== undefined) updateData.featured_image_url = article.featured_image_url;
  if (article.featured_image_alt !== undefined) updateData.featured_image_alt = article.featured_image_alt;
  if (article.author !== undefined) updateData.author = article.author;
  if (article.author_avatar_url !== undefined) updateData.author_avatar_url = article.author_avatar_url;
  if (article.category_id !== undefined) updateData.category_id = article.category_id;
  if (article.status !== undefined) updateData.status = article.status;
  if (article.published_at !== undefined) updateData.published_at = article.published_at;
  if (article.scheduled_at !== undefined) updateData.scheduled_at = article.scheduled_at;
  if (article.is_featured !== undefined) updateData.is_featured = article.is_featured;
  if (article.is_trending !== undefined) updateData.is_trending = article.is_trending;
  if (article.is_editor_pick !== undefined) updateData.is_editor_pick = article.is_editor_pick;
  if (article.reading_time_minutes !== undefined) updateData.reading_time_minutes = article.reading_time_minutes;
  if (article.seo_title !== undefined) updateData.seo_title = article.seo_title;
  if (article.meta_description !== undefined) updateData.meta_description = article.meta_description;
  if (article.canonical_url !== undefined) updateData.canonical_url = article.canonical_url;
  if (article.keywords !== undefined) updateData.keywords = article.keywords;
  if (article.open_graph_image_url !== undefined) updateData.open_graph_image_url = article.open_graph_image_url;
  if (article.twitter_card !== undefined) updateData.twitter_card = article.twitter_card;
  if (article.linked_token_id !== undefined) updateData.linked_token_id = article.linked_token_id;
  if (article.linked_channel_id !== undefined) updateData.linked_channel_id = article.linked_channel_id;

  const { data, error } = await db
    .from("articles")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // Update tags if provided
  if (article.tag_ids !== undefined) {
    // Delete existing tags
    await db.from("article_tags_junction").delete().eq("article_id", id);

    // Add new tags
    if (article.tag_ids.length > 0) {
      const tagJunctions = article.tag_ids.map((tagId) => ({
        article_id: id,
        tag_id: tagId
      }));
      await db.from("article_tags_junction").insert(tagJunctions);
    }
  }

  return data;
}

export async function deleteArticle(id: string) {
  const db = createAdminDb();
  const { error } = await db.from("articles").delete().eq("id", id);
  if (error) throw error;
}

export async function createArticleCategory(category: {
  name: string;
  slug: string;
  description?: string;
  color?: string;
  icon?: string;
  sort_order?: number;
}) {
  const db = createAdminDb();
  const { data, error } = await db
    .from("article_categories")
    .insert({
      name: category.name,
      slug: category.slug,
      description: category.description,
      color: category.color ?? "#22d3ee",
      icon: category.icon,
      sort_order: category.sort_order ?? 0
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateArticleCategory(
  id: string,
  category: {
    name?: string;
    slug?: string;
    description?: string;
    color?: string;
    icon?: string;
    sort_order?: number;
    is_active?: boolean;
  }
) {
  const db = createAdminDb();
  const { data, error } = await db
    .from("article_categories")
    .update(category)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteArticleCategory(id: string) {
  const db = createAdminDb();
  const { error } = await db.from("article_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function createArticleTag(tag: {
  name: string;
  slug: string;
}) {
  const db = createAdminDb();
  const { data, error } = await db
    .from("article_tags")
    .insert({
      name: tag.name,
      slug: tag.slug
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteArticleTag(id: string) {
  const db = createAdminDb();
  const { error } = await db.from("article_tags").delete().eq("id", id);
  if (error) throw error;
}

export async function getInsightsStats() {
  const db = createAdminDb();

  const [
    totalArticles,
    publishedArticles,
    draftArticles,
    scheduledArticles,
    totalViews,
    categoriesResult
  ] = await Promise.all([
    db.from("articles").select("id", { count: "exact" }),
    db.from("articles").select("id", { count: "exact" }).eq("status", "published"),
    db.from("articles").select("id", { count: "exact" }).eq("status", "draft"),
    db.from("articles").select("id", { count: "exact" }).eq("status", "scheduled"),
    db.from("article_views").select("id", { count: "exact" }),
    db.from("article_categories").select("id, name, slug")
  ]);

  return {
    totalArticles: totalArticles.count ?? 0,
    publishedArticles: publishedArticles.count ?? 0,
    draftArticles: draftArticles.count ?? 0,
    scheduledArticles: scheduledArticles.count ?? 0,
    totalViews: totalViews.count ?? 0,
    categories: (categoriesResult.data ?? []) as Array<{ id: string; name: string; slug: string }>
  };
}