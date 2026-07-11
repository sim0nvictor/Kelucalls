import { supabase } from "../db/client.js";

// ---------------------------------------------------------------------------
// Global "all alerts" subscription (used by /start)
// ---------------------------------------------------------------------------

export async function subscribeToAlerts(userId: string): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from("telegram_subscriptions")
    .select("id")
    .eq("telegram_user_id", userId)
    .eq("subscription_type", "all")
    .maybeSingle();

  if (readError) throw readError;

  const query = existing
    ? supabase.from("telegram_subscriptions").update({ is_active: true }).eq("id", existing.id)
    : supabase.from("telegram_subscriptions").insert({
        telegram_user_id: userId,
        subscription_type: "all",
        is_active: true
      });

  const { error } = await query;
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Channel-specific subscription (used by /sub @handle)
// ---------------------------------------------------------------------------

export async function subscribeToChannel(userId: string, channelId: string): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from("telegram_subscriptions")
    .select("id")
    .eq("telegram_user_id", userId)
    .eq("subscription_type", "channel")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (readError) throw readError;

  const query = existing
    ? supabase.from("telegram_subscriptions").update({ is_active: true }).eq("id", existing.id)
    : supabase.from("telegram_subscriptions").insert({
        telegram_user_id: userId,
        subscription_type: "channel",
        channel_id: channelId,
        is_active: true
      });

  const { error } = await query;
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Unsubscribe from a specific channel
// ---------------------------------------------------------------------------

export async function unsubscribeFromChannel(userId: string, channelId: string): Promise<void> {
  const { error } = await supabase
    .from("telegram_subscriptions")
    .update({ is_active: false })
    .eq("telegram_user_id", userId)
    .eq("subscription_type", "channel")
    .eq("channel_id", channelId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Unsubscribe from everything
// ---------------------------------------------------------------------------

export async function unsubscribeFromAlerts(userId: string): Promise<void> {
  const { error } = await supabase
    .from("telegram_subscriptions")
    .update({ is_active: false })
    .eq("telegram_user_id", userId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// List active subscriptions with channel title resolved
// ---------------------------------------------------------------------------

export async function listSubscriptions(userId: string) {
  const { data, error } = await supabase
    .from("telegram_subscriptions")
    .select("id, subscription_type, chain, channel_id, token_id, is_active, created_at")
    .eq("telegram_user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = data ?? [];

  // Resolve channel titles for channel-specific subs
  const channelIds = rows
    .filter((r) => r.subscription_type === "channel" && r.channel_id)
    .map((r) => r.channel_id as string);

  let channelMap: Record<string, string> = {};

  if (channelIds.length > 0) {
    const { data: channels } = await supabase
      .from("channels")
      .select("id, title, telegram_handle")
      .in("id", channelIds);

    channelMap = Object.fromEntries(
      (channels ?? []).map((c) => [c.id, `${c.title} (${c.telegram_handle})`])
    );
  }

  return rows.map((row) => ({
    ...row,
    channelLabel: row.channel_id ? (channelMap[row.channel_id] ?? "Unknown channel") : null
  }));
}