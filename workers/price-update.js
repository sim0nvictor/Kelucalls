/**
 * Price Update Worker
 *
 * Polls DexScreener API to update current prices for active calls.
 * Updates call_metrics table with current_price_usd and peak_price_usd.
 * Inserts bot_events rows when a call first crosses a milestone (2x/10x/100x).
 *
 * Runs every 5 minutes.
 */

import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

// Structured logging
const LOG_LEVELS = { ERROR: "ERROR", WARN: "WARN", INFO: "INFO", DEBUG: "DEBUG" };
function log(level, component, message, meta = {}) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, level, component, message, ...meta }));
}

// Configuration
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 50;
const DEX_API_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Milestones the bot announces, in ascending order.
// We track which ones have already been announced per call to avoid duplicates.
const ACHIEVEMENT_MILESTONES = [
  { key: "2x",   field: "hit_2x",   multiple: 2   },
  { key: "10x",  field: "hit_10x",  multiple: 10  },
  { key: "100x", field: "hit_100x", multiple: 100 },
];

// Get environment
function getEnv(name, fallback = null) {
  return process.env[name] ?? fallback;
}

function getSupabaseConfig() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL") || getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_KEY");
  if (!url || !key) throw new Error("Missing Supabase config");
  return { url, key };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapDexChain(value) {
  const normalized = String(value || "").toLowerCase();
  if (["solana", "sol"].includes(normalized)) return "solana";
  if (["ethereum", "eth"].includes(normalized)) return "ethereum";
  if (["bsc", "binance-smart-chain"].includes(normalized)) return "bsc";
  if (["base"].includes(normalized)) return "base";
  if (["arbitrum", "arb"].includes(normalized)) return "arbitrum";
  if (["polygon", "matic"].includes(normalized)) return "polygon";
  if (["avalanche", "avax"].includes(normalized)) return "avalanche";
  if (["sui"].includes(normalized)) return "sui";
  if (["tron", "trx"].includes(normalized)) return "tron";
  return "other";
}

async function fetchDexSnapshot(contractAddress, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(contractAddress)}`,
        { timeout: DEX_API_TIMEOUT_MS }
      );
      const pair = data?.pairs?.[0];
      if (!pair) return null;

      const price = pair.priceUsd == null ? null : Number(pair.priceUsd);
      const marketCap = pair.marketCap == null ? null : Number(pair.marketCap);
      return {
        priceUsd: Number.isFinite(price) ? price : null,
        marketCapUsd: Number.isFinite(marketCap) ? marketCap : null,
        chain: mapDexChain(pair.chainId),
        // DexScreener omits `info` on thin-liquidity / brand-new pairs — guard for it.
        logoUrl: pair.info?.imageUrl ?? null
      };
    } catch (err) {
      log(LOG_LEVELS.WARN, "dex", `Snapshot fetch failed (attempt ${attempt}/${retries})`, {
        contract: contractAddress,
        error: err.message
      });
      if (attempt < retries) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  return null;
}

async function getOpenCalls(supabase) {
  const { data, error } = await supabase
    .from("calls")
    .select("id, token_id, entry_price_usd, called_at, channel_id, tokens!inner(contract_address, chain)")
    .eq("status", "open")
    .not("tokens.contract_address", "is", null)
    .order("called_at", { ascending: false })
    .limit(500);

  if (error) {
    log(LOG_LEVELS.ERROR, "db", "Failed to fetch open calls", { error: error.message });
    return [];
  }

  return data ?? [];
}

// ---------------------------------------------------------------------------
// insertMilestoneEvents
//
// After a call_metrics upsert we check if any milestones were just crossed
// for the first time. We do this by reading the PREVIOUS peak_multiple from
// the existing row (captured before the upsert) and comparing to the new one.
//
// A bot_event row is inserted only when:
//   - the milestone is newly crossed in this update cycle (priorPeak < threshold <= newPeak)
//
// This guarantees each milestone fires exactly once per call, even if the
// worker restarts or the row is updated many times.
// ---------------------------------------------------------------------------
async function insertMilestoneEvents(supabase, { callId, channelId, tokenId, priorPeakMultiple, newPeakMultiple }) {
  const newEvents = ACHIEVEMENT_MILESTONES.filter(({ multiple }) => {
    const wasAlreadyHit = priorPeakMultiple != null && priorPeakMultiple >= multiple;
    const isHitNow = newPeakMultiple >= multiple;
    return isHitNow && !wasAlreadyHit;
  });

  if (newEvents.length === 0) return;

  const rows = newEvents.map(({ key, multiple }) => ({
    event_type: "achievement",
    call_id: callId,
    channel_id: channelId ?? null,
    token_id: tokenId ?? null,
    payload: { milestone: key, multiple }
  }));

  const { error } = await supabase.from("bot_events").insert(rows);

  if (error) {
    log(LOG_LEVELS.ERROR, "db", "Failed to insert milestone bot_events", {
      callId,
      milestones: newEvents.map(e => e.key),
      error: error.message
    });
  } else {
    log(LOG_LEVELS.INFO, "milestones", "Inserted milestone bot_events", {
      callId,
      milestones: newEvents.map(e => e.key)
    });
  }
}

async function updateCallMetrics(supabase, updates) {
  if (updates.length === 0) return;

  for (const update of updates) {
    const { data: existing } = await supabase
      .from("call_metrics")
      .select("peak_price_usd, peak_multiple")
      .eq("call_id", update.callId)
      .maybeSingle();

    if (update.currentPrice === null) continue;

    // If the call has no entry price recorded yet, use the first price
    // we see from DexScreener as the entry. This handles calls that were
    // backfilled before DexScreener had data for the token.
    let entryPrice = Number(update.entryPriceUsd);
    if (!entryPrice || entryPrice <= 0) {
      entryPrice = update.currentPrice;
      // Backfill the entry price on the calls row so future cycles use it
      await supabase
        .from("calls")
        .update({ entry_price_usd: update.currentPrice })
        .eq("id", update.callId);
    }

    const priorPeak = existing?.peak_price_usd == null
      ? null
      : Number(existing.peak_price_usd);
    const priorPeakMultiple = existing?.peak_multiple == null
      ? null
      : Number(existing.peak_multiple);
    const peakPrice = priorPeak == null
      ? update.currentPrice
      : Math.max(priorPeak, update.currentPrice);
    const currentMultiple = entryPrice > 0 ? update.currentPrice / entryPrice : 1;
    const peakMultiple    = entryPrice > 0 ? peakPrice / entryPrice : 1;
    const currentValue    = 10 * currentMultiple;
    const peakValue       = 10 * peakMultiple;

    const { error } = await supabase
      .from("call_metrics")
      .upsert({
        call_id: update.callId,
        current_price_usd: update.currentPrice,
        current_market_cap_usd: update.currentMarketCapUsd,
        peak_price_usd: peakPrice,
        peak_market_cap_usd: update.currentMarketCapUsd,
        current_roi_pct: ((update.currentPrice - entryPrice) / entryPrice) * 100,
        peak_roi_pct: ((peakPrice - entryPrice) / entryPrice) * 100,
        current_multiple: currentMultiple,
        peak_multiple: peakMultiple,
        is_win: currentMultiple >= 1,
        hit_2x:   peakMultiple >= 2,
        hit_5x:   peakMultiple >= 5,
        hit_10x:  peakMultiple >= 10,
        hit_50x:  peakMultiple >= 50,
        hit_100x: peakMultiple >= 100,
        simulated_investment_usd: 10,
        simulated_current_value_usd: currentValue,
        simulated_peak_value_usd: peakValue,
        simulated_current_pnl_usd: currentValue - 10,
        simulated_peak_pnl_usd: peakValue - 10,
        refreshed_at: new Date().toISOString(),
      }, { onConflict: "call_id" });

    if (error) {
      log(LOG_LEVELS.ERROR, "db", "Failed to update call_metrics", {
        callId: update.callId,
        error: error.message,
      });
      continue;
    }

    await insertMilestoneEvents(supabase, {
      callId: update.callId,
      channelId: update.channelId,
      tokenId: update.tokenId,
      priorPeakMultiple,
      newPeakMultiple: peakMultiple,
    });

    await supabase
      .from("tokens")
      .update({
        last_price_usd: update.currentPrice,
        last_market_cap_usd: update.currentMarketCapUsd,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", update.tokenId);
  }
}
async function main() {
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  log(LOG_LEVELS.INFO, "startup", "Price update worker starting...");

  let running = true;
  const shutdown = () => {
    running = false;
    log(LOG_LEVELS.INFO, "shutdown", "Price worker shutting down...");
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  async function runPriceUpdate() {
    if (!running) return;

    try {
      const openCalls = await getOpenCalls(supabase);
      log(LOG_LEVELS.INFO, "worker", "Processing open calls", { count: openCalls.length });

      const updates = [];
      let processed = 0;

      for (const call of openCalls) {
        if (!running) break;
        const contractAddress = call.tokens?.contract_address;
        if (!contractAddress) continue;

        const snapshot = await fetchDexSnapshot(contractAddress);
        if (snapshot !== null && snapshot.priceUsd !== null) {
          updates.push({
            callId: call.id,
            tokenId: call.token_id,
            channelId: call.channel_id,        // needed for bot_events
            entryPriceUsd: call.entry_price_usd,
            currentPrice: snapshot.priceUsd,
            currentMarketCapUsd: snapshot.marketCapUsd,
            logoUrl: snapshot.logoUrl
          });
        }

        processed++;
        if (processed % BATCH_SIZE === 0) {
          await updateCallMetrics(supabase, updates);
          updates.length = 0;
        }
      }

      if (updates.length > 0) {
        await updateCallMetrics(supabase, updates);
      }

      const { error: refreshError } = await supabase.rpc("refresh_public_analytics");
      if (refreshError) {
        log(LOG_LEVELS.WARN, "worker", "Analytics refresh failed after price update", {
          error: refreshError.message
        });
      }

      log(LOG_LEVELS.INFO, "worker", "Price update complete", { processed });
    } catch (err) {
      log(LOG_LEVELS.ERROR, "worker", "Price update failed", { error: err.message });
    }
  }

  await runPriceUpdate();

  const interval = setInterval(async () => {
    await runPriceUpdate();
  }, POLL_INTERVAL_MS);

  interval.unref();
}

main().catch(err => {
  log(LOG_LEVELS.ERROR, "fatal", "Worker crashed", { error: err.message });
  process.exit(1);
});