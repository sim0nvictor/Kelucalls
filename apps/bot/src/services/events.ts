import type { Telegraf } from "telegraf";
import { withRetry } from "../utils/retry.js";
import { supabase } from "../db/client.js";
import { getCallAlert, getTrendingTokenById } from "./queries.js";
import { formatEventAlert } from "../utils/formatters.js";
import { logger } from "../utils/logger.js";
import type { AlertPreferences, BotEvent, CallAlertRow, TelegramUser, TrendingTokenRow } from "../types/domain.js";

type Recipient = {
  telegram_users: TelegramUser;
  telegram_alert_preferences: AlertPreferences | null;
};

// Events that get the video banner as caption
const VIDEO_EVENT_TYPES = new Set(["new_call", "achievement", "coordinated_call", "trending"]);

const VIDEO_FILE_ID = process.env.KELUCALLS_BANNER_VIDEO_ID ?? null;

export async function getPendingEvents(limit = 25): Promise<BotEvent[]> {
  const { data, error } = await supabase
    .from("bot_events")
    .select("*")
    .eq("processed", false)
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BotEvent[];
}

async function markEventProcessed(eventId: string): Promise<void> {
  const { error } = await supabase
    .from("bot_events")
    .update({ processed: true, processed_at: new Date().toISOString(), last_error: null })
    .eq("id", eventId);

  if (error) throw error;
}

async function markEventFailed(eventId: string, error: unknown): Promise<void> {
  const { error: rpcError } = await supabase.rpc("increment_bot_event_attempts", {
    event_id: eventId,
    error_message: error instanceof Error ? error.message : String(error)
  });

  if (rpcError) {
    logger.error({ rpcError, eventId }, "Failed to record bot event error");
  }
}

async function getRecipients(): Promise<Recipient[]> {
  const { data: subscriptions, error: subError } = await supabase
    .from("telegram_subscriptions")
    .select("telegram_user_id")
    .eq("is_active", true);

  if (subError) throw subError;

  const userIds = [...new Set((subscriptions ?? []).map((row) => row.telegram_user_id).filter(Boolean))];
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from("telegram_users")
    .select("*, telegram_alert_preferences (*)")
    .in("id", userIds)
    .eq("is_active", true);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    telegram_users: row as TelegramUser,
    telegram_alert_preferences: Array.isArray(row.telegram_alert_preferences)
      ? (row.telegram_alert_preferences[0] as AlertPreferences | null)
      : (row.telegram_alert_preferences as AlertPreferences | null)
  }));
}

function shouldSend(event: BotEvent, recipient: Recipient, row: CallAlertRow | TrendingTokenRow | null): boolean {
  const prefs = recipient.telegram_alert_preferences;
  if (!prefs) return true;

  if (event.event_type === "achievement" && !prefs.achievement_alerts_enabled) return false;
  if ((event.event_type === "new_call" || event.event_type === "coordinated_call") && !prefs.smart_call_alerts_enabled) return false;

  if (row && "confidence_score" in row) {
    if (Number(row.confidence_score) < Number(prefs.min_score)) return false;
    const channel = Array.isArray(row.channels) ? row.channels[0] : row.channels;
    if (prefs.verified_channels_only && !channel?.is_verified) return false;
    const token = Array.isArray(row.tokens) ? row.tokens[0] : row.tokens;
    if (prefs.chains.length > 0 && token?.chain && !prefs.chains.includes(token.chain.toLowerCase())) return false;
  }

  if (row && "chain" in row && prefs.chains.length > 0) {
    return prefs.chains.includes(row.chain.toLowerCase());
  }

  return true;
}

async function getEventRow(event: BotEvent): Promise<CallAlertRow | TrendingTokenRow | null> {
  if ((event.event_type === "new_call" || event.event_type === "achievement" || event.event_type === "coordinated_call") && event.call_id) {
    return getCallAlert(event.call_id);
  }
  if (event.event_type === "trending" && event.token_id) {
    return getTrendingTokenById(event.token_id);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Send to a single recipient — video+caption or plain text
// ---------------------------------------------------------------------------
async function sendToRecipient(
  bot: Telegraf,
  chatId: number,
  message: string,
  useVideo: boolean
): Promise<void> {
  if (useVideo && VIDEO_FILE_ID) {
    // Single message: video with alert text as caption
    await withRetry(
      () => bot.telegram.sendAnimation(chatId, VIDEO_FILE_ID, {
        caption: message,
        parse_mode: "HTML",
      }),
      { retries: 3, delayMs: 750 }
    );
  } else {
    // Fallback: plain text if no video configured
    await withRetry(
      () => bot.telegram.sendMessage(chatId, message, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
      { retries: 3, delayMs: 750 }
    );
  }
}

export async function processEvent(bot: Telegraf, event: BotEvent): Promise<void> {
  const row = await getEventRow(event);
  const message = formatEventAlert(event, row);
  const recipients = await getRecipients();
  const useVideo = VIDEO_EVENT_TYPES.has(event.event_type);
  let sent = 0;

  for (const recipient of recipients) {
    if (!shouldSend(event, recipient, row)) continue;
    await sendToRecipient(bot, recipient.telegram_users.telegram_chat_id, message, useVideo);
    sent += 1;
  }

  await markEventProcessed(event.id);
  logger.info({ eventId: event.id, eventType: event.event_type, sent }, "Processed bot event");
}

export async function processEventSafely(bot: Telegraf, event: BotEvent): Promise<void> {
  try {
    await processEvent(bot, event);
  } catch (error) {
    logger.error({ error, eventId: event.id }, "Failed to process bot event");
    await markEventFailed(event.id, error);
  }
}