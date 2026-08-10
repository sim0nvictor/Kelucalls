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
 * KeluScore alert dispatch.
 *
 * Deliberately a separate worker rather than a branch inside
 * workers/intent-engine.js. Scoring and notifying are different jobs with
 * different failure modes: a bug here must never be able to stop scores being
 * written, and this can be run on a different schedule.
 *
 * Delivery is at-least-once. Notifications are inserted before the source row
 * is marked dispatched, so a crash in between re-sends rather than silently
 * dropping. Duplicate notifications are annoying; missing alerts are a broken
 * feature.
 */

const WORKER_NAME = "intent-alerts";

const POLL_INTERVAL_MS = getNumberEnv("INTENT_ALERTS_INTERVAL_MS", 5 * 60 * 1000);
const MAX_CHANGES_PER_CYCLE = getNumberEnv("INTENT_ALERTS_MAX_CHANGES", 200);
const WRITE_CHUNK_SIZE = 100;
const IN_CHUNK_SIZE = 200;
const RULE_TYPE = "token_intent_spike";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A rule with no token_id watches every token. A rule with one watches only
 * that token. Thresholds live in the conditions jsonb so new knobs never need
 * a migration.
 */
function ruleMatches(rule, change) {
  if (rule.token_id && rule.token_id !== change.token_id) return false;

  const conditions = rule.conditions || {};
  const minDelta = toNumber(conditions.min_delta, 0);
  const minScore = toNumber(conditions.min_score, 0);
  const wantedDirection =
    typeof conditions.direction === "string" ? conditions.direction : "any";

  if (wantedDirection !== "any" && wantedDirection !== change.direction) return false;
  if (Math.abs(toNumber(change.delta)) < minDelta) return false;
  if (toNumber(change.current_score) < minScore) return false;

  return true;
}

function buildNotification(rule, change, token) {
  const symbol = token && token.symbol ? token.symbol : "A token";
  const delta = Math.abs(toNumber(change.delta)).toFixed(1);
  const movement = change.direction === "up" ? "rose" : "fell";
  const current = toNumber(change.current_score).toFixed(1);
  const gradePart = change.current_grade ? " Grade " + change.current_grade + "." : "";
  const reasonPart = change.reason ? " " + change.reason : "";

  return {
    user_id: rule.user_id,
    alert_rule_id: rule.id,
    token_id: change.token_id,
    title: symbol + " KeluScore " + movement + " " + delta + " points",
    body: "KeluScore is now " + current + "." + gradePart + reasonPart,
    // user_notifications_url_chk allows a site-relative path or an http(s) URL.
    url:
      token && token.contract_address
        ? "/tokens/" + token.contract_address
        : "/opportunities",
    status: "sent",
    payload: {
      scoreChangeId: change.id,
      delta: toNumber(change.delta),
      direction: change.direction,
      previousScore: change.previous_score,
      currentScore: change.current_score,
      previousGrade: change.previous_grade,
      currentGrade: change.current_grade
    }
  };
}

async function markNotified(supabase, changeIds) {
  const stamp = new Date().toISOString();

  for (const batch of chunk(changeIds, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("score_changes")
      .update({ notified_at: stamp })
      .in("id", batch);

    if (error) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to mark score_changes dispatched", {
        error: error.message,
        batchSize: batch.length
      });
    }
  }
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

    for (const token of data || []) {
      tokensById.set(token.id, token);
    }
  }

  return tokensById;
}

async function runCycle(supabase) {
  const { data: changes, error: changesError } = await supabase
    .from("score_changes")
    .select(
      "id, token_id, previous_score, current_score, delta, direction, previous_grade, current_grade, reason, created_at"
    )
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_CHANGES_PER_CYCLE);

  if (changesError) {
    throw new Error("Failed to read score_changes: " + changesError.message);
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

  // Nobody is subscribed yet. Still mark the rows processed, otherwise every
  // future cycle rescans the same growing backlog for nothing.
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

  /*
   * The master switch on the Alerts page is enforced here, not in the UI.
   * A rule can stay active while its owner has notifications switched off
   * globally, so the per-rule toggle and the account-wide one compose rather
   * than fight: turning the master switch back on restores exactly the rules
   * that were already there.
   */
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
      maxChangesPerCycle: MAX_CHANGES_PER_CYCLE
    });

    try {
      const summary = await runCycle(supabase);
      log(LOG_LEVELS.INFO, WORKER_NAME, "Alert dispatch cycle complete", summary);
      await finishWorkerRun(supabase, WORKER_NAME, runId, "succeeded", summary);
    } catch (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Alert dispatch cycle failed", {
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
