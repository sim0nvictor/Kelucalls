import { supabase } from "../db/client.js";
import type { CallAlertRow, TopKolRow, TrendingTokenRow } from "../types/domain.js";

export async function getTrendingTokens(limit = 10): Promise<TrendingTokenRow[]> {
  const { data, error } = await supabase
    .from("trending_tokens")
    .select("*")
    .order("unique_channels", { ascending: false })
    .order("total_calls", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TrendingTokenRow[];
}

export async function getTopKols(limit = 10): Promise<TopKolRow[]> {
  const { data, error } = await supabase
    .from("channel_stats")
    .select("channel_id, ranking_score, win_rate_pct, best_multiple, total_calls, channels (title, slug, telegram_handle, is_verified)")
    .order("ranking_score", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as TopKolRow[];
}

export async function getCallAlert(callId: string): Promise<CallAlertRow | null> {
  const { data, error } = await supabase
    .from("calls")
    .select(`
      id,
      channel_id,
      token_id,
      called_at,
      detected_symbol,
      detected_contract_address,
      telegram_message_id,
      entry_price_usd,
      confidence_score,
      channels (title, slug, telegram_handle, telegram_url, is_verified),
      tokens (symbol, chain, contract_address),
      call_metrics (current_roi_pct, peak_multiple)
    `)
    .eq("id", callId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as CallAlertRow | null;
}

export async function getTrendingTokenById(tokenId: string): Promise<TrendingTokenRow | null> {
  const { data, error } = await supabase
    .from("trending_tokens")
    .select("*")
    .eq("id", tokenId)
    .maybeSingle();

  if (error) throw error;
  return data as TrendingTokenRow | null;
}

// ---------------------------------------------------------------------------
// Channel lookup — used by /sub and /unsub commands
// ---------------------------------------------------------------------------

export type ChannelRow = {
  id: string;
  title: string;
  telegram_handle: string;
  slug: string;
  is_verified: boolean;
};

/**
 * Look up a channel by its Telegram handle.
 * Accepts with or without the @ prefix: "@TradersGamble" or "TradersGamble"
 */
export async function getChannelByHandle(handle: string): Promise<ChannelRow | null> {
  const normalized = handle.startsWith("@") ? handle : `@${handle}`;

  const { data, error } = await supabase
    .from("channels")
    .select("id, title, telegram_handle, slug, is_verified")
    .ilike("telegram_handle", normalized)
    .in("status", ["active", "paused"])
    .maybeSingle();

  if (error) throw error;
  return data as ChannelRow | null;
}

/**
 * Get all tracked channels for the /sub browse list.
 */
export async function getAllChannels(limit = 20): Promise<ChannelRow[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("id, title, telegram_handle, slug, is_verified")
    .in("status", ["active", "paused"])
    .order("title", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ChannelRow[];
}
