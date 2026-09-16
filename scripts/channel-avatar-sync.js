/**
 * Channel Avatar Sync
 *
 * For each active/paused channel, fetches its public Telegram profile photo via
 * the Bot API, DOWNLOADS the image server-side, uploads it to the public
 * Supabase Storage `assets` bucket, and saves the STABLE Storage URL to
 * channels.avatar_url.
 *
 * The temporary, token-bearing Telegram getFile URL
 * (https://api.telegram.org/file/bot<TOKEN>/...) is used only at runtime to
 * download the bytes — it is NEVER stored in the database or logged. The bot
 * token stays runtime-only.
 *
 * Change detection: the Telegram photo's stable `big_file_unique_id` is kept in
 * channels.metadata.avatar_source_id. When it is unchanged AND the channel
 * already has a stable Storage avatar, the download/upload/write is skipped.
 *
 * Run manually (or as a weekly cron):
 *   node scripts/channel-avatar-sync.js            # all active/paused channels
 *   node scripts/channel-avatar-sync.js --missing  # only channels without a
 *                                                   # stable Storage avatar yet
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN        — your bot token from @BotFather
 *   NEXT_PUBLIC_SUPABASE_URL  — or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — or SUPABASE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { isStableAssetUrl, resolveTelegramAvatar } from "../workers/asset-store.js";
dotenv.config();

function getEnv(name, fallback = null) {
  return process.env[name] ?? fallback;
}

function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }));
}

/** Remove the bot token from any string before it is logged. */
function redact(text, secret) {
  const str = String(text ?? "");
  return secret ? str.split(secret).join("[REDACTED]") : str;
}

function getSupabase() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL") || getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_KEY");
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function main() {
  const botToken = getEnv("TELEGRAM_BOT_TOKEN");
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const supabase = getSupabase();
  const missingOnly = process.argv.includes("--missing");

  const { data: channels, error } = await supabase
    .from("channels")
    .select("id, slug, telegram_handle, avatar_url, metadata")
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: true });

  if (error) throw new Error(`DB fetch failed: ${error.message}`);

  // --missing skips channels that already have a stable Storage avatar (cheap
  // backfill/repair). The default run visits every channel so changed photos
  // are detected via big_file_unique_id.
  const targets = missingOnly
    ? channels.filter((c) => !isStableAssetUrl(c.avatar_url))
    : channels;

  log("INFO", `Processing ${targets.length} channels`, {
    missingOnly,
    total: channels.length,
  });

  let updated = 0;
  let skipped = 0;
  let noPhoto = 0;
  let failed = 0;

  for (const channel of targets) {
    try {
      const currentSourceId = channel.metadata?.avatar_source_id ?? null;
      const resolved = await resolveTelegramAvatar(
        botToken,
        channel.telegram_handle,
        supabase,
        channel.id,
        {
          currentSourceId,
          hasStableAsset: isStableAssetUrl(channel.avatar_url),
        }
      );

      if (!resolved) {
        log("DEBUG", "No avatar on Telegram", { slug: channel.slug });
        noPhoto++;
        continue;
      }

      if (resolved.unchanged) {
        log("DEBUG", "Avatar unchanged", { slug: channel.slug });
        skipped++;
        continue;
      }

      const nextMetadata = {
        ...(channel.metadata ?? {}),
        avatar_source_id: resolved.sourceId,
        avatar_updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("channels")
        .update({ avatar_url: resolved.publicUrl, metadata: nextMetadata })
        .eq("id", channel.id);

      if (updateError) {
        log("ERROR", "Failed to save avatar_url", {
          slug: channel.slug,
          error: redact(updateError.message, botToken),
        });
        failed++;
      } else {
        log("INFO", "Avatar saved", { slug: channel.slug });
        updated++;
      }
    } catch (err) {
      // Private/not-found channels answer getChat with 400 — treat as "no photo"
      // rather than a hard failure so the run continues cleanly. One failed
      // channel never stops the worker.
      if (err?.response?.status === 400) {
        log("DEBUG", "Channel not accessible via Bot API", { slug: channel.slug });
        noPhoto++;
      } else {
        log("WARN", "Channel avatar sync failed", {
          slug: channel.slug,
          error: redact(err.message, botToken),
        });
        failed++;
      }
    }

    // Polite rate limiting — Telegram allows ~30 req/s per bot.
    await new Promise((r) => setTimeout(r, 150));
  }

  log("INFO", "Done", { updated, skipped, noPhoto, failed, total: targets.length });
}

main().catch((err) => {
  log("ERROR", "Fatal", { error: redact(err.message, process.env.TELEGRAM_BOT_TOKEN) });
  process.exit(1);
});
