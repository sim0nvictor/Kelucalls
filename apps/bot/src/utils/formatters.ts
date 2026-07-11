import { formatMultiple, formatPercent, toNumber } from "../../../../packages/shared/src/index.js";
import type { BotEvent, CallAlertRow, TopKolRow, TrendingTokenRow } from "../types/domain.js";

export function getBannerFileId(): string | null {
  return process.env.KELUCALLS_BANNER_FILE_ID ?? null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Format market cap: 56500 → "56.5K", 1200000 → "1.2M"
function formatMcap(value: number | null | undefined): string {
  const n = Number(value) || 0;
  if (n === 0) return "N/A";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

// Build a t.me deep link to a specific message in a channel
function tgMessageLink(telegramHandle: string | null, messageId: number | string | null): string | null {
  if (!telegramHandle || !messageId) return null;
  const handle = telegramHandle.startsWith("@") ? telegramHandle.slice(1) : telegramHandle;
  return `https://t.me/${handle}/${messageId}`;
}

// Build kelucalls.com channel profile link
function kelucallsChannelLink(slug: string | null): string {
  const appUrl = process.env.APP_URL ?? "https://kelucalls.com";
  return slug ? `${appUrl}/channels/${slug}` : appUrl;
}

export function formatHelp(): string {
  return [
    "<b>Kelucalls Alerts</b>",
    "",
    "/sub @handle — subscribe to a specific channel",
    "/sub — browse all tracked channels",
    "/unsub @handle — unsubscribe from a channel",
    "/unsub all — unsubscribe from everything",
    "/list — show your active subscriptions and preferences",
    "/callalerts — set up smart call alert preferences",
    "/stopcallalert — disable smart call alerts",
    "/minscore 80 — set minimum confidence score directly",
    "/chains solana ethereum — set chain filter directly",
    "/topkols — show top KOL channels",
    "/trending — show trending tokens",
    "/help — show this help message"
  ].join("\n");
}

export function formatTrending(rows: TrendingTokenRow[]): string {
  if (rows.length === 0) return "No trending tokens are available yet.";
  return [
    "🔥 <b>Trending Tokens</b>",
    "",
    ...rows.map((row, index) => {
      const symbol = escapeHtml(row.symbol);
      const chain = escapeHtml(row.chain);
      return `${index + 1}. <b>${symbol}</b> (${chain}) — ${row.unique_channels} channels · ${row.total_calls} calls · best ${formatMultiple(toNumber(row.best_multiple, 1))}`;
    })
  ].join("\n");
}

export function formatTopKols(rows: TopKolRow[]): string {
  if (rows.length === 0) return "No channel leaderboard data is available yet.";
  const medals = ["🥇", "🥈", "🥉"];
  return [
    "🏆 <b>Top KOL Channels</b>",
    "",
    ...rows.map((row, index) => {
      const channel = Array.isArray(row.channels) ? row.channels[0] : row.channels;
      const rank = medals[index] ?? `${index + 1}.`;
      const verified = channel?.is_verified ? " ✅" : "";
      const handle = channel?.telegram_handle
        ? ` <a href="https://t.me/${(channel.telegram_handle).replace("@", "")}">${escapeHtml(channel?.title ?? "Unknown")}</a>`
        : ` <b>${escapeHtml(channel?.title ?? "Unknown")}</b>`;
      return [
        `${rank}${handle}${verified}`,
        `   📊 Score ${toNumber(row.ranking_score).toFixed(1)} · Win ${formatPercent(toNumber(row.win_rate_pct))} · Best ${formatMultiple(toNumber(row.best_multiple, 1))} · ${toNumber(row.total_calls)} calls`
      ].join("\n");
    })
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Core call alert formatter — matches the KOLscope style:
//
// 🚨 CALL ALERT: TOKEN @channel just called at 56.5K.
//
// 0xABCDEF...
//
// 📊 Kelucalls Rank: #3
// [Call] [KOL Profile]
// ---------------------------------------------------------------------------
export function formatCallAlert(row: CallAlertRow, rankLabel?: string): string {
  const channel = Array.isArray(row.channels) ? row.channels[0] : row.channels;
  const token   = Array.isArray(row.tokens)   ? row.tokens[0]   : row.tokens;
  const metrics = Array.isArray(row.call_metrics) ? row.call_metrics[0] : row.call_metrics;

  const symbol          = escapeHtml(token?.symbol ?? row.detected_symbol ?? "UNKNOWN");
  const chain           = escapeHtml(token?.chain ?? "unknown");
  const contractAddress = token?.contract_address ?? row.detected_contract_address ?? null;
  const channelHandle   = channel?.telegram_handle ?? null;
  const channelTitle    = escapeHtml(channel?.title ?? "Unknown");
  const mcap            = formatMcap(metrics?.current_market_cap_usd ?? null);
  const messageLink     = tgMessageLink(channelHandle, row.telegram_message_id ?? null);
  const kolLink         = channel?.telegram_url ?? (channelHandle ? `https://t.me/${channelHandle.replace("@", "")}` : null);
  const profileLink     = kelucallsChannelLink(channel?.slug ?? null);
  const score           = Math.round(toNumber(row.confidence_score) * 100);

  // Header line: "CALL ALERT: TOKEN @channel just called at 56.5K."
  const channelMention = kolLink
    ? `<a href="${kolLink}">${channelTitle}</a>`
    : channelTitle;

  const tokenDisplay = messageLink
    ? `<a href="${messageLink}">${symbol}</a>`
    : `<b>${symbol}</b>`;

  const lines: string[] = [
    `🚨 <b>CALL ALERT: ${tokenDisplay}</b>`,
    `${channelMention} just called at ${mcap}.`,
  ];

  // Contract address — full, copyable
  if (contractAddress) {
    lines.push("", `<code>${escapeHtml(contractAddress)}</code>`);
  }

  // Stats line
  const statParts: string[] = [];
  if (score > 0) statParts.push(`Score: ${score}%`);
  if (chain !== "unknown") statParts.push(`Chain: ${chain.toUpperCase()}`);
  if (metrics?.current_roi_pct != null) statParts.push(`ROI: ${formatPercent(toNumber(metrics.current_roi_pct))}`);
  if (statParts.length > 0) {
    lines.push("", statParts.join(" · "));
  }

  // Links row
  const linkParts: string[] = [];
  if (rankLabel) linkParts.push(`<a href="${profileLink}">📊 ${rankLabel}</a>`);
  if (messageLink) linkParts.push(`<a href="${messageLink}">📢 Call</a>`);
  if (kolLink) linkParts.push(`<a href="${kolLink}">👤 KOL</a>`);
  linkParts.push(`<a href="${profileLink}">🏆 Kelucalls</a>`);

  if (linkParts.length > 0) {
    lines.push("", linkParts.join("  |  "));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Achievement alert (2x / 10x / 100x milestone)
// ---------------------------------------------------------------------------
export function formatAchievementAlert(row: CallAlertRow, milestone: string, peakMultiple: number): string {
  const channel = Array.isArray(row.channels) ? row.channels[0] : row.channels;
  const token   = Array.isArray(row.tokens)   ? row.tokens[0]   : row.tokens;

  const symbol        = escapeHtml(token?.symbol ?? row.detected_symbol ?? "UNKNOWN");
  const channelTitle  = escapeHtml(channel?.title ?? "Unknown");
  const kolLink       = channel?.telegram_url ?? null;
  const profileLink   = kelucallsChannelLink(channel?.slug ?? null);
  const contractAddress = token?.contract_address ?? row.detected_contract_address ?? null;
  const messageLink   = tgMessageLink(channel?.telegram_handle ?? null, row.telegram_message_id ?? null);

  const milestoneEmoji: Record<string, string> = {
    "2x": "🔥", "10x": "🚀", "100x": "💎"
  };
  const emoji = milestoneEmoji[milestone] ?? "🏆";

  const channelMention = kolLink
    ? `<a href="${kolLink}">${channelTitle}</a>`
    : channelTitle;

  const lines: string[] = [
    `${emoji} <b>ACHIEVEMENT: ${symbol} hit ${milestone}!</b>`,
    `Called by ${channelMention}.`,
    `Peak: <b>${formatMultiple(peakMultiple)}</b>`,
  ];

  if (contractAddress) {
    lines.push("", `<code>${escapeHtml(contractAddress)}</code>`);
  }

  const linkParts: string[] = [];
  if (messageLink) linkParts.push(`<a href="${messageLink}">📢 Original Call</a>`);
  if (kolLink) linkParts.push(`<a href="${kolLink}">👤 KOL</a>`);
  linkParts.push(`<a href="${profileLink}">🏆 Kelucalls</a>`);
  lines.push("", linkParts.join("  |  "));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Event dispatcher — called by events.ts
// ---------------------------------------------------------------------------
export function formatEventAlert(event: BotEvent, row: CallAlertRow | TrendingTokenRow | null): string {
  if (event.event_type === "new_call" && row && "called_at" in row) {
    return formatCallAlert(row);
  }

  if (event.event_type === "coordinated_call" && row && "called_at" in row) {
    return formatCallAlert(row, "Coordinated Call");
  }

  if (event.event_type === "achievement" && row && "called_at" in row) {
    const metrics = Array.isArray(row.call_metrics) ? row.call_metrics[0] : row.call_metrics;
    const peak = toNumber(metrics?.peak_multiple, toNumber(event.payload?.multiple, 1));
    const milestone = String(event.payload?.milestone ?? `${formatMultiple(peak)}`);
    return formatAchievementAlert(row, milestone, peak);
  }

  if (event.event_type === "trending" && row && "unique_channels" in row) {
    return [
      "🔥 <b>Trending Token</b>",
      "",
      `<b>${escapeHtml(row.symbol)}</b> on ${escapeHtml(row.chain).toUpperCase()}`,
      `${row.unique_channels} channels · ${row.total_calls} calls`,
      `Best: ${formatMultiple(toNumber(row.best_multiple, 1))}`
    ].join("\n");
  }

  return `<b>Kelucalls alert</b>\n\n${escapeHtml(event.event_type)}`;
}
