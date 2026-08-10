import { createClient } from "@supabase/supabase-js";

import { loadEnabledUserIds } from "./alert-prefs.js";
import {
  LOG_LEVELS,
  chunk,
  finishWorkerRun,
  getNumberEnv,
  getSupabaseConfig,
  loadWorkerEnv,
  log,
  startWorkerRun
} from "./worker-utils.js";

loadWorkerEnv(import.meta.url);

/**
 * Rolling-window trending detection and alert dispatch.
 *
 * Two jobs in one cycle, in order:
 *
 *   1. Evaluate which tokens are trending right now, from calls in a recent
 *      window, and record entries and exits in trending_changes.
 *   2. Fan those changes out to subscribers as user_notifications.
 *
 * Why not read public.trending_tokens? That materialized view counts calls
 * with no time filter at all, so it ranks all-time popularity and its numbers
 * only ever grow. It also has no history, because a refresh replaces the
 * contents in place. Neither property supports "tell me when this STARTS
 * trending". The view is left untouched and this computes its own window.
 *
 * Delivery is at-least-once, matching workers/intent-alerts.js: notifications
 * are inserted before the source row is stamped, so a crash in between
 * re-sends rather than silently dropping.
 */

const WORKER_NAME = "trending-alerts";

function positiveInt(value, fallback) {
  const resolved = getNumberEnv(value, fallback);
  return Math.max(1, Math.round(resolved));
}

const POLL_INTERVAL_MS = getNumberEnv("TRENDING_ALERTS_INTERVAL_MS", 10 * 60 * 1000);

/** window_hours carries a > 0 check in migration 009, hence positiveInt. */
const WINDOW_HOURS = positiveInt("TRENDING_WINDOW_HOURS", 24);
const ENTER_MIN_CHANNELS = positiveInt("TRENDING_MIN_UNIQUE_CHANNELS", 3);
const ENTER_MIN_CALLS = positiveInt("TRENDING_MIN_TOTAL_CALLS", 3);

/**
 * Leaving takes a weaker signal than entering. Without this gap a token
 * hovering exactly on the threshold would alternate entered and exited every
 * cycle and spam everyone subscribed.
 */
const EXIT_MIN_CHANNELS = positiveInt(
  "TRENDING_EXIT_MIN_UNIQUE_CHANNELS",
  Math.max(1, ENTER_MIN_CHANNELS - 1)
);

const MAX_CHANGES_PER_CYCLE = getNumberEnv("TRENDING_ALERTS_MAX_CHANGES", 200);
const PAGE_SIZE = 1000;
const WRITE_CHUNK_SIZE = 100;
const IN_CHUNK_SIZE = 200;
const RULE_TYPE = "token_trending";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Channels whose calls count towards trending. Mirrors the status filter the
 * trending_tokens view uses, so the two surfaces agree on who is visible.
 */
async function loadEligibleChannelIds(supabase) {
  const ids = new Set();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("channels")
      .select("id")
      .in("status", ["active", "paused"])
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error("Failed to read channels: " + error.message);

    for (const row of data || []) ids.add(row.id);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return ids;
}

async function loadWindowCounts(supabase, sinceIso, eligibleChannelIds) {
  const counts = new Map();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("calls")
      .select("token_id, channel_id")
      .in("status", ["open", "closed"])
      .gte("called_at", sinceIso)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error("Failed to read calls: " + error.message);

    for (const row of data || []) {
      if (!row.token_id) continue;
      if (!eligibleChannelIds.has(row.channel_id)) continue;

      let entry = counts.get(row.token_id);
      if (!entry) {
        entry = { channels: new Set(), totalCalls: 0 };
        counts.set(row.token_id, entry);
      }
      entry.channels.add(row.channel_id);
      entry.totalCalls += 1;
    }

    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return counts;
}

async function loadActiveTokenIds(supabase, tokenIds) {
  const active = new Set();

  for (const batch of chunk(tokenIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("tokens")
      .select("id")
      .eq("status", "active")
      .in("id", batch);

    if (error) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to read token statuses", {
        error: error.message,
        batchSize: batch.length
      });
      continue;
    }

    for (const row of data || []) active.add(row.id);
  }

  return active;
}

/**
 * Tokens currently marked trending. These must be re-evaluated even when they
 * have no calls left in the window, otherwise a token that goes quiet stays
 * trending forever.
 */
async function loadTrendingTokenIds(supabase) {
  const ids = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("token_trending_state")
      .select("token_id")
      .eq("is_trending", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error("Failed to read token_trending_state: " + error.message);

    for (const row of data || []) ids.push(row.token_id);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return ids;
}

async function loadStateRows(supabase, tokenIds) {
  const byToken = new Map();

  for (const batch of chunk(tokenIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("token_trending_state")
      .select("token_id, is_trending, entered_at, exited_at")
      .in("token_id", batch);

    if (error) throw new Error("Failed to read token_trending_state: " + error.message);

    for (const row of data || []) byToken.set(row.token_id, row);
  }

  return byToken;
}

async function loadTokens(supabase, tokenIds) {
  const tokensById = new Map();

  for (const batch of chunk(tokenIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("tokens")
      .select("id, symbol, name, contract_address")
      .in("id", batch);

    if (error) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to load tokens for alert copy", {
        error: error.message
      });
      continue;
    }

    for (const token of data || []) tokensById.set(token.id, token);
  }

  return tokensById;
}

// ---------------------------------------------------------------------------
// Phase 1: evaluate the window
// ---------------------------------------------------------------------------

async function evaluateTrending(supabase) {
  const nowIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const eligibleChannelIds = await loadEligibleChannelIds(supabase);
  const counts = await loadWindowCounts(supabase, sinceIso, eligibleChannelIds);

  const candidateIds = Array.from(counts.keys());
  const activeTokenIds = await loadActiveTokenIds(supabase, candidateIds);
  const previouslyTrending = await loadTrendingTokenIds(supabase);

  const universe = new Set();
  for (const id of candidateIds) {
    if (activeTokenIds.has(id)) universe.add(id);
  }
  for (const id of previouslyTrending) universe.add(id);

  const tokenIds = Array.from(universe);
  const existingByToken = await loadStateRows(supabase, tokenIds);

  const stateRows = [];
  const changeRows = [];
  let seeded = 0;
  let entered = 0;
  let exited = 0;
  let trendingNow = 0;

  for (const tokenId of tokenIds) {
    const entry = counts.get(tokenId);
    const uniqueChannels = entry ? entry.channels.size : 0;
    const totalCalls = entry ? entry.totalCalls : 0;

    const existing = existingByToken.get(tokenId) || null;
    const wasTrending = existing ? existing.is_trending === true : null;

    const isTrending =
      wasTrending === true
        ? uniqueChannels >= EXIT_MIN_CHANNELS
        : uniqueChannels >= ENTER_MIN_CHANNELS && totalCalls >= ENTER_MIN_CALLS;

    if (isTrending) trendingNow += 1;

    let enteredAt = existing ? existing.entered_at : null;
    let exitedAt = existing ? existing.exited_at : null;

    if (!existing) {
      seeded += 1;
      if (isTrending) enteredAt = nowIso;
    } else if (wasTrending !== isTrending) {
      if (isTrending) {
        entered += 1;
        enteredAt = nowIso;
      } else {
        exited += 1;
        exitedAt = nowIso;
      }
    }

    stateRows.push({
      token_id: tokenId,
      is_trending: isTrending,
      unique_channels: uniqueChannels,
      total_calls: totalCalls,
      window_hours: WINDOW_HOURS,
      entered_at: enteredAt,
      exited_at: exitedAt,
      last_evaluated_at: nowIso
    });

    /*
     * Seeding is deliberately silent.
     *
     * token_trending_state starts empty, so on the first ever cycle every hot
     * token would look like it had just entered trending and the dispatcher
     * would fan a backlog out to every subscriber. Only a STORED transition
     * counts as an event. Same reasoning as the notified_at backfill in
     * migration 007.
     */
    if (existing && wasTrending !== isTrending) {
      changeRows.push({
        token_id: tokenId,
        direction: isTrending ? "entered" : "exited",
        unique_channels: uniqueChannels,
        total_calls: totalCalls,
        window_hours: WINDOW_HOURS,
        details: {
          enterMinChannels: ENTER_MIN_CHANNELS,
          enterMinCalls: ENTER_MIN_CALLS,
          exitMinChannels: EXIT_MIN_CHANNELS
        }
      });
    }
  }

  for (const batch of chunk(stateRows, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("token_trending_state")
      .upsert(batch, { onConflict: "token_id" });

    if (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to upsert token_trending_state batch", {
        error: error.message,
        batchSize: batch.length
      });
    }
  }

  for (const batch of chunk(changeRows, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase.from("trending_changes").insert(batch);

    if (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to insert trending_changes batch", {
        error: error.message,
        batchSize: batch.length
      });
    }
  }

  return {
    tokensEvaluated: tokenIds.length,
    trendingNow,
    seeded,
    entered,
    exited
  };
}

// ---------------------------------------------------------------------------
// Phase 2: dispatch
// ---------------------------------------------------------------------------

/**
 * Direction defaults to "entered". Someone subscribing to trending alerts
 * wants to hear that a token got hot, not that it went quiet, unless they ask
 * for both with "any".
 */
function ruleMatches(rule, change) {
  if (rule.token_id && rule.token_id !== change.token_id) return false;

  const conditions = rule.conditions || {};
  const wantedDirection =
    typeof conditions.direction === "string" ? conditions.direction : "entered";

  if (wantedDirection !== "any" && wantedDirection !== change.direction) return false;
  if (toNumber(change.unique_channels) < toNumber(conditions.min_unique_channels, 0)) {
    return false;
  }

  return true;
}

function buildNotification(rule, change, token) {
  const symbol = token && token.symbol ? token.symbol : "A token";
  const channelCount = toNumber(change.unique_channels);
  const callers = channelCount === 1 ? "1 caller" : channelCount + " callers";
  const hours = toNumber(change.window_hours, WINDOW_HOURS);
  const isEntering = change.direction === "entered";

  return {
    user_id: rule.user_id,
    alert_rule_id: rule.id,
    token_id: change.token_id,
    title: isEntering ? symbol + " is trending" : symbol + " has cooled off",
    body: isEntering
      ? callers + " posted it in the last " + hours + " hours."
      : "Down to " + callers + " in the last " + hours + " hours.",
    // user_notifications_url_chk allows a site-relative path or an http(s) URL.
    url:
      token && token.contract_address
        ? "/tokens/" + token.contract_address
        : "/trending",
    status: "sent",
    payload: {
      trendingChangeId: change.id,
      direction: change.direction,
      uniqueChannels: change.unique_channels,
      totalCalls: change.total_calls,
      windowHours: change.window_hours
    }
  };
}

async function markNotified(supabase, changeIds) {
  const stamp = new Date().toISOString();

  for (const batch of chunk(changeIds, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("trending_changes")
      .update({ notified_at: stamp })
      .in("id", batch);

    if (error) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to mark trending_changes dispatched", {
        error: error.message,
        batchSize: batch.length
      });
    }
  }
}

async function dispatchTrendingChanges(supabase) {
  const { data: changes, error: changesError } = await supabase
    .from("trending_changes")
    .select(
      "id, token_id, direction, unique_channels, total_calls, window_hours, created_at"
    )
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_CHANGES_PER_CYCLE);

  if (changesError) {
    throw new Error("Failed to read trending_changes: " + changesError.message);
  }

  if (!changes || changes.length === 0) {
    return {
      pendingChanges: 0,
      activeRules: 0,
      notificationsCreated: 0,
      mutedByPreference: 0,
      unsupportedDelivery: 0
    };
  }

  const { data: rules, error: rulesError } = await supabase
    .from("user_alert_rules")
    .select("id, user_id, token_id, conditions, delivery_channels")
    .eq("rule_type", RULE_TYPE)
    .eq("is_active", true);

  if (rulesError) {
    throw new Error("Failed to read user_alert_rules: " + rulesError.message);
  }

  // Nobody subscribed. Still stamp the rows, otherwise every future cycle
  // rescans the same growing backlog for nothing.
  if (!rules || rules.length === 0) {
    await markNotified(supabase, changes.map((change) => change.id));
    return {
      pendingChanges: changes.length,
      activeRules: 0,
      notificationsCreated: 0,
      mutedByPreference: 0,
      unsupportedDelivery: 0
    };
  }

  const enabledUserIds = await loadEnabledUserIds(
    supabase,
    rules.map((rule) => rule.user_id),
    WORKER_NAME
  );
  const deliverableRules = rules.filter((rule) => enabledUserIds.has(rule.user_id));
  const mutedByPreference = rules.length - deliverableRules.length;

  if (deliverableRules.length === 0) {
    await markNotified(supabase, changes.map((change) => change.id));
    return {
      pendingChanges: changes.length,
      activeRules: rules.length,
      notificationsCreated: 0,
      mutedByPreference,
      unsupportedDelivery: 0
    };
  }

  const tokenIds = Array.from(new Set(changes.map((change) => change.token_id)));
  const tokensById = await loadTokens(supabase, tokenIds);

  const notifications = [];
  let unsupportedDelivery = 0;

  for (const change of changes) {
    const token = tokensById.get(change.token_id) || null;

    for (const rule of deliverableRules) {
      if (!ruleMatches(rule, change)) continue;

      const deliveryChannels = rule.delivery_channels || [];

      // Email and Telegram delivery are not built yet. Count them so the gap
      // is visible in the logs instead of failing silently.
      if (deliveryChannels.some((channel) => channel !== "in_app")) {
        unsupportedDelivery += 1;
      }

      if (deliveryChannels.length > 0 && !deliveryChannels.includes("in_app")) continue;

      notifications.push(buildNotification(rule, change, token));
    }
  }

  let notificationsCreated = 0;

  for (const batch of chunk(notifications, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase.from("user_notifications").insert(batch);

    if (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to insert user_notifications batch", {
        error: error.message,
        batchSize: batch.length
      });
      continue;
    }

    notificationsCreated += batch.length;
  }

  // Only after delivery attempts. See the at-least-once note at the top.
  await markNotified(supabase, changes.map((change) => change.id));

  if (notifications.length > 0) {
    const triggered = Array.from(new Set(notifications.map((item) => item.alert_rule_id)));

    for (const batch of chunk(triggered, WRITE_CHUNK_SIZE)) {
      const { error } = await supabase
        .from("user_alert_rules")
        .update({ last_triggered_at: new Date().toISOString() })
        .in("id", batch);

      if (error) {
        log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to update last_triggered_at", {
          error: error.message
        });
      }
    }
  }

  return {
    pendingChanges: changes.length,
    activeRules: rules.length,
    notificationsCreated,
    mutedByPreference,
    unsupportedDelivery
  };
}

async function runCycle(supabase) {
  const evaluation = await evaluateTrending(supabase);
  const dispatch = await dispatchTrendingChanges(supabase);

  return {
    windowHours: WINDOW_HOURS,
    enterMinChannels: ENTER_MIN_CHANNELS,
    exitMinChannels: EXIT_MIN_CHANNELS,
    ...evaluation,
    ...dispatch
  };
}

async function main() {
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let running = false;

  async function runGuardedCycle() {
    if (running) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Previous cycle still running, skipping");
      return;
    }

    running = true;
    const runId = await startWorkerRun(supabase, WORKER_NAME, {
      windowHours: WINDOW_HOURS,
      enterMinChannels: ENTER_MIN_CHANNELS,
      exitMinChannels: EXIT_MIN_CHANNELS
    });

    try {
      const summary = await runCycle(supabase);
      log(LOG_LEVELS.INFO, WORKER_NAME, "Trending alert cycle complete", summary);
      await finishWorkerRun(supabase, WORKER_NAME, runId, "succeeded", summary);
    } catch (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Trending alert cycle failed", {
        error: error.message
      });
      await finishWorkerRun(supabase, WORKER_NAME, runId, "failed", { error: error.message });
    } finally {
      running = false;
    }
  }

  await runGuardedCycle();

  if (process.env.WORKER_RUN_ONCE === "true") {
    log(LOG_LEVELS.INFO, WORKER_NAME, "Run-once mode complete");
    return;
  }

  // No unref() here on purpose: unref lets the process exit while the timer is
  // pending, which would make daemon mode run exactly one cycle and quit.
  setInterval(runGuardedCycle, POLL_INTERVAL_MS);
}

main().catch((error) => {
  log(LOG_LEVELS.ERROR, WORKER_NAME, "Fatal worker crash", { error: error.message });
  process.exit(1);
});
