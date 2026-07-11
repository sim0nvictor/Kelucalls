/**
 * Kelucalls Trending Aggregation Worker
 *
 * Refreshes channel_stats and the trending_tokens materialized view through
 * the current schema's refresh_public_analytics() RPC.
 */

import { createClient } from "@supabase/supabase-js";
import {
  LOG_LEVELS,
  finishWorkerRun,
  getNumberEnv,
  getSupabaseConfig,
  loadWorkerEnv,
  log,
  startWorkerRun,
  withRetry
} from "./worker-utils.js";

const WORKER_NAME = "trending-aggregate";

loadWorkerEnv(import.meta.url);

const POLL_INTERVAL_MS = getNumberEnv("TRENDING_WORKER_INTERVAL_MS", 15 * 60 * 1000);
const RPC_MAX_RETRIES = getNumberEnv("SUPABASE_RPC_MAX_RETRIES", 3);
const RPC_RETRY_DELAY_MS = getNumberEnv("SUPABASE_RPC_RETRY_DELAY_MS", 1_000);

async function getAnalyticsCounts(supabase) {
  const [channelStats, trendingTokens] = await Promise.all([
    supabase.from("channel_stats").select("channel_id", { count: "exact", head: true }),
    supabase.from("trending_tokens").select("id", { count: "exact", head: true })
  ]);

  return {
    channelStatsCount: channelStats.error ? null : channelStats.count ?? 0,
    trendingTokensCount: trendingTokens.error ? null : trendingTokens.count ?? 0,
    countErrors: [
      channelStats.error ? `channel_stats: ${channelStats.error.message}` : null,
      trendingTokens.error ? `trending_tokens: ${trendingTokens.error.message}` : null
    ].filter(Boolean)
  };
}

async function refreshPublicAnalytics(supabase) {
  await withRetry(
    async () => {
      const { error } = await supabase.rpc("refresh_public_analytics");
      if (error) throw error;
    },
    {
      retries: RPC_MAX_RETRIES,
      baseDelayMs: RPC_RETRY_DELAY_MS,
      onRetry: (error, attempt, delayMs) => {
        log(LOG_LEVELS.WARN, WORKER_NAME, "Analytics refresh retry scheduled", {
          attempt,
          delayMs,
          error: error.message
        });
      }
    }
  );
}

async function runAggregation(supabase, runningRef) {
  if (!runningRef.running) return null;

  const startedAt = Date.now();
  const runId = await startWorkerRun(supabase, WORKER_NAME, {
    intervalMs: POLL_INTERVAL_MS
  });

  const summary = {
    channelStatsCount: null,
    trendingTokensCount: null,
    countErrors: [],
    durationMs: 0
  };

  try {
    log(LOG_LEVELS.INFO, WORKER_NAME, "Aggregation cycle started");
    await refreshPublicAnalytics(supabase);

    Object.assign(summary, await getAnalyticsCounts(supabase));
    summary.durationMs = Date.now() - startedAt;

    log(LOG_LEVELS.INFO, WORKER_NAME, "Aggregation cycle complete", summary);
    await finishWorkerRun(supabase, WORKER_NAME, runId, "succeeded", summary);
    return summary;
  } catch (error) {
    summary.durationMs = Date.now() - startedAt;
    log(LOG_LEVELS.ERROR, WORKER_NAME, "Aggregation cycle failed", {
      ...summary,
      error: error.message
    });
    await finishWorkerRun(supabase, WORKER_NAME, runId, "failed", {
      ...summary,
      error: error.message
    });
    return summary;
  }
}

async function main() {
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const runningRef = { running: true };
  let cycleInProgress = false;

  const shutdown = () => {
    runningRef.running = false;
    log(LOG_LEVELS.INFO, WORKER_NAME, "Shutdown requested");
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log(LOG_LEVELS.INFO, WORKER_NAME, "Worker started", {
    intervalMs: POLL_INTERVAL_MS
  });

  async function runGuardedCycle() {
    if (cycleInProgress) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Skipping cycle because previous cycle is still running");
      return;
    }

    cycleInProgress = true;
    try {
      await runAggregation(supabase, runningRef);
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
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
