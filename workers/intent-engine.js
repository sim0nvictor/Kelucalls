/**
 * KeluScore (TM) Intent Engine Worker
 *
 * Reads existing Kelucalls data (calls, call_metrics, channel_stats, tokens),
 * computes a KeluScore per token, and writes the result into the new
 * intent_* tables. It writes NOTHING to any pre-existing table and never
 * touches the other workers.
 *
 * Follows the workers/trending-aggregate.js convention: plain ESM JavaScript,
 * all shared plumbing imported from worker-utils.js, single guarded cycle,
 * WORKER_RUN_ONCE support for cron-style execution.
 *
 * Query strategy (matters, because naive code here would be O(tokens) round
 * trips): every table is read in a small number of bulk, paginated queries and
 * then joined in memory. The only per-token network work is the optional
 * Dexscreener call, which is capped and concurrency limited.
 *
 * Run once:      WORKER_RUN_ONCE=true node workers/intent-engine.js
 * Run as daemon: node workers/intent-engine.js
 */

import { createClient } from "@supabase/supabase-js";

import {
  LOG_LEVELS,
  log,
  chunk,
  mapWithConcurrency,
  withRetry,
  toFiniteNumber,
  loadWorkerEnv,
  getEnv,
  getNumberEnv,
  getSupabaseConfig,
  isTransientHttpError,
  startWorkerRun,
  finishWorkerRun
} from "./worker-utils.js";

import { computeKeluScore } from "./intent-scoring.js";
import {
  collectDexscreenerSignals,
  collectXSignals,
  toProjectSignalRows
} from "./intent-signals.js";

const WORKER_NAME = "intent-engine";

loadWorkerEnv(import.meta.url);

// Scoring is cheap; the external collectors are the slow part. 30 minutes
// keeps Dexscreener usage modest while staying fresher than the 48h freshness
// half-life.
const POLL_INTERVAL_MS = getNumberEnv("INTENT_WORKER_INTERVAL_MS", 30 * 60 * 1000);

// Only tokens called within this window are scored at all.
const LOOKBACK_DAYS = getNumberEnv("INTENT_LOOKBACK_DAYS", 30);

// Cap on how many tokens get an external signal refresh per cycle, highest
// call activity first. Protects against Dexscreener rate limits.
const SIGNAL_MAX_TOKENS = getNumberEnv("INTENT_SIGNAL_MAX_TOKENS", 150);
const SIGNAL_CONCURRENCY = getNumberEnv("INTENT_SIGNAL_CONCURRENCY", 4);

// A score has to move by at least this much before it is worth recording.
const SCORE_CHANGE_THRESHOLD = getNumberEnv("INTENT_SCORE_CHANGE_THRESHOLD", 5);

// Stops intent_history growing without bound on tokens whose score is static.
const HISTORY_MIN_DELTA = getNumberEnv("INTENT_HISTORY_MIN_DELTA", 1);

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 200;
const WRITE_CHUNK_SIZE = 100;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isoDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/**
 * Paginated select. Supabase caps rows per response, so anything that can
 * exceed that has to be walked.
 */
async function selectAllPages(supabase, tableName, columns, applyFilters) {
  const rows = [];
  let offset = 0;

  for (;;) {
    const page = await withRetry(
      async () => {
        let query = supabase.from(tableName).select(columns);
        if (applyFilters) query = applyFilters(query);
        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        return data || [];
      },
      { retries: 3, baseDelayMs: 1000, shouldRetry: isTransientHttpError }
    );

    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

/**
 * Bulk fetch by id list, chunked so the IN clause never gets too large.
 */
async function selectByIds(supabase, tableName, columns, columnName, ids) {
  const rows = [];

  for (const idChunk of chunk(ids, IN_CHUNK_SIZE)) {
    const page = await withRetry(
      async () => {
        const { data, error } = await supabase
          .from(tableName)
          .select(columns)
          .in(columnName, idChunk);
        if (error) throw new Error(error.message);
        return data || [];
      },
      { retries: 3, baseDelayMs: 1000, shouldRetry: isTransientHttpError }
    );
    rows.push(...page);
  }

  return rows;
}

/**
 * Group recent calls into per-token aggregates.
 */
function aggregateCalls(calls) {
  const now = Date.now();
  const cutoff24h = now - DAY_MS;
  const cutoff7d = now - 7 * DAY_MS;
  const byToken = new Map();

  for (const call of calls) {
    if (!call.token_id) continue;

    let entry = byToken.get(call.token_id);
    if (!entry) {
      entry = {
        tokenId: call.token_id,
        callIds: [],
        channelIds: new Set(),
        calls24h: 0,
        calls7d: 0,
        calls30d: 0,
        lastCalledAtMs: null
      };
      byToken.set(call.token_id, entry);
    }

    entry.callIds.push(call.id);
    if (call.channel_id) entry.channelIds.add(call.channel_id);
    entry.calls30d += 1;

    const calledAtMs = call.called_at ? Date.parse(call.called_at) : NaN;
    if (Number.isFinite(calledAtMs)) {
      if (calledAtMs >= cutoff24h) entry.calls24h += 1;
      if (calledAtMs >= cutoff7d) entry.calls7d += 1;
      if (entry.lastCalledAtMs === null || calledAtMs > entry.lastCalledAtMs) {
        entry.lastCalledAtMs = calledAtMs;
      }
    }
  }

  return byToken;
}

/**
 * Average historical win rate of the channels that called a token. This is
 * the input that makes conviction meaningful.
 */
function averageCallerWinRate(channelIds, channelStatsMap) {
  let total = 0;
  let count = 0;

  for (const channelId of channelIds) {
    const stats = channelStatsMap.get(channelId);
    if (!stats) continue;
    const winRate = toFiniteNumber(stats.win_rate_pct, null);
    if (winRate === null) continue;
    total += winRate;
    count += 1;
  }

  return count === 0 ? null : total / count;
}

/**
 * Realised performance of this token's own calls.
 */
function tokenPerformance(callIds, metricsMap) {
  let wins = 0;
  let scored = 0;
  let peakTotal = 0;
  let peakCount = 0;

  for (const callId of callIds) {
    const metrics = metricsMap.get(callId);
    if (!metrics) continue;

    scored += 1;
    if (metrics.is_win === true) wins += 1;

    const peak = toFiniteNumber(metrics.peak_multiple, null);
    if (peak !== null && peak > 0) {
      peakTotal += peak;
      peakCount += 1;
    }
  }

  return {
    winRatePct: scored === 0 ? null : (wins / scored) * 100,
    averagePeakMultiple: peakCount === 0 ? null : peakTotal / peakCount
  };
}

/**
 * Refresh external signals for the busiest tokens and return them keyed by
 * token id. Failures are logged and skipped, never fatal.
 */
async function collectExternalSignals(supabase, candidates, tokenMap) {
  const xBearerToken = getEnv("X_BEARER_TOKEN");
  const signalsByToken = new Map();
  const signalRows = [];

  await mapWithConcurrency(candidates, SIGNAL_CONCURRENCY, async (tokenId) => {
    const token = tokenMap.get(tokenId);
    const contractAddress = token?.contract_address;
    if (!contractAddress) return null;

    const dex = await collectDexscreenerSignals(contractAddress, WORKER_NAME);
    if (!dex) return null;

    const merged = { ...dex };
    signalRows.push(...toProjectSignalRows(tokenId, "dexscreener", dex));

    // Only attempted when X_BEARER_TOKEN is set. Inert otherwise.
    if (xBearerToken && dex.twitterUrl) {
      const x = await collectXSignals(dex.twitterUrl, xBearerToken, WORKER_NAME);
      if (x) {
        merged.twitterFollowers = x.twitterFollowers;
        signalRows.push(...toProjectSignalRows(tokenId, "x", x));
      }
    }

    signalsByToken.set(tokenId, merged);
    return null;
  });

  // project_signals is append only, so a plain insert is correct here.
  for (const rowChunk of chunk(signalRows, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase.from("project_signals").insert(rowChunk);
    if (error) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to persist project_signals batch", {
        rows: rowChunk.length,
        error: error.message
      });
    }
  }

  return { signalsByToken, signalRowCount: signalRows.length };
}

async function runCycle(supabase) {
  const runId = await startWorkerRun(supabase, WORKER_NAME, {
    lookbackDays: LOOKBACK_DAYS,
    signalMaxTokens: SIGNAL_MAX_TOKENS
  });

  try {
    // ---- 1. Read existing data -------------------------------------------
    const cutoff = isoDaysAgo(LOOKBACK_DAYS);

    const calls = await selectAllPages(
      supabase,
      "calls",
      "id, token_id, channel_id, called_at",
      (query) => query.gte("called_at", cutoff).not("token_id", "is", null)
    );

    if (calls.length === 0) {
      log(LOG_LEVELS.INFO, WORKER_NAME, "No recent calls to score", { cutoff });
      await finishWorkerRun(supabase, WORKER_NAME, runId, "success", { tokensScored: 0 });
      return;
    }

    const aggregates = aggregateCalls(calls);
    const tokenIds = Array.from(aggregates.keys());

    const allCallIds = [];
    for (const entry of aggregates.values()) allCallIds.push(...entry.callIds);

    const [channelStats, callMetrics, tokens, existingScores] = await Promise.all([
      selectAllPages(supabase, "channel_stats", "channel_id, win_rate_pct, ranking_score", null),
      selectByIds(supabase, "call_metrics", "call_id, is_win, peak_multiple", "call_id", allCallIds),
      selectByIds(supabase, "tokens", "id, symbol, contract_address", "id", tokenIds),
      selectByIds(supabase, "intent_scores", "token_id, kelu_score, grade", "token_id", tokenIds)
    ]);

    const channelStatsMap = new Map(channelStats.map((row) => [row.channel_id, row]));
    const metricsMap = new Map(callMetrics.map((row) => [row.call_id, row]));
    const tokenMap = new Map(tokens.map((row) => [row.id, row]));
    const previousMap = new Map(existingScores.map((row) => [row.token_id, row]));

    // ---- 2. External signals for the busiest tokens ----------------------
    const signalCandidates = tokenIds
      .slice()
      .sort((a, b) => {
        const left = aggregates.get(a);
        const right = aggregates.get(b);
        if (right.calls24h !== left.calls24h) return right.calls24h - left.calls24h;
        return right.calls7d - left.calls7d;
      })
      .slice(0, SIGNAL_MAX_TOKENS);

    const { signalsByToken, signalRowCount } = await collectExternalSignals(
      supabase,
      signalCandidates,
      tokenMap
    );

    // ---- 3. Score ---------------------------------------------------------
    const now = Date.now();
    const computedAt = new Date(now).toISOString();

    const scoreRows = [];
    const historyRows = [];
    const changeRows = [];

    for (const tokenId of tokenIds) {
      const entry = aggregates.get(tokenId);
      const external = signalsByToken.get(tokenId) || {};
      const performance = tokenPerformance(entry.callIds, metricsMap);

      const hoursSinceLastCall =
        entry.lastCalledAtMs === null ? null : (now - entry.lastCalledAtMs) / HOUR_MS;

      const result = computeKeluScore({
        calls24h: entry.calls24h,
        calls7d: entry.calls7d,
        calls30d: entry.calls30d,
        uniqueChannels: entry.channelIds.size,
        averageWinRatePct: averageCallerWinRate(entry.channelIds, channelStatsMap),
        winRatePct: performance.winRatePct,
        averagePeakMultiple: performance.averagePeakMultiple,
        hoursSinceLastCall,
        liquidityUsd: external.liquidityUsd ?? null,
        volume24hUsd: external.volume24hUsd ?? null,
        hasWebsite: external.hasWebsite ?? null,
        socialCount: external.socialCount ?? null,
        twitterFollowers: external.twitterFollowers ?? null
      });

      scoreRows.push({
        token_id: tokenId,
        kelu_score: result.keluScore,
        grade: result.grade,
        conviction_score: result.scores.conviction,
        momentum_score: result.scores.momentum,
        breadth_score: result.scores.breadth,
        performance_score: result.scores.performance,
        freshness_score: result.scores.freshness,
        marketing_score: result.scores.marketing,
        community_score: result.scores.community,
        liquidity_score: result.scores.liquidity,
        calls_24h: entry.calls24h,
        calls_7d: entry.calls7d,
        calls_30d: entry.calls30d,
        unique_channels: entry.channelIds.size,
        signals: result.signals,
        recommendations: result.recommendations,
        inputs: { ...result.inputs, version: result.version },
        computed_at: computedAt
      });

      const previous = previousMap.get(tokenId);
      const previousScore = previous ? toFiniteNumber(previous.kelu_score, null) : null;
      const delta = previousScore === null ? null : result.keluScore - previousScore;

      if (previousScore === null || Math.abs(delta) >= HISTORY_MIN_DELTA) {
        historyRows.push({
          token_id: tokenId,
          kelu_score: result.keluScore,
          grade: result.grade,
          conviction_score: result.scores.conviction,
          momentum_score: result.scores.momentum,
          breadth_score: result.scores.breadth,
          performance_score: result.scores.performance,
          freshness_score: result.scores.freshness,
          marketing_score: result.scores.marketing,
          community_score: result.scores.community,
          liquidity_score: result.scores.liquidity,
          calls_24h: entry.calls24h,
          unique_channels: entry.channelIds.size,
          captured_at: computedAt
        });
      }

      if (delta !== null && Math.abs(delta) >= SCORE_CHANGE_THRESHOLD) {
        changeRows.push({
          token_id: tokenId,
          previous_score: previousScore,
          current_score: result.keluScore,
          delta: Math.round(delta * 100) / 100,
          direction: delta > 0 ? "up" : "down",
          previous_grade: previous?.grade ?? null,
          current_grade: result.grade,
          reason: delta > 0 ? "Score increased" : "Score decreased",
          details: {
            calls24h: entry.calls24h,
            uniqueChannels: entry.channelIds.size,
            momentum: result.scores.momentum,
            conviction: result.scores.conviction
          }
        });
      }
    }

    // ---- 4. Write ---------------------------------------------------------
    let scoresWritten = 0;
    for (const rowChunk of chunk(scoreRows, WRITE_CHUNK_SIZE)) {
      const { error } = await supabase
        .from("intent_scores")
        .upsert(rowChunk, { onConflict: "token_id" });
      if (error) {
        log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to upsert intent_scores batch", {
          rows: rowChunk.length,
          error: error.message
        });
        continue;
      }
      scoresWritten += rowChunk.length;
    }

    for (const rowChunk of chunk(historyRows, WRITE_CHUNK_SIZE)) {
      const { error } = await supabase.from("intent_history").insert(rowChunk);
      if (error) {
        log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to insert intent_history batch", {
          rows: rowChunk.length,
          error: error.message
        });
      }
    }

    for (const rowChunk of chunk(changeRows, WRITE_CHUNK_SIZE)) {
      const { error } = await supabase.from("score_changes").insert(rowChunk);
      if (error) {
        log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to insert score_changes batch", {
          rows: rowChunk.length,
          error: error.message
        });
      }
    }

    log(LOG_LEVELS.INFO, WORKER_NAME, "Intent scoring cycle complete", {
      tokensConsidered: tokenIds.length,
      scoresWritten,
      historyRows: historyRows.length,
      scoreChanges: changeRows.length,
      externalSignalRows: signalRowCount,
      tokensWithExternalData: signalsByToken.size
    });

    await finishWorkerRun(supabase, WORKER_NAME, runId, "success", {
      tokensScored: scoresWritten,
      scoreChanges: changeRows.length,
      externalSignalRows: signalRowCount
    });
  } catch (error) {
    log(LOG_LEVELS.ERROR, WORKER_NAME, "Intent scoring cycle failed", {
      error: error.message
    });
    await finishWorkerRun(supabase, WORKER_NAME, runId, "failed", {
      error: error.message
    });
  }
}

async function main() {
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  log(LOG_LEVELS.INFO, WORKER_NAME, "Intent engine worker starting", {
    pollIntervalMs: POLL_INTERVAL_MS,
    lookbackDays: LOOKBACK_DAYS
  });

  const runningRef = { running: true };
  let cycleInProgress = false;

  const shutdown = () => {
    runningRef.running = false;
    log(LOG_LEVELS.INFO, WORKER_NAME, "Intent engine worker shutting down");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  async function runGuardedCycle() {
    if (!runningRef.running || cycleInProgress) return;
    cycleInProgress = true;
    try {
      await runCycle(supabase);
    } finally {
      cycleInProgress = false;
    }
  }

  await runGuardedCycle();

  if (process.env.WORKER_RUN_ONCE === "true") return;

  const interval = setInterval(runGuardedCycle, POLL_INTERVAL_MS);
  interval.unref();
}

main().catch((error) => {
  log(LOG_LEVELS.ERROR, WORKER_NAME, "Fatal worker crash", { error: error.message });
  process.exit(1);
});
