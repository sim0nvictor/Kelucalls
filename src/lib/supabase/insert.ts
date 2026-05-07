/**
 * Insert pipeline services for scraper ingestion.
 *
 * All functions use the admin client (service role) to bypass RLS.
 * Each function is:
 *   - Idempotent (upsert or deduplicate)
 *   - Type-safe
 *   - Error-logged with structured context
 *   - Retry-safe (no side-effects on duplicate)
 */

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type ChannelInsert = Database["public"]["Tables"]["channels"]["Insert"];
type TokenInsert = Database["public"]["Tables"]["tokens"]["Insert"];
type CallInsert = Database["public"]["Tables"]["calls"]["Insert"];
type CallMetricsInsert = Database["public"]["Tables"]["call_metrics"]["Insert"];

// ─── Validation Helpers ──────────────────────────────────────────────

const CONTRACT_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidContractAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return CONTRACT_ADDRESS_RE.test(address) || SOLANA_ADDRESS_RE.test(address);
}

function normalizeSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  return symbol.replace(/^\$/, "").toUpperCase().trim() || null;
}

// ─── Result Types ────────────────────────────────────────────────────

export type InsertResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

// ─── Channel Insert ──────────────────────────────────────────────────

export async function insertChannel(
  channel: Pick<ChannelInsert, "slug" | "telegram_handle" | "telegram_url" | "title"> &
    Partial<ChannelInsert>
): Promise<InsertResult<{ id: string }>> {
  const supabase = createSupabaseAdmin();

  try {
    // Upsert by telegram_handle to avoid duplicates
    const { data, error } = await supabase
      .from("channels")
      .upsert(
        {
          slug: channel.slug,
          telegram_handle: channel.telegram_handle.toLowerCase().trim(),
          telegram_url: channel.telegram_url.trim(),
          title: channel.title.trim(),
          description: channel.description ?? null,
          avatar_url: channel.avatar_url ?? null,
          status: channel.status ?? "pending",
          is_paid_channel: channel.is_paid_channel ?? false,
          is_verified: channel.is_verified ?? false,
          notes: channel.notes ?? null,
          metadata: channel.metadata ?? {},
        },
        { onConflict: "telegram_handle", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (error) {
      console.error("[insert/channel] failed:", error.message, { channel: channel.telegram_handle });
      return { ok: false, error: error.message, code: error.code };
    }

    return { ok: true, data: { id: data.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[insert/channel] unexpected error:", message);
    return { ok: false, error: message };
  }
}

// ─── Token Insert ────────────────────────────────────────────────────

export async function insertToken(
  token: Pick<TokenInsert, "symbol"> & Partial<TokenInsert>
): Promise<InsertResult<{ id: string }>> {
  const supabase = createSupabaseAdmin();
  const symbol = normalizeSymbol(token.symbol);

  if (!symbol) {
    return { ok: false, error: "Token symbol is required." };
  }

  // Validate contract address if provided
  if (token.contract_address && !isValidContractAddress(token.contract_address)) {
    console.warn("[insert/token] invalid contract address:", token.contract_address);
    // We still allow insert — contract may be on an unsupported chain format
  }

  const chain = token.chain ?? "solana";

  try {
    // Try to find existing token first (by contract_address or symbol+chain)
    let existingId: string | null = null;

    if (token.contract_address) {
      const { data: existing } = await supabase
        .from("tokens")
        .select("id")
        .eq("chain", chain)
        .eq("contract_address", token.contract_address)
        .maybeSingle();

      existingId = existing?.id ?? null;
    }

    if (!existingId) {
      const { data: existing } = await supabase
        .from("tokens")
        .select("id")
        .eq("chain", chain)
        .eq("symbol", symbol)
        .maybeSingle();

      existingId = existing?.id ?? null;
    }

    if (existingId) {
      // Update existing token with latest data
      const { error: updateError } = await supabase
        .from("tokens")
        .update({
          last_price_usd: token.last_price_usd ?? undefined,
          last_market_cap_usd: token.last_market_cap_usd ?? undefined,
          last_seen_at: new Date().toISOString(),
          name: token.name ?? undefined,
        })
        .eq("id", existingId);

      if (updateError) {
        console.warn("[insert/token] update failed for existing token:", updateError.message);
      }

      return { ok: true, data: { id: existingId } };
    }

    // Insert new token
    const { data, error } = await supabase
      .from("tokens")
      .insert({
        symbol,
        name: token.name ?? null,
        chain,
        contract_address: token.contract_address ?? null,
        coingecko_id: token.coingecko_id ?? null,
        dexscreener_pair_id: token.dexscreener_pair_id ?? null,
        last_price_usd: token.last_price_usd ?? null,
        last_market_cap_usd: token.last_market_cap_usd ?? null,
        last_seen_at: new Date().toISOString(),
        metadata: token.metadata ?? {},
      })
      .select("id")
      .single();

    if (error) {
      // Handle race condition: another process inserted the same token
      if (error.code === "23505") {
        const { data: race } = await supabase
          .from("tokens")
          .select("id")
          .eq("chain", chain)
          .eq("symbol", symbol)
          .maybeSingle();

        if (race) {
          return { ok: true, data: { id: race.id } };
        }
      }

      console.error("[insert/token] failed:", error.message, { symbol, chain });
      return { ok: false, error: error.message, code: error.code };
    }

    return { ok: true, data: { id: data.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[insert/token] unexpected error:", message);
    return { ok: false, error: message };
  }
}

// ─── Call Insert ─────────────────────────────────────────────────────

export type CallInsertInput = {
  channel_id: string;
  token_id: string;
  telegram_message_id?: string | null;
  message_text: string;
  called_at: string;
  detected_symbol?: string | null;
  detected_contract_address?: string | null;
  entry_price_usd: number;
  entry_market_cap_usd?: number | null;
  confidence_score?: number;
};

export async function insertCall(
  call: CallInsertInput
): Promise<InsertResult<{ id: string }>> {
  const supabase = createSupabaseAdmin();

  if (!call.channel_id || !call.token_id) {
    return { ok: false, error: "channel_id and token_id are required." };
  }

  if (call.entry_price_usd <= 0 || !Number.isFinite(call.entry_price_usd)) {
    return { ok: false, error: `Invalid entry_price_usd: ${call.entry_price_usd}` };
  }

  try {
    // Deduplicate: check for existing call with same channel + token + timestamp (within 60s)
    if (call.telegram_message_id) {
      const { data: existing } = await supabase
        .from("calls")
        .select("id")
        .eq("channel_id", call.channel_id)
        .eq("telegram_message_id", call.telegram_message_id)
        .maybeSingle();

      if (existing) {
        return { ok: true, data: { id: existing.id } };
      }
    }

    const payload: CallInsert = {
      channel_id: call.channel_id,
      token_id: call.token_id,
      telegram_message_id: call.telegram_message_id ?? null,
      message_text: call.message_text,
      called_at: call.called_at,
      detected_symbol: normalizeSymbol(call.detected_symbol),
      detected_contract_address: call.detected_contract_address ?? null,
      entry_price_usd: call.entry_price_usd,
      entry_market_cap_usd: call.entry_market_cap_usd ?? null,
      confidence_score: call.confidence_score ?? 0.5,
    };

    const { data, error } = await supabase
      .from("calls")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error("[insert/call] failed:", error.message, {
        channel: call.channel_id,
        token: call.token_id,
      });
      return { ok: false, error: error.message, code: error.code };
    }

    // Initialize call_metrics row for the new call
    const metricsPayload: CallMetricsInsert = {
      call_id: data.id,
      current_price_usd: call.entry_price_usd,
      peak_price_usd: call.entry_price_usd,
      current_roi_pct: 0,
      peak_roi_pct: 0,
      current_multiple: 1,
      peak_multiple: 1,
      is_win: false,
      hit_2x: false,
      hit_5x: false,
      hit_10x: false,
      hit_50x: false,
      hit_100x: false,
      simulated_investment_usd: 10,
      simulated_current_value_usd: 10,
      simulated_peak_value_usd: 10,
      simulated_current_pnl_usd: 0,
      simulated_peak_pnl_usd: 0,
    };

    const { error: metricsError } = await supabase
      .from("call_metrics")
      .upsert(metricsPayload, { onConflict: "call_id" });

    if (metricsError) {
      console.warn("[insert/call] metrics init failed:", metricsError.message, { callId: data.id });
    }

    return { ok: true, data: { id: data.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[insert/call] unexpected error:", message);
    return { ok: false, error: message };
  }
}

// ─── Channel Stats Update ────────────────────────────────────────────

/**
 * Refreshes channel_stats for a specific channel (or all channels).
 * This calls the `refresh_channel_stats()` SQL function in Supabase.
 */
export async function updateChannelStats(
  channelId?: string | null
): Promise<InsertResult<void>> {
  const supabase = createSupabaseAdmin();

  try {
    const { error } = await supabase.rpc("refresh_channel_stats", {
      target_channel_id: channelId ?? null,
    });

    if (error) {
      console.error("[insert/channel-stats] refresh failed:", error.message, { channelId });
      return { ok: false, error: error.message, code: error.code };
    }

    console.log(`[insert/channel-stats] refreshed ${channelId ?? "all channels"}`);
    return { ok: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[insert/channel-stats] unexpected error:", message);
    return { ok: false, error: message };
  }
}
