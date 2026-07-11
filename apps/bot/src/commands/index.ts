import type { Context, Telegraf } from "telegraf";
import { Markup } from "telegraf";
import { splitCommandArgs } from "../../../../packages/shared/src/index.js";
import { formatHelp, formatTopKols, formatTrending } from "../utils/formatters.js";
import { getAllChannels, getChannelByHandle, getTopKols, getTrendingTokens } from "../services/queries.js";
import {
  listSubscriptions,
  subscribeToAlerts,
  subscribeToChannel,
  unsubscribeFromAlerts,
  unsubscribeFromChannel
} from "../services/subscriptions.js";
import { ensureAlertPreferences, setUserActive, updateAlertPreferences, upsertTelegramUser } from "../services/users.js";
import { logger } from "../utils/logger.js";

const html = { parse_mode: "HTML" as const };

// ---------------------------------------------------------------------------
// Banner helpers
// - sendImageThenText: sends static image first, then text (used by /start)
// - sendWithVideo: sends video with text as caption (used by alerts & queries)
// ---------------------------------------------------------------------------
const IMAGE_FILE_ID = process.env.KELUCALLS_BANNER_FILE_ID ?? null;
const VIDEO_FILE_ID = process.env.KELUCALLS_BANNER_VIDEO_ID ?? null;

async function sendImageThenText(ctx: Context, text: string) {
  if (IMAGE_FILE_ID) {
    await ctx.replyWithPhoto(IMAGE_FILE_ID);
  }
  await ctx.reply(text, { parse_mode: "HTML" as const });
}

async function sendWithVideo(ctx: Context, text: string) {
  if (VIDEO_FILE_ID) {
    await ctx.replyWithAnimation(VIDEO_FILE_ID, {
      caption: text,
      parse_mode: "HTML" as const,
    });
  } else {
    await ctx.reply(text, { parse_mode: "HTML" as const });
  }
}

// ---------------------------------------------------------------------------
// All supported chains in order
// ---------------------------------------------------------------------------
const ALL_CHAINS = ["solana", "ethereum", "bsc", "base", "arbitrum", "polygon", "avalanche", "sui", "tron"];

// ---------------------------------------------------------------------------
// Conversation state
// ---------------------------------------------------------------------------
type FlowStep =
  | "awaiting_score"
  | "awaiting_verified"
  | { step: "awaiting_chain"; chainIndex: number; selectedChains: string[] };

const flowState = new Map<number, { step: FlowStep; userId: string }>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yesNoKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback("✅ YES", "flow:yes"),
    Markup.button.callback("❌ NO", "flow:no"),
  ]);
}

function allKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback("🌐 ALL CHAINS", "flow:all"),
    Markup.button.callback("🔧 CHOOSE CHAINS", "flow:choose"),
  ]);
}

async function askChain(ctx: Context, chainIndex: number, selectedChains: string[]) {
  const chain = ALL_CHAINS[chainIndex];
  const progress = `${chainIndex + 1}/${ALL_CHAINS.length}`;
  const selected = selectedChains.length > 0
    ? `\nSelected so far: <b>${selectedChains.join(", ")}</b>`
    : "";

  await ctx.reply(
    [
      `⛓️ <b>Chain ${progress}:</b> Do you want alerts for <b>${chain.toUpperCase()}</b>?${selected}`,
    ].join("\n"),
    { ...html, ...yesNoKeyboard() }
  );
}

async function finishChainSetup(ctx: Context, userId: string, selectedChains: string[]) {
  await updateAlertPreferences(userId, { chains: selectedChains });
  const chatId = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat?.id;
  if (chatId) {
    flowState.delete(chatId);
  }

  await ctx.reply(
    [
      "🎉 <b>Alert setup complete!</b>",
      "",
      `⛓️ Chains: <b>${selectedChains.length > 0 ? selectedChains.join(", ") : "all chains"}</b>`,
      "",
      "You'll now receive smart call alerts matching your preferences.",
      "",
      "Use /list to review your settings anytime.",
      "Use /stopcallalert to turn off call alerts.",
    ].join("\n"),
    html
  );
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerCommands(bot: Telegraf): void {

  // /start
  bot.start(async (ctx) => {
    const user = await upsertTelegramUser(ctx);
    await subscribeToAlerts(user.id);

    const firstName = ctx.from?.first_name ?? "there";

    await sendImageThenText(ctx,
      [
        "🏆 <b>Welcome to Kelucalls Alerts!</b>",
        "",
        `Hey ${firstName}! This bot keeps you fully in the loop by delivering two types of real-time updates.`,
        "",
        "1️⃣ <b>Achievements</b> - Stay updated whenever specific KOLs hit new milestones (2x, 10x, 100x).",
        "",
        "2️⃣ <b>Call Alerts</b> - Get instant notifications when KOLs with your chosen minimum score post new calls. You decide the score and the chains you care about.",
        "",
        "⚙️ <b>How to get started:</b>",
        "",
        "<u>Receive Achievements</u>",
        "Use /sub <code>@ChannelUsername</code> to subscribe to achievement notifications from specific channels.",
        "Use /list to view the channels you are currently receiving notifications from.",
        "Use /unsub <code>@ChannelUsername</code> to stop notifications from a channel.",
        "",
        "<u>Receive Call Alerts</u>",
        "Use /callalerts to set up your smart call alert preferences.",
        "You'll choose a minimum KOL score and the chains you care about.",
        "Use /stopcallalert to stop call alerts at any time.",
        "",
        "📊 <b>Explore the platform:</b>",
        "/topkols — top performing KOL channels ranked by ROI",
        "/trending — most-called tokens right now",
        "/help — full command list",
        "",
        "🔔 You're subscribed to all alerts. Use /list to manage your preferences.",
      ].join("\n")
    );
  });

  // /help
  bot.help(async (ctx) => {
    await upsertTelegramUser(ctx);
    await ctx.reply(formatHelp(), html);
  });

  // /sub
  bot.command("sub", async (ctx) => {
    const user = await upsertTelegramUser(ctx);
    const [handle] = splitCommandArgs(ctx.message?.text);

    if (!handle) {
      const channels = await getAllChannels(20);
      if (channels.length === 0) {
        await ctx.reply("No tracked channels found yet. Check back soon.", html);
        return;
      }
      const lines = channels.map((ch, i) => {
        const verified = ch.is_verified ? " ✅" : "";
        return `${i + 1}. <b>${ch.title}</b>${verified} — <code>${ch.telegram_handle}</code>`;
      });
      await ctx.reply(
        ["📋 <b>Tracked channels</b>", "", ...lines, "", "To subscribe: <b>/sub @channelHandle</b>", "Example: <code>/sub @TradersGamble</code>"].join("\n"),
        html
      );
      return;
    }

    const channel = await getChannelByHandle(handle);
    if (!channel) {
      await ctx.reply([`❌ Channel <code>${handle}</code> is not tracked on Kelucalls.`, "", "Use /sub to see the full list of tracked channels."].join("\n"), html);
      return;
    }

    await subscribeToChannel(user.id, channel.id);
    await setUserActive(user.id, true);
    await ctx.reply(
      [`✅ <b>Subscribed to ${channel.title}</b>${channel.is_verified ? " ✅" : ""}`, "", `You'll get alerts when <code>${channel.telegram_handle}</code> makes a call.`, "", "Use /list to see all your subscriptions."].join("\n"),
      html
    );
  });

  // /unsub
  bot.command("unsub", async (ctx) => {
    const user = await upsertTelegramUser(ctx);
    const [handle] = splitCommandArgs(ctx.message?.text);

    if (!handle || handle.toLowerCase() === "all") {
      await unsubscribeFromAlerts(user.id);
      await ctx.reply("🔕 Unsubscribed from all Kelucalls alerts.", html);
      return;
    }

    const channel = await getChannelByHandle(handle);
    if (!channel) {
      await ctx.reply(`❌ Channel <code>${handle}</code> is not tracked on Kelucalls.`, html);
      return;
    }

    await unsubscribeFromChannel(user.id, channel.id);
    await ctx.reply(`🔕 Unsubscribed from <b>${channel.title}</b>. You won't get alerts from this channel anymore.`, html);
  });

  // /list
  bot.command("list", async (ctx) => {
    const user = await upsertTelegramUser(ctx);
    const subs = await listSubscriptions(user.id);
    const pref = await ensureAlertPreferences(user.id);

    const subLines = subs.length === 0
      ? ["No active subscriptions."]
      : subs.map((sub) => {
          if (sub.subscription_type === "channel" && sub.channelLabel) return `• 📢 ${sub.channelLabel}`;
          if (sub.subscription_type === "all") return `• 🌐 All channels`;
          return `• ${sub.subscription_type}${sub.chain ? ` (${sub.chain})` : ""}`;
        });

    await ctx.reply(
      [
        "<b>Your Kelucalls subscriptions</b>", "",
        ...subLines, "",
        "⚙️ <b>Alert preferences</b>",
        `Smart call alerts: ${pref.smart_call_alerts_enabled ? "✅ on" : "❌ off"}`,
        `Achievement alerts: ${pref.achievement_alerts_enabled ? "✅ on" : "❌ off"}`,
        `Minimum score: ${Math.round(Number(pref.min_score) * 100)}%`,
        `Chains: ${pref.chains.length > 0 ? pref.chains.join(", ") : "all chains"}`,
        `Verified only: ${pref.verified_channels_only ? "yes" : "no"}`,
      ].join("\n"),
      html
    );
  });

  // /callalerts — step 1: ask for score
  bot.command("callalerts", async (ctx) => {
    const user = await upsertTelegramUser(ctx);
    await updateAlertPreferences(user.id, { smart_call_alerts_enabled: true });
    await subscribeToAlerts(user.id);

    flowState.set(ctx.chat.id, { step: "awaiting_score", userId: user.id });

    await ctx.reply(
      [
        "🔔 <b>Call Alerts ON!</b>",
        "",
        "Now let's configure your alert preferences.",
        "",
        "⚙️ <b>Step 1 of 3 — Minimum KOL Score</b>",
        "",
        "Enter a number from 1 to 100.",
        "You'll only receive alerts from KOLs with a score at or above this threshold.",
        "",
        "💡 Example: type <code>60</code> to only get alerts from KOLs scoring 60 or higher.",
        "Type <code>0</code> to receive alerts from all KOLs regardless of score.",
      ].join("\n"),
      html
    );
  });

  // /stopcallalert
  bot.command("stopcallalert", async (ctx) => {
    const user = await upsertTelegramUser(ctx);
    flowState.delete(ctx.chat.id);
    await updateAlertPreferences(user.id, { smart_call_alerts_enabled: false });
    await ctx.reply("🔕 Smart call alerts disabled. Achievement alerts can still be active.", html);
  });

  // /minscore
  bot.command("minscore", async (ctx) => {
    const user = await upsertTelegramUser(ctx);
    const [raw] = splitCommandArgs(ctx.message?.text);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) { await ctx.reply("Usage: /minscore 80", html); return; }
    const minScore = parsed > 1 ? parsed / 100 : parsed;
    if (minScore < 0 || minScore > 1) { await ctx.reply("Minimum score must be between 0 and 100.", html); return; }
    await updateAlertPreferences(user.id, { min_score: minScore });
    await ctx.reply(`✅ Minimum smart call score set to <b>${Math.round(minScore * 100)}%</b>.`, html);
  });

  // /chains
  bot.command("chains", async (ctx) => {
    const user = await upsertTelegramUser(ctx);
    const chains = splitCommandArgs(ctx.message?.text).map((v) => v.toLowerCase());
    await updateAlertPreferences(user.id, { chains });
    await ctx.reply(`✅ Chain filter set to: <b>${chains.length > 0 ? chains.join(", ") : "all chains"}</b>.`, html);
  });

  // /topkols
  bot.command("topkols", async (ctx) => {
    await upsertTelegramUser(ctx);
    const rows = await getTopKols(10);
    await sendWithVideo(ctx, formatTopKols(rows));
  });

  // /trending
  bot.command("trending", async (ctx) => {
    await upsertTelegramUser(ctx);
    const rows = await getTrendingTokens(10);
    await sendWithVideo(ctx, formatTrending(rows));
  });

  // ---------------------------------------------------------------------------
  // Text handler — step 1 (score input)
  // ---------------------------------------------------------------------------
  bot.on("text", async (ctx) => {
    const state = flowState.get(ctx.chat.id);
    if (!state || typeof state.step !== "string") return;

    const text = ctx.message.text.trim();

    // Step 1 — score
    if (state.step === "awaiting_score") {
      const parsed = Number(text);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        await ctx.reply("⚠️ Please enter a number between 0 and 100.", html);
        return;
      }
      const minScore = parsed / 100;
      await updateAlertPreferences(state.userId, { min_score: minScore });

      // Step 2 — verified only?
      flowState.set(ctx.chat.id, { step: "awaiting_verified", userId: state.userId });
      await ctx.reply(
        [
          `✅ Minimum score set to <b>${parsed}%</b>.`,
          "",
          "⚙️ <b>Step 2 of 3 — Verified Channels Only</b>",
          "",
          "Do you want to receive alerts only from <b>verified</b> KOL channels?",
        ].join("\n"),
        { ...html, ...yesNoKeyboard() }
      );
      return;
    }
  });

  // ---------------------------------------------------------------------------
  // Callback query handler — YES/NO/ALL/CHOOSE buttons
  // ---------------------------------------------------------------------------
  bot.on("callback_query", async (ctx) => {
    const data = "data" in ctx.callbackQuery && typeof ctx.callbackQuery.data === "string"
      ? ctx.callbackQuery.data
      : "";
    const chatId = ctx.callbackQuery.message?.chat?.id;
    if (!chatId) return;

    const state = flowState.get(chatId);
    if (!state) { await ctx.answerCbQuery(); return; }

    await ctx.answerCbQuery();

    // Step 2 — verified only (YES/NO)
    if (state.step === "awaiting_verified") {
      const verifiedOnly = data === "flow:yes";
      await updateAlertPreferences(state.userId, { verified_channels_only: verifiedOnly });

      // Step 3 — chain selection
      await ctx.reply(
        [
          `✅ Verified only: <b>${verifiedOnly ? "Yes" : "No"}</b>.`,
          "",
          "⚙️ <b>Step 3 of 3 — Chain Selection</b>",
          "",
          "Do you want alerts from <b>ALL chains</b>, or would you like to choose specific ones?",
        ].join("\n"),
        { ...html, ...allKeyboard() }
      );
      flowState.set(chatId, { step: { step: "awaiting_chain", chainIndex: 0, selectedChains: [] }, userId: state.userId });
      return;
    }

    // Step 3a — ALL or CHOOSE
    if (typeof state.step === "object" && state.step.step === "awaiting_chain" && state.step.chainIndex === 0) {
      if (data === "flow:all") {
        await finishChainSetup(ctx, state.userId, []);
        return;
      }
      if (data === "flow:choose") {
        await askChain(ctx, 0, []);
        return;
      }
    }

    // Step 3b — per-chain YES/NO
    if (typeof state.step === "object" && state.step.step === "awaiting_chain") {
      const { chainIndex, selectedChains } = state.step;
      const chain = ALL_CHAINS[chainIndex];
      const updated = data === "flow:yes" ? [...selectedChains, chain] : selectedChains;
      const nextIndex = chainIndex + 1;

      if (nextIndex >= ALL_CHAINS.length) {
        // Done with all chains
        await finishChainSetup(ctx, state.userId, updated);
        return;
      }

      // Ask next chain
      flowState.set(chatId, {
        step: { step: "awaiting_chain", chainIndex: nextIndex, selectedChains: updated },
        userId: state.userId
      });
      await askChain(ctx, nextIndex, updated);
      return;
    }
  });

  // Global error handler
  bot.catch((error, ctx) => {
    logger.error({ error, updateType: ctx.updateType }, "Telegram command failed");
  });
}
