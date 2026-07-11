import type { Context } from "telegraf";
import type { AlertPreferences, TelegramUser } from "../types/domain.js";
import { supabase } from "../db/client.js";

export async function upsertTelegramUser(ctx: Context): Promise<TelegramUser> {
  const chat = ctx.chat;
  const from = ctx.from;
  if (!chat) throw new Error("Telegram chat is missing");

  const { data, error } = await supabase
    .from("telegram_users")
    .upsert(
      {
        telegram_chat_id: chat.id,
        username: from?.username ?? null,
        first_name: from?.first_name ?? null,
        last_name: from?.last_name ?? null,
        is_active: true,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "telegram_chat_id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  await ensureAlertPreferences(data.id);
  return data as TelegramUser;
}

export async function getTelegramUserByChatId(chatId: number): Promise<TelegramUser | null> {
  const { data, error } = await supabase
    .from("telegram_users")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (error) throw error;
  return data as TelegramUser | null;
}

export async function ensureAlertPreferences(userId: string): Promise<AlertPreferences> {
  const { data, error } = await supabase
    .from("telegram_alert_preferences")
    .upsert({ telegram_user_id: userId }, { onConflict: "telegram_user_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data as AlertPreferences;
}

export async function updateAlertPreferences(userId: string, patch: Partial<AlertPreferences>) {
  const { error } = await supabase
    .from("telegram_alert_preferences")
    .update(patch)
    .eq("telegram_user_id", userId);

  if (error) throw error;
}

export async function setUserActive(userId: string, isActive: boolean) {
  const { error } = await supabase
    .from("telegram_users")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) throw error;
}

