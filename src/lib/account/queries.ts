import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

/**
 * Read helpers for the signed-in user's account area.
 *
 * All of these run under the user's own JWT, so RLS scopes every row to that
 * user automatically - there is no `.eq("user_id", ...)` filter to forget.
 * The explicit filters that do appear are belt and braces only.
 *
 * Everything is wrapped in cache() so a page that renders a count in the nav
 * and the same list in the body only queries once.
 */

export type WatchedChannel = {
  id: string;
  slug: string;
  title: string;
  telegramHandle: string;
  avatarUrl: string | null;
  isVerified: boolean;
  status: string;
};

export type WatchlistEntry = {
  id: string;
  createdAt: string;
  isMuted: boolean;
  notes: string | null;
  channel: WatchedChannel | null;
};

export type AlertRule = {
  id: string;
  ruleType: string;
  isActive: boolean;
  deliveryChannels: string[];
  lastTriggeredAt: string | null;
  createdAt: string;
  channel: { id: string; slug: string; title: string } | null;
};

export type AccountSubmission = {
  id: string;
  channelName: string;
  telegramHandle: string;
  status: string;
  reviewNotes: string | null;
  approvedChannelId: string | null;
  createdAt: string;
};

export type AccountNotification = {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

const CHANNEL_FIELDS = "id, slug, title, telegram_handle, avatar_url, is_verified, status";

type RawChannel = {
  id: string;
  slug: string;
  title: string;
  telegram_handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  status: string;
};

/**
 * PostgREST returns a to-one embed as an object, but the generated types often
 * widen it to an array. Normalising here keeps that mess out of the pages.
 */
function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toWatchedChannel(raw: RawChannel | null): WatchedChannel | null {
  if (!raw) return null;
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    telegramHandle: raw.telegram_handle,
    avatarUrl: raw.avatar_url,
    isVerified: raw.is_verified,
    status: raw.status
  };
}

export const getWatchlist = cache(async (): Promise<WatchlistEntry[]> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("user_channel_watchlist")
    .select(`id, created_at, is_muted, notes, channel:channels ( ${CHANNEL_FIELDS} )`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[account] failed to load watchlist:", error);
    return [];
  }

  type Row = {
    id: string;
    created_at: string;
    is_muted: boolean;
    notes: string | null;
    channel: RawChannel | RawChannel[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    isMuted: row.is_muted,
    notes: row.notes,
    channel: toWatchedChannel(firstRelation(row.channel))
  }));
});

/** Channel ids the current user follows. Cheap lookup for follow buttons. */
export const getFollowedChannelIds = cache(async (): Promise<Set<string>> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return new Set();

  const { data, error } = await supabase
    .from("user_channel_watchlist")
    .select("channel_id");

  if (error) {
    console.error("[account] failed to load followed channel ids:", error);
    return new Set();
  }

  return new Set(((data ?? []) as Array<{ channel_id: string }>).map((r) => r.channel_id));
});

export async function isFollowingChannel(channelId: string): Promise<boolean> {
  const ids = await getFollowedChannelIds();
  return ids.has(channelId);
}

export const getAlertRules = cache(async (): Promise<AlertRule[]> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("user_alert_rules")
    .select(
      "id, rule_type, is_active, delivery_channels, last_triggered_at, created_at, channel:channels ( id, slug, title )"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[account] failed to load alert rules:", error);
    return [];
  }

  type Row = {
    id: string;
    rule_type: string;
    is_active: boolean;
    delivery_channels: string[] | null;
    last_triggered_at: string | null;
    created_at: string;
    channel: { id: string; slug: string; title: string } | Array<{ id: string; slug: string; title: string }> | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    ruleType: row.rule_type,
    isActive: row.is_active,
    deliveryChannels: row.delivery_channels ?? [],
    lastTriggeredAt: row.last_triggered_at,
    createdAt: row.created_at,
    channel: firstRelation(row.channel)
  }));
});

export const getAccountSubmissions = cache(async (): Promise<AccountSubmission[]> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id, channel_name, telegram_handle, status, review_notes, approved_channel_id, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[account] failed to load submissions:", error);
    return [];
  }

  type Row = {
    id: string;
    channel_name: string;
    telegram_handle: string;
    status: string;
    review_notes: string | null;
    approved_channel_id: string | null;
    created_at: string;
  };

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    channelName: row.channel_name,
    telegramHandle: row.telegram_handle,
    status: row.status,
    reviewNotes: row.review_notes,
    approvedChannelId: row.approved_channel_id,
    createdAt: row.created_at
  }));
});

export const getRecentNotifications = cache(
  async (limit = 10): Promise<AccountNotification[]> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("user_notifications")
      .select("id, title, body, url, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[account] failed to load notifications:", error);
      return [];
    }

    type Row = {
      id: string;
      title: string;
      body: string | null;
      url: string | null;
      read_at: string | null;
      created_at: string;
    };

    return ((data ?? []) as Row[]).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      url: row.url,
      readAt: row.read_at,
      createdAt: row.created_at
    }));
  }
);

/** Counts for the dashboard tiles. */
export const getAccountOverview = cache(async () => {
  const [watchlist, alertRules, submissions, notifications] = await Promise.all([
    getWatchlist(),
    getAlertRules(),
    getAccountSubmissions(),
    getRecentNotifications(5)
  ]);

  return {
    watchlistCount: watchlist.length,
    activeAlertCount: alertRules.filter((rule) => rule.isActive).length,
    submissionCount: submissions.length,
    pendingSubmissionCount: submissions.filter((s) => s.status === "pending").length,
    unreadCount: notifications.filter((n) => !n.readAt).length,
    notifications
  };
});
