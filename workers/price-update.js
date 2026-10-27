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
import {
  LOG_LEVELS,
  finishWorkerRun,
  getNumberEnv,
  getSupabaseConfig,
  loadWorkerEnv,
  log,
  sleep,
  startWorkerRun,
} from "./worker-utils.js";

const PROCESS_ENV_ONLY = process.env.PRICE_WORKER_NO_DOTENV === "true";
loadWorkerEnv(import.meta.url, { loadDotenvFiles: !PROCESS_ENV_ONLY });
if (!PROCESS_ENV_ONLY) dotenv.config();

// Configuration
const POLL_INTERVAL_MS = getNumberEnv("PRICE_WORKER_INTERVAL_MS", 5 * 60 * 1000);
const BATCH_SIZE = 50;
const DEX_API_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const WORKER_NAME = "price-update";
const QUEUE_LIMIT = 500;

// Milestones the bot announces, in ascending order.
// We track which ones have already been announced per call to avoid duplicates.
const ACHIEVEMENT_MILESTONES = [
  { key: "2x",   field: "hit_2x",   multiple: 2   },
  { key: "10x",  field: "hit_10x",  multiple: 10  },
  { key: "100x", field: "hit_100x", multiple: 100 },
];

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
      const normalizedPrice = price !== null && Number.isFinite(price) && price > 0 ? price : null;
      const marketCap = pair.marketCap == null ? null : Number(pair.marketCap);
      return {
        priceUsd: normalizedPrice,
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
  const { data: staleCalls, error: rpcError } = await supabase.rpc("get_stale_open_calls", {
    p_limit: QUEUE_LIMIT,
  });

  if (!rpcError && Array.isArray(staleCalls)) {
    return staleCalls.map((row) => ({
      id: row.id,
      token_id: row.token_id,
      entry_price_usd: row.entry_price_usd,
      called_at: row.called_at,
      channel_id: row.channel_id,
      tokens: {
        contract_address: row.contract_address,
        chain: row.chain,
      },
    }));
  }

  log(LOG_LEVELS.WARN, WORKER_NAME, "get_stale_open_calls RPC unavailable, falling back to direct table query", {
    error: rpcError?.message,
  });

  const { data: openCalls, error: openCallsError } = await supabase
    .from("calls")
    .select("id, token_id, entry_price_usd, called_at, channel_id, tokens!inner(contract_address, chain)")
    .eq("status", "open")
    .not("tokens.contract_address", "is", null)
    .order("called_at", { ascending: true })
    .limit(QUEUE_LIMIT);

  if (openCallsError) {
    log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to fetch open calls via fallback query", {
      error: openCallsError.message,
    });
    return [];
  }

  return openCalls ?? [];
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

async function persistHistoricalObservations(supabase, observations) {
  if (!Array.isArray(observations) || observations.length === 0) return;

  const rows = observations
    .filter((entry) => entry && entry.tokenId && Number.isFinite(entry.priceUsd) && entry.priceUsd > 0)
    .map((entry) => ({
      token_id: entry.tokenId,
      price_usd: Number(entry.priceUsd),
      market_cap_usd: Number.isFinite(entry.marketCapUsd) && entry.marketCapUsd != null ? Number(entry.marketCapUsd) : null,
      observed_at: entry.observedAt,
      source: "dexscreener",
    }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("token_price_observations")
    .upsert(rows, { onConflict: "token_id,observed_at" });

  if (error) {
    const message = String(error.message || "");
    const missingTable = message.includes("token_price_observations") && message.includes("does not exist");

    if (missingTable) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Historical observation table is not available; skipping observation write", {
        count: rows.length,
        error: message,
      });
      return;
    }

    log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to write historical price observations", {
      count: rows.length,
      error: message,
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

    if (!Number.isFinite(update.currentPrice) || update.currentPrice <= 0) continue;

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

async function markCallsRefreshed(supabase, callIds) {
  if (!callIds || callIds.length === 0) return;
  const now = new Date().toISOString();

  for (let i = 0; i < callIds.length; i += 100) {
    const batch = callIds.slice(i, i + 100);
    const { error } = await supabase
      .from("call_metrics")
      .upsert(
        batch.map((id) => ({ call_id: id, refreshed_at: now })),
        { onConflict: "call_id" }
      );

    if (error) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to touch refreshed_at for unpriced calls", {
        count: batch.length,
        error: error.message,
      });
    }
  }
}

async function runPriceUpdate(supabase, runningRef) {
  if (!runningRef.running) return null;

  const startedAt = Date.now();
  const runId = await startWorkerRun(supabase, WORKER_NAME, {
    intervalMs: POLL_INTERVAL_MS,
    queueLimit: QUEUE_LIMIT,
  });

  const summary = {
    processed: 0,
    updated: 0,
    unpriced: 0,
    durationMs: 0,
  };

  try {
    const openCalls = await getOpenCalls(supabase);
    log(LOG_LEVELS.INFO, WORKER_NAME, "Processing open calls", { count: openCalls.length });

    const updates = [];
    const unpricedCallIds = [];
    const historicalObservations = new Map();
    const snapshotCache = new Map();
    let processed = 0;
    let updated = 0;
    let unpriced = 0;

    for (const call of openCalls) {
      if (!runningRef.running) break;

      const contractAddress = call.tokens?.contract_address;
      if (!contractAddress) continue;

      let snapshot;
      if (snapshotCache.has(contractAddress)) {
        snapshot = snapshotCache.get(contractAddress);
      } else {
        snapshot = await fetchDexSnapshot(contractAddress);
        snapshotCache.set(contractAddress, snapshot);
      }

      if (snapshot !== null && snapshot.priceUsd !== null && snapshot.priceUsd > 0) {
        updates.push({
          callId: call.id,
          tokenId: call.token_id,
          channelId: call.channel_id,
          entryPriceUsd: call.entry_price_usd,
          currentPrice: snapshot.priceUsd,
          currentMarketCapUsd: snapshot.marketCapUsd,
          logoUrl: snapshot.logoUrl,
        });
        updated += 1;

        if (call.token_id) {
          historicalObservations.set(call.token_id, {
            tokenId: call.token_id,
            priceUsd: snapshot.priceUsd,
            marketCapUsd: snapshot.marketCapUsd,
            observedAt: new Date().toISOString(),
          });
        }
      } else {
        unpricedCallIds.push(call.id);
        unpriced += 1;
      }

      processed += 1;
      if (updates.length >= BATCH_SIZE) {
        await updateCallMetrics(supabase, updates);
        updates.length = 0;
      }
    }

    if (updates.length > 0) {
      await updateCallMetrics(supabase, updates);
    }

    if (unpricedCallIds.length > 0) {
      await markCallsRefreshed(supabase, unpricedCallIds);
    }

    const observationRows = [...historicalObservations.values()];
    await persistHistoricalObservations(supabase, observationRows);

    const { error: refreshError } = await supabase.rpc("refresh_public_analytics");
    if (refreshError) {
      const message = String(refreshError.message || "");
      log(LOG_LEVELS.WARN, WORKER_NAME, "Analytics refresh failed after price update", {
        error: message,
        likelyNullAggregate: message.includes("average_roi_pct") || message.includes("channel_stats"),
      });
    }

    summary.processed = processed;
    summary.updated = updated;
    summary.unpriced = unpriced;
    summary.durationMs = Date.now() - startedAt;

    const runStatus = (processed > 0 && (updated > 0 || unpriced > 0)) ? "succeeded" : "failed";

    log(LOG_LEVELS.INFO, WORKER_NAME, "Price update complete", { ...summary, status: runStatus });
    await finishWorkerRun(supabase, WORKER_NAME, runId, runStatus, summary);
    return summary;
  } catch (error) {
    summary.processed = 0;
    summary.updated = 0;
    summary.unpriced = 0;
    summary.durationMs = Date.now() - startedAt;

    log(LOG_LEVELS.ERROR, WORKER_NAME, "Price update failed", {
      ...summary,
      error: error instanceof Error ? error.message : String(error),
    });

    await finishWorkerRun(supabase, WORKER_NAME, runId, "failed", {
      ...summary,
      error: error instanceof Error ? error.message : String(error),
    });

    return summary;
  }
}

async function main() {
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runningRef = { running: true };
  let cycleInProgress = false;

  const shutdown = () => {
    runningRef.running = false;
    log(LOG_LEVELS.INFO, WORKER_NAME, "Price worker shutting down");
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log(LOG_LEVELS.INFO, WORKER_NAME, "Price worker starting", {
    intervalMs: POLL_INTERVAL_MS,
    queueLimit: QUEUE_LIMIT,
  });

  async function runGuardedCycle() {
    if (!runningRef.running) return;
    if (cycleInProgress) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Skipping cycle because previous cycle is still running");
      return;
    }

    cycleInProgress = true;
    try {
      await runPriceUpdate(supabase, runningRef);
    } finally {
      cycleInProgress = false;
    }
  }

  await runGuardedCycle();

  if (process.env.WORKER_RUN_ONCE === "true") {
    log(LOG_LEVELS.INFO, WORKER_NAME, "Run-once mode complete");
    return;
  }

  setInterval(runGuardedCycle, POLL_INTERVAL_MS);
}

main().catch((error) => {
  log(LOG_LEVELS.ERROR, WORKER_NAME, "Fatal worker crash", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});