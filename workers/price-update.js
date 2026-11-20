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
import { loadEnabledUserIds } from "./alert-prefs.js";
import dotenv from "dotenv";
import {
  LOG_LEVELS,
  finishWorkerRun,
  getNumberEnv,
  getSupabaseConfig,
  isTransientHttpError,
  loadWorkerEnv,
  log,
  sleep,
  startWorkerRun,
} from "./worker-utils.js";
import { normalizeDexChain, parseDexPairSnapshot, selectDexPair } from "./dexscreener.js";
import { calculateCallPerformance } from "./price-metrics.js";

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

async function fetchDexSnapshot(contractAddress, expectedChain, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(contractAddress)}`,
        { timeout: DEX_API_TIMEOUT_MS }
      );
      const selected = selectDexPair(data?.pairs, expectedChain);
      if (!selected.pair) return { snapshot: null, reason: selected.reason };

      const snapshot = parseDexPairSnapshot(selected.pair);
      if (!snapshot) return { snapshot: null, reason: "invalid_price" };

      return { snapshot, reason: null };
    } catch (err) {
      log(LOG_LEVELS.WARN, "dex", `Snapshot fetch failed (attempt ${attempt}/${retries})`, {
        contract: contractAddress,
        expectedChain: normalizeDexChain(expectedChain),
        status: err?.response?.status ?? null,
        error: err.message
      });
      if (attempt >= retries || !isTransientHttpError(err)) {
        return { snapshot: null, reason: "provider_error" };
      }
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  return { snapshot: null, reason: "provider_error" };
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
async function insertChannelMilestoneNotifications(supabase, { callId, channelId, tokenId, newEvents }) {
  if (!channelId || !newEvents.length) return;

  const { data: rules, error: rulesError } = await supabase
    .from("user_alert_rules")
    .select("id, user_id, conditions, delivery_channels")
    .eq("rule_type", "channel_big_win")
    .eq("channel_id", channelId)
    .eq("is_active", true);

  if (rulesError) {
    log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to load channel milestone alert rules", {
      channelId,
      error: rulesError.message
    });
    return;
  }
  if (!rules || rules.length === 0) return;

  const userIds = Array.from(new Set(rules.map((rule) => rule.user_id)));
  const { data: watchlistRows, error: watchlistError } = await supabase
    .from("user_channel_watchlist")
    .select("user_id, is_muted")
    .eq("channel_id", channelId)
    .in("user_id", userIds);

  if (watchlistError) {
    log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to verify channel watchlist before alert delivery", {
      channelId,
      error: watchlistError.message
    });
    return;
  }

  const watchedAndUnmuted = new Set(
    (watchlistRows || []).filter((row) => !row.is_muted).map((row) => row.user_id)
  );
  const candidates = rules.filter((rule) => watchedAndUnmuted.has(rule.user_id));
  if (candidates.length === 0) return;

  const enabledUserIds = await loadEnabledUserIds(
    supabase,
    candidates.map((rule) => rule.user_id),
    WORKER_NAME
  );

  const [{ data: channel }, { data: token }] = await Promise.all([
    supabase.from("channels").select("slug, title").eq("id", channelId).maybeSingle(),
    tokenId
      ? supabase.from("tokens").select("symbol").eq("id", tokenId).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const notifications = [];
  const triggeredRuleIds = [];

  for (const rule of candidates) {
    if (!enabledUserIds.has(rule.user_id)) continue;

    const deliveryChannels = rule.delivery_channels || [];
    if (deliveryChannels.length > 0 && !deliveryChannels.includes("in_app")) continue;

    const conditions = rule.conditions || {};
    const configuredMilestones = Array.isArray(conditions.milestones)
      ? conditions.milestones.map(Number)
      : null;
    const minMultiple = Number(conditions.min_multiple);
    const selectedMilestones = configuredMilestones || (
      Number.isFinite(minMultiple) && minMultiple > 0
        ? [2, 10, 100].filter((multiple) => multiple >= minMultiple)
        : [2, 10, 100]
    );

    for (const event of newEvents) {
      if (!selectedMilestones.includes(event.multiple)) continue;

      notifications.push({
        user_id: rule.user_id,
        alert_rule_id: rule.id,
        channel_id: channelId,
        token_id: tokenId || null,
        dedupe_key: callId + ":" + event.key,
        title: (channel?.title || "A watched caller") + " reached " + event.key,
        body: (token?.symbol || "A token") + " from this caller's signal reached a " + event.key + " peak.",
        url: channel?.slug ? "/channels/" + channel.slug : "/account/watchlist",
        status: "sent",
        payload: {
          eventType: "channel_milestone",
          callId,
          milestone: event.key,
          multiple: event.multiple
        }
      });
      triggeredRuleIds.push(rule.id);
    }
  }

  if (notifications.length === 0) return;

  const { error: insertError } = await supabase
    .from("user_notifications")
    .upsert(notifications, {
      onConflict: "user_id,dedupe_key",
      ignoreDuplicates: true
    });

  if (insertError) {
    log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to insert channel milestone notifications", {
      channelId,
      callId,
      count: notifications.length,
      error: insertError.message
    });
    return;
  }

  const uniqueRuleIds = Array.from(new Set(triggeredRuleIds));
  await supabase
    .from("user_alert_rules")
    .update({ last_triggered_at: new Date().toISOString() })
    .in("id", uniqueRuleIds);

  log(LOG_LEVELS.INFO, WORKER_NAME, "Dispatched watched-channel milestone notifications", {
    channelId,
    callId,
    milestones: newEvents.map((event) => event.key),
    recipients: new Set(notifications.map((item) => item.user_id)).size
  });
}

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

  // Website subscribers are independent from Telegram bot subscribers.
  // Dispatch through user_notifications and respect watchlist mute + master prefs.
  await insertChannelMilestoneNotifications(supabase, {
    callId,
    channelId,
    tokenId,
    newEvents
  });
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
  if (updates.length === 0) return 0;

  let written = 0;
  for (const update of updates) {
    const { data: existing } = await supabase
      .from("call_metrics")
      .select("peak_price_usd, peak_multiple")
      .eq("call_id", update.callId)
      .maybeSingle();

    if (!Number.isFinite(update.currentPrice) || update.currentPrice <= 0) continue;

    const priorPeak = existing?.peak_price_usd == null
      ? null
      : Number(existing.peak_price_usd);
    const priorPeakMultiple = existing?.peak_multiple == null
      ? null
      : Number(existing.peak_multiple);
    const peakPrice = priorPeak == null
      ? update.currentPrice
      : Math.max(priorPeak, update.currentPrice);

    // A current market quote is not a historical call entry. Derived metrics
    // stay null until the call has a valid recorded entry price.
    const performance = calculateCallPerformance({
      entryPriceUsd: update.entryPriceUsd,
      currentPriceUsd: update.currentPrice,
      peakPriceUsd: peakPrice,
      investmentUsd: 10,
    });

    const { error } = await supabase
      .from("call_metrics")
      .upsert({
        call_id: update.callId,
        current_price_usd: update.currentPrice,
        current_market_cap_usd: update.currentMarketCapUsd,
        peak_price_usd: peakPrice,
        peak_market_cap_usd: update.currentMarketCapUsd,
        current_roi_pct: performance.currentRoiPct,
        peak_roi_pct: performance.peakRoiPct,
        current_multiple: performance.currentMultiple,
        peak_multiple: performance.peakMultiple,
        is_win: performance.isWin,
        hit_2x: performance.hit2x,
        hit_5x: performance.hit5x,
        hit_10x: performance.hit10x,
        hit_50x: performance.hit50x,
        hit_100x: performance.hit100x,
        simulated_investment_usd: performance.currentRoiPct == null ? null : 10,
        simulated_current_value_usd: performance.simulatedCurrentValueUsd,
        simulated_peak_value_usd: performance.simulatedPeakValueUsd,
        simulated_current_pnl_usd: performance.simulatedCurrentPnlUsd,
        simulated_peak_pnl_usd: performance.simulatedPeakPnlUsd,
        refreshed_at: new Date().toISOString(),
      }, { onConflict: "call_id" });

    if (error) {
      log(LOG_LEVELS.ERROR, "db", "Failed to update call_metrics", {
        callId: update.callId,
        error: error.message,
      });
      continue;
    }

    written += 1;

    await insertMilestoneEvents(supabase, {
      callId: update.callId,
      channelId: update.channelId,
      tokenId: update.tokenId,
      priorPeakMultiple,
      newPeakMultiple: performance.peakMultiple,
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

  return written;
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
    priced: 0,
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
    const unpricedReasons = { no_pairs: 0, chain_mismatch: 0, invalid_price: 0, provider_error: 0 };
    let processed = 0;
    let priced = 0;
    let updated = 0;
    let unpriced = 0;

    for (const call of openCalls) {
      if (!runningRef.running) break;

      const contractAddress = call.tokens?.contract_address;
      if (!contractAddress) continue;

      const expectedChain = call.tokens?.chain ?? "other";
      const cacheKey = `${normalizeDexChain(expectedChain)}:${contractAddress.toLowerCase()}`;
      let result;
      if (snapshotCache.has(cacheKey)) {
        result = snapshotCache.get(cacheKey);
      } else {
        result = await fetchDexSnapshot(contractAddress, expectedChain);
        snapshotCache.set(cacheKey, result);
      }

      const snapshot = result?.snapshot ?? null;
      if (snapshot && snapshot.priceUsd > 0) {
        updates.push({
          callId: call.id,
          tokenId: call.token_id,
          channelId: call.channel_id,
          entryPriceUsd: call.entry_price_usd,
          currentPrice: snapshot.priceUsd,
          currentMarketCapUsd: snapshot.marketCapUsd,
          logoUrl: snapshot.logoUrl,
        });
        priced += 1;

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
        const reason = result?.reason ?? "provider_error";
        if (Object.hasOwn(unpricedReasons, reason)) unpricedReasons[reason] += 1;
      }

      processed += 1;
      if (updates.length >= BATCH_SIZE) {
        updated += await updateCallMetrics(supabase, updates);
        updates.length = 0;
      }
    }

    if (updates.length > 0) {
      updated += await updateCallMetrics(supabase, updates);
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
    summary.priced = priced;
    summary.updated = updated;
    summary.unpriced = unpriced;
    summary.unpricedReasons = unpricedReasons;
    summary.priceCoveragePct = processed > 0 ? Number(((priced / processed) * 100).toFixed(2)) : 0;
    summary.metricsWriteCoveragePct = processed > 0 ? Number(((updated / processed) * 100).toFixed(2)) : 0;
    summary.partial = unpriced > 0 || updated < processed;
    summary.durationMs = Date.now() - startedAt;

    const runStatus = processed > 0 && updated > 0 ? "succeeded" : "failed";

    log(LOG_LEVELS.INFO, WORKER_NAME, "Price update complete", { ...summary, status: runStatus });
    await finishWorkerRun(supabase, WORKER_NAME, runId, runStatus, summary);
    return summary;
  } catch (error) {
    summary.processed = 0;
    summary.priced = 0;
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