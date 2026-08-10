import { LOG_LEVELS, chunk, log } from "./worker-utils.js";

/**
 * Shared notification preference reads for alert dispatchers.
 *
 * Every dispatcher has to answer the same question before sending anything:
 * has this user switched notifications off entirely? Putting that in one place
 * means a new alert type cannot accidentally ignore the master switch.
 *
 * The switch lives on profiles.preferences rather than in its own column, so
 * adding preference keys never costs a migration.
 */

const IN_CHUNK_SIZE = 200;

/**
 * Must stay in step with NOTIFICATIONS_ENABLED_KEY in
 * src/lib/account/alert-options.ts. Two constants, one meaning: if you rename
 * one, rename the other.
 */
export const NOTIFICATIONS_ENABLED_KEY = "notifications_enabled";

/**
 * Absent means on. Accounts created before the switch shipped have an empty
 * preferences object and should still receive alerts they explicitly asked
 * for, so the default has to be true rather than false.
 */
export function notificationsEnabled(preferences) {
  const value = preferences ? preferences[NOTIFICATIONS_ENABLED_KEY] : undefined;
  if (value === undefined || value === null) return true;
  return value !== false;
}

/**
 * Given the user ids behind a set of alert rules, return the ones that still
 * accept notifications.
 *
 * Fails open. If the preferences read errors, the batch is treated as enabled
 * rather than silently muted: the caller marks source rows dispatched straight
 * afterwards, so dropping here would lose those alerts permanently. An extra
 * notification is recoverable, a missing one is not.
 */
export async function loadEnabledUserIds(supabase, userIds, workerName) {
  const enabled = new Set();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return enabled;

  for (const batch of chunk(unique, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, preferences")
      .in("id", batch);

    if (error) {
      log(
        LOG_LEVELS.WARN,
        workerName,
        "Failed to read notification preferences, allowing this batch",
        { error: error.message, batchSize: batch.length }
      );
      for (const id of batch) enabled.add(id);
      continue;
    }

    const seen = new Set();
    for (const row of data || []) {
      seen.add(row.id);
      if (notificationsEnabled(row.preferences)) enabled.add(row.id);
    }

    // A user with no profile row has never turned anything off.
    for (const id of batch) {
      if (!seen.has(id)) enabled.add(id);
    }
  }

  return enabled;
}
