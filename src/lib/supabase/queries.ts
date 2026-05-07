/**
 * Optimized query services with pagination, sorting, and filtering.
 */

import { getSupabaseServer, isSupabaseServerConfigured } from "@/lib/supabase/server";

export type PaginationParams = { page?: number; pageSize?: number };
export type SortParams<T extends string = string> = { sortBy?: T; sortOrder?: "asc" | "desc" };
export type PaginatedResult<T> = { data: T[]; page: number; pageSize: number; total: number; totalPages: number };

function paginationRange(page = 1, pageSize = 20) {
  const p = Math.max(1, page);
  const s = Math.min(Math.max(1, pageSize), 100);
  return { from: (p - 1) * s, to: (p - 1) * s + s - 1 };
}

function emptyPage<T>(page = 1, pageSize = 20): PaginatedResult<T> {
  return { data: [], page, pageSize, total: 0, totalPages: 0 };
}

// ─── Trending Tokens ─────────────────────────────────────────────────

export type TrendingTokenSort = "total_calls" | "unique_channels" | "average_roi_pct" | "best_multiple";
export type TrendingTokenFilter = { chain?: string; minCalls?: number; minChannels?: number };

export async function getTrendingTokens(
  pagination?: PaginationParams,
  sort?: SortParams<TrendingTokenSort>,
  filter?: TrendingTokenFilter
): Promise<PaginatedResult<Record<string, unknown>>> {
  if (!isSupabaseServerConfigured()) return emptyPage(pagination?.page, pagination?.pageSize);
  const supabase = getSupabaseServer();
  const { from, to } = paginationRange(pagination?.page, pagination?.pageSize);
  const sortBy = sort?.sortBy ?? "unique_channels";

  let query = supabase.from("trending_tokens").select("*", { count: "exact" });
  if (filter?.chain) query = query.eq("chain", filter.chain);
  if (filter?.minCalls) query = query.gte("total_calls", filter.minCalls);
  if (filter?.minChannels) query = query.gte("unique_channels", filter.minChannels);

  const { data, error, count } = await query.order(sortBy, { ascending: sort?.sortOrder === "asc" }).range(from, to);
  if (error) { console.error("[query/trending]", error.message); return emptyPage(pagination?.page, pagination?.pageSize); }

  const total = count ?? 0;
  const ps = pagination?.pageSize ?? 20;
  return { data: (data ?? []) as Record<string, unknown>[], page: pagination?.page ?? 1, pageSize: ps, total, totalPages: Math.ceil(total / ps) };
}

// ─── Top Channels ────────────────────────────────────────────────────

export type TopChannelSort = "ranking_score" | "win_rate_pct" | "average_roi_pct" | "simulated_current_pnl_usd" | "total_calls";
export type TopChannelFilter = { minCalls?: number; verifiedOnly?: boolean };

export async function getTopChannels(
  pagination?: PaginationParams,
  sort?: SortParams<TopChannelSort>,
  filter?: TopChannelFilter
): Promise<PaginatedResult<Record<string, unknown>>> {
  if (!isSupabaseServerConfigured()) return emptyPage(pagination?.page, pagination?.pageSize);
  const supabase = getSupabaseServer();
  const { from, to } = paginationRange(pagination?.page, pagination?.pageSize);

  let query = supabase.from("channel_stats").select(`*, channels (slug, title, telegram_handle, telegram_url, is_verified, status)`, { count: "exact" });
  if (filter?.minCalls) query = query.gte("total_calls", filter.minCalls);

  const { data, error, count } = await query.order(sort?.sortBy ?? "ranking_score", { ascending: sort?.sortOrder === "asc" }).range(from, to);
  if (error) { console.error("[query/top-channels]", error.message); return emptyPage(pagination?.page, pagination?.pageSize); }

  let rows = (data ?? []) as Record<string, unknown>[];
  if (filter?.verifiedOnly) {
    rows = rows.filter((r) => {
      const ch = Array.isArray(r.channels) ? r.channels[0] : r.channels;
      return ch && typeof ch === "object" && (ch as Record<string, unknown>).is_verified === true;
    });
  }

  const total = count ?? 0;
  const ps = pagination?.pageSize ?? 20;
  return { data: rows, page: pagination?.page ?? 1, pageSize: ps, total, totalPages: Math.ceil(total / ps) };
}

// ─── Recent Calls ────────────────────────────────────────────────────

export type RecentCallFilter = { channelId?: string; tokenId?: string; status?: "open" | "closed" | "invalid" };

export async function getRecentCalls(
  pagination?: PaginationParams,
  filter?: RecentCallFilter
): Promise<PaginatedResult<Record<string, unknown>>> {
  if (!isSupabaseServerConfigured()) return emptyPage(pagination?.page, pagination?.pageSize);
  const supabase = getSupabaseServer();
  const { from, to } = paginationRange(pagination?.page, pagination?.pageSize);

  let query = supabase.from("calls").select(`id, channel_id, token_id, called_at, detected_symbol, detected_contract_address, entry_price_usd, status, channels (slug, title), tokens (symbol, chain), call_metrics (current_roi_pct, peak_multiple, is_win)`, { count: "exact" });
  if (filter?.channelId) query = query.eq("channel_id", filter.channelId);
  if (filter?.tokenId) query = query.eq("token_id", filter.tokenId);
  if (filter?.status) query = query.eq("status", filter.status);

  const { data, error, count } = await query.order("called_at", { ascending: false }).range(from, to);
  if (error) { console.error("[query/recent-calls]", error.message); return emptyPage(pagination?.page, pagination?.pageSize); }

  const total = count ?? 0;
  const ps = pagination?.pageSize ?? 20;
  return { data: (data ?? []) as Record<string, unknown>[], page: pagination?.page ?? 1, pageSize: ps, total, totalPages: Math.ceil(total / ps) };
}

// ─── Token Performance ───────────────────────────────────────────────

export async function getTokenPerformance(tokenId: string): Promise<Record<string, unknown> | null> {
  if (!isSupabaseServerConfigured()) return null;
  const supabase = getSupabaseServer();

  const { data: token, error: te } = await supabase.from("tokens").select("id, symbol, name, chain, contract_address, last_price_usd").eq("id", tokenId).maybeSingle();
  if (te || !token) return null;

  const { data: calls } = await supabase.from("calls").select("channel_id, entry_price_usd, call_metrics (current_roi_pct, peak_multiple, is_win)").eq("token_id", tokenId);
  const rows = calls ?? [];
  const channels = new Set(rows.map((c) => c.channel_id));
  let totalRoi = 0, best = 1, wins = 0, losses = 0, totalEntry = 0;

  for (const c of rows) {
    totalEntry += Number(c.entry_price_usd);
    const m = (Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics) as Record<string, unknown> | null;
    if (m) {
      totalRoi += Number(m.current_roi_pct ?? 0);
      const pm = Number(m.peak_multiple ?? 1);
      if (pm > best) best = pm;
      if (m.is_win) wins++; else losses++;
    }
  }

  const n = rows.length;
  return { ...token, total_calls: n, channels_calling: channels.size, average_entry_price: n > 0 ? totalEntry / n : 0, average_roi_pct: n > 0 ? totalRoi / n : 0, best_multiple: best, win_count: wins, loss_count: losses, win_rate_pct: n > 0 ? (wins / n) * 100 : 0 };
}

// ─── Channel Stats ───────────────────────────────────────────────────

export async function getChannelStats(channelId: string): Promise<Record<string, unknown> | null> {
  if (!isSupabaseServerConfigured()) return null;
  const supabase = getSupabaseServer();

  const { data, error } = await supabase.from("channel_stats").select(`*, channels (slug, title, telegram_handle, is_verified)`).eq("channel_id", channelId).maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}
