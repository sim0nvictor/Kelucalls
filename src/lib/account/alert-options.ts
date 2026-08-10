/**
 * The catalogue of alert kinds, in one place.
 *
 * createAlertRuleAction() takes ruleType as a plain string so that adding an
 * alert kind never means touching the server action. This file is the other
 * half of that bargain: it is the single list the UI renders from, so a new
 * alert kind is one entry here plus a dispatcher in workers/.
 *
 * `available` is the honesty flag. Most of these rule types are valid enum
 * values with no worker behind them yet, and offering them would let someone
 * create an alert that can never fire. They render disabled until their
 * dispatcher ships, at which point this flips to true and nothing else has to
 * change.
 *
 * Scope maps directly onto user_alert_rules_target_chk as rewritten in
 * migration 007: channel_new_call and channel_big_win require a channel_id,
 * every other rule type is unconstrained. Getting this wrong means the insert
 * fails at the database rather than in the form, so keep the two in step.
 */

export type AlertScope = "channel" | "global";

export type AlertVolume = "low" | "medium" | "high";

export type AlertOption = {
  ruleType: string;
  label: string;
  description: string;
  scope: AlertScope;
  volume: AlertVolume;
  available: boolean;
  /** Written into user_alert_rules.conditions when the rule is created. */
  defaultConditions: Record<string, unknown>;
};

export const ALERT_OPTIONS: readonly AlertOption[] = [
  {
    ruleType: "token_intent_spike",
    label: "KeluScore moves sharply",
    description:
      "A token gains or loses ground fast on the KeluScore model behind the Opportunities page.",
    scope: "global",
    volume: "low",
    available: true,
    defaultConditions: { min_delta: 10, direction: "up" }
  },
  {
    ruleType: "token_trending",
    label: "Token starts trending",
    description:
      "Several different callers start posting the same token inside a short window.",
    scope: "global",
    volume: "medium",
    // Dispatcher: workers/trending-alerts.js
    available: true,
    defaultConditions: { min_unique_channels: 3, direction: "entered" }
  },
  {
    ruleType: "channel_new_call",
    label: "New call posted",
    description:
      "A caller you follow posts a new call. By far the highest volume alert here.",
    scope: "channel",
    volume: "high",
    available: false,
    defaultConditions: {}
  },
  {
    ruleType: "channel_big_win",
    label: "Big win from this caller",
    description: "A call from someone you follow crosses 2x, 10x or 100x.",
    scope: "channel",
    volume: "low",
    available: false,
    defaultConditions: { min_multiple: 2 }
  },
  {
    ruleType: "token_price_move",
    label: "Big gainer or loser",
    description:
      "A token you are watching moves hard in either direction over 24 hours.",
    scope: "global",
    volume: "medium",
    available: false,
    defaultConditions: { min_change_pct: 25, direction: "up" }
  },
  {
    ruleType: "watchlist_digest",
    label: "Daily watchlist digest",
    description: "One summary a day covering everyone you follow. The quiet option.",
    scope: "global",
    volume: "low",
    available: false,
    defaultConditions: { hour_utc: 13 }
  }
];

const OPTION_BY_TYPE = new Map(ALERT_OPTIONS.map((option) => [option.ruleType, option]));

export function alertOptionFor(ruleType: string): AlertOption | null {
  return OPTION_BY_TYPE.get(ruleType) ?? null;
}

/**
 * Human label for a rule type, including ones this build does not know about.
 * A rule created by a newer deploy should still render readably here.
 */
export function alertLabel(ruleType: string): string {
  return OPTION_BY_TYPE.get(ruleType)?.label ?? ruleType.replace(/_/g, " ");
}

export function alertDescription(ruleType: string): string | null {
  return OPTION_BY_TYPE.get(ruleType)?.description ?? null;
}

export const AVAILABLE_ALERT_OPTIONS: readonly AlertOption[] = ALERT_OPTIONS.filter(
  (option) => option.available
);

export const UPCOMING_ALERT_OPTIONS: readonly AlertOption[] = ALERT_OPTIONS.filter(
  (option) => !option.available
);

export const VOLUME_HINTS: Record<AlertVolume, string> = {
  low: "Rare",
  medium: "A few a week",
  high: "Very frequent"
};

/**
 * Master notification switch, stored on profiles.preferences.
 *
 * Absent means on. Accounts created before this shipped have preferences '{}'
 * and should still receive alerts they explicitly asked for, so the default
 * has to be true rather than false.
 *
 * This constant lives here rather than in a "use server" module because such
 * a module may only export async functions.
 *
 * The worker-side twin of this logic is workers/alert-prefs.js. If you change
 * the default here, change it there too.
 */
export const NOTIFICATIONS_ENABLED_KEY = "notifications_enabled";

export function notificationsEnabled(
  preferences: Record<string, unknown> | null | undefined
): boolean {
  const value = preferences?.[NOTIFICATIONS_ENABLED_KEY];
  if (value === undefined || value === null) return true;
  return value !== false;
}
