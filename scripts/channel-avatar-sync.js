/**
 * Channel Avatar Sync
 *
 * Fetches each channel's Telegram profile photo via the Bot API
 * and saves the public photo URL to channels.avatar_url in Supabase.
 *
 * Run once manually (or add as a weekly cron):
 *   node channel-avatar-sync.js
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN        — your bot token from @BotFather
 *   NEXT_PUBLIC_SUPABASE_URL  — or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — or SUPABASE_KEY
 */

import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

function getEnv(name, fallback = null) {
  return process.env[name] ?? fallback;
}

function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }));
}

function getSupabase() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL") || getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_KEY");
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Fetches the public avatar URL for a Telegram username via the Bot API.
 * Returns null if the channel has no photo or the request fails.
 */
async function fetchTelegramAvatar(botToken, handle) {
  // Strip leading @ if present
  const username = handle.replace(/^@/, "");

  try {
    // Step 1: get the chat object — includes photo.big_file_id
    const chatRes = await axios.get(
      `https://api.telegram.org/bot${botToken}/getChat`,
      { params: { chat_id: `@${username}` }, timeout: 8000 }
    );

    const fileId = chatRes.data?.result?.photo?.big_file_id;
    if (!fileId) return null;

    // Step 2: resolve the file path
    const fileRes = await axios.get(
      `https://api.telegram.org/bot${botToken}/getFile`,
      { params: { file_id: fileId }, timeout: 8000 }
    );

    const filePath = fileRes.data?.result?.file_path;
    if (!filePath) return null;

    // Step 3: build the public CDN URL
    return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  } catch (err) {
    // 400 = channel not found / private; swallow and return null
    if (err?.response?.status === 400) return null;
    log("WARN", "Telegram avatar fetch failed", { handle, error: err.message });
    return null;
  }
}

async function main() {
  const botToken = getEnv("TELEGRAM_BOT_TOKEN");
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const supabase = getSupabase();

  // Fetch all active channels that don't yet have an avatar
  const { data: channels, error } = await supabase
    .from("channels")
    .select("id, slug, telegram_handle, avatar_url")
    .in("status", ["active", "paused"])
    // Uncomment the line below to only backfill missing avatars:
    // .is("avatar_url", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`DB fetch failed: ${error.message}`);
  log("INFO", `Processing ${channels.length} channels`);

  let updated = 0;
  let skipped = 0;

  for (const channel of channels) {
    const url = await fetchTelegramAvatar(botToken, channel.telegram_handle);

    if (!url) {
      log("DEBUG", "No avatar found", { slug: channel.slug });
      skipped++;
      continue;
    }

    if (url === channel.avatar_url) {
      log("DEBUG", "Avatar unchanged", { slug: channel.slug });
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("channels")
      .update({ avatar_url: url })
      .eq("id", channel.id);

    if (updateError) {
      log("ERROR", "Failed to save avatar_url", { slug: channel.slug, error: updateError.message });
    } else {
      log("INFO", "Avatar saved", { slug: channel.slug });
      updated++;
    }

    // Polite rate limiting — Telegram allows ~30 req/s per bot
    await new Promise((r) => setTimeout(r, 150));
  }

  log("INFO", "Done", { updated, skipped, total: channels.length });
}

main().catch((err) => {
  log("ERROR", "Fatal", { error: err.message });
  process.exit(1);
});