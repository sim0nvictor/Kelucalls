/**
 * Kelucalls Telegram Scraper
 *
 * Watches all active channels in the DB, parses call messages,
 * and inserts into tokens + calls tables automatically.
 *
 * Handles: Solana, Ethereum, BSC, Base, Arbitrum, Polygon, Avalanche, Sui, Tron
 * Detects: contract addresses, $SYMBOL mentions, CA: labels, GMGN/DEX links
 *
 * Place this file at: scraper/index.js
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { createClient } from "@supabase/supabase-js";
import {
  loadScraperEnv,
  logScraperEnvStatus,
  validateScraperEnv,
} from "../src/lib/env/scraper-env.js";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const envState = loadScraperEnv(import.meta.url);
logScraperEnvStatus(envState);

const { NewMessage } = await import("telegram/events/index.js");

const { telegram, supabase: supabaseEnv } = validateScraperEnv({ requireSupabase: true });

const supabase = createClient(
  supabaseEnv.url ?? supabaseEnv.nextPublicUrl,
  supabaseEnv.serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------
const LOG = {
  info:  (msg, meta = {}) => log("INFO",  msg, meta),
  warn:  (msg, meta = {}) => log("WARN",  msg, meta),
  error: (msg, meta = {}) => log("ERROR", msg, meta),
  debug: (msg, meta = {}) => log("DEBUG", msg, meta),
};

function log(level, message, meta = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  }));
}

// ---------------------------------------------------------------------------
// Chain detection
// ---------------------------------------------------------------------------

// Solana: base58, 32–44 chars, no 0x prefix
const SOLANA_ADDRESS_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

// EVM: 0x + 40 hex chars
const EVM_ADDRESS_RE = /\b(0x[0-9a-fA-F]{40})\b/g;

// Sui: 0x + 64 hex chars
const SUI_ADDRESS_RE = /\b(0x[0-9a-fA-F]{64})\b/g;

// Tron: T + 33 base58 chars
const TRON_ADDRESS_RE = /\b(T[1-9A-HJ-NP-Za-km-z]{33})\b/g;

// Token symbol: $SYMBOL
const SYMBOL_RE = /\$([A-Z]{2,12})\b/gi;

// Ticker label: "Ticker: $SYMBOL" or "Ticker: SYMBOL"
const TICKER_LABEL_RE = /ticker\s*:\s*\$?([A-Z]{2,12})\b/i;

// CA label: "CA:", "Contract:", "Contract Address:"
const CA_LABEL_RE = /(?:ca|contract(?:\s+address)?)\s*[:-]\s*([^\s\n]{20,})/i;

// GMGN link: https://gmgn.ai/sol/token/ADDRESS or /eth/token/ADDRESS etc.
const GMGN_RE = /gmgn\.ai\/([a-z]+)\/token\/([^\s/?"]+)/i;

// Dexscreener link: https://dexscreener.com/solana/ADDRESS
const DEXSCREENER_RE = /dexscreener\.com\/([a-z]+)\/([^\s/?"]+)/i;

// Pump.fun link — address is the last path segment
const PUMP_RE = /pump\.fun\/([1-9A-HJ-NP-Za-km-z]{32,44})/i;

// Known well-known symbols that never have a contract address
const WELL_KNOWN_SYMBOLS = new Set([
  "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOT", "MATIC",
  "AVAX", "LINK", "UNI", "DOGE", "SHIB", "LTC", "TRX", "TON",
  "SUI", "APT", "ARB", "OP",
]);

// EVM chains by keyword in message context
const EVM_CHAIN_KEYWORDS = {
  base:      /\b(base)\b/i,
  arbitrum:  /\b(arbitrum|arb)\b/i,
  polygon:   /\b(polygon|matic)\b/i,
  avalanche: /\b(avalanche|avax)\b/i,
  bsc:       /\b(bsc|binance smart chain|bnb chain)\b/i,
  ethereum:  /\b(ethereum|eth|erc-?20)\b/i,
};

/**
 * Detect chain from contract address format + message text context.
 */
function detectChain(address, messageText) {
  if (!address) return "other";

  // Sui: 0x + 64 hex
  if (/^0x[0-9a-fA-F]{64}$/.test(address)) return "sui";

  // Tron: starts with T
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return "tron";

  // EVM 0x address — check message for chain hints
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    for (const [chain, re] of Object.entries(EVM_CHAIN_KEYWORDS)) {
      if (re.test(messageText)) return chain;
    }
    return "ethereum"; // default EVM
  }

  // Solana base58
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";

  return "other";
}

/**
 * Extract chain hint from GMGN/Dexscreener URL path segment.
 */
function chainFromUrlSegment(segment) {
  const map = {
    sol: "solana", solana: "solana",
    eth: "ethereum", ethereum: "ethereum",
    bsc: "bsc", bnb: "bsc",
    base: "base",
    arb: "arbitrum", arbitrum: "arbitrum",
    polygon: "polygon", matic: "polygon",
    avax: "avalanche", avalanche: "avalanche",
    sui: "sui",
    tron: "tron", trx: "tron",
  };
  return map[segment?.toLowerCase()] ?? "other";
}

// ---------------------------------------------------------------------------
// Message parser
// ---------------------------------------------------------------------------

/**
 * Parse a Telegram message text and return extracted call data or null.
 *
 * Returns:
 *   { symbol, contractAddress, chain } | null
 */
export function parseCallMessage(text) {
  if (!text || text.trim().length < 5) return null;

  let contractAddress = null;
  let chain = "other";
  let symbol = null;

  // 1. Check GMGN link first — most reliable source
  const gmgnMatch = text.match(GMGN_RE);
  if (gmgnMatch) {
    chain = chainFromUrlSegment(gmgnMatch[1]);
    contractAddress = gmgnMatch[2].replace(/[^1-9A-HJ-NP-Za-km-z0-9x]/g, "");
  }

  // 2. Check Dexscreener link
  if (!contractAddress) {
    const dexMatch = text.match(DEXSCREENER_RE);
    if (dexMatch) {
      chain = chainFromUrlSegment(dexMatch[1]);
      contractAddress = dexMatch[2];
    }
  }

  // 3. Check Pump.fun link
  if (!contractAddress) {
    const pumpMatch = text.match(PUMP_RE);
    if (pumpMatch) {
      contractAddress = pumpMatch[1];
      chain = "solana";
    }
  }

  // 4. Check explicit CA: label
  if (!contractAddress) {
    const caMatch = text.match(CA_LABEL_RE);
    if (caMatch) {
      contractAddress = caMatch[1].trim();
      chain = detectChain(contractAddress, text);
    }
  }

  // 5. Check for Sui address (0x + 64 hex) — before EVM to avoid false match
  if (!contractAddress) {
    const suiMatches = [...text.matchAll(SUI_ADDRESS_RE)];
    if (suiMatches.length > 0) {
      contractAddress = suiMatches[0][1];
      chain = "sui";
    }
  }

  // 6. Check for Tron address
  if (!contractAddress) {
    const tronMatches = [...text.matchAll(TRON_ADDRESS_RE)];
    if (tronMatches.length > 0) {
      contractAddress = tronMatches[0][1];
      chain = "tron";
    }
  }

  // 7. Check for EVM address
  if (!contractAddress) {
    const evmMatches = [...text.matchAll(EVM_ADDRESS_RE)];
    if (evmMatches.length > 0) {
      contractAddress = evmMatches[0][1];
      chain = detectChain(contractAddress, text);
    }
  }

  // 8. Check for Solana address (last resort — most common false positives)
  if (!contractAddress) {
    const solMatches = [...text.matchAll(SOLANA_ADDRESS_RE)].filter(m => {
      const addr = m[1];
      // Filter out common false positives: short words, URLs, known noise
      if (addr.length < 32) return false;
      if (/^(https?|www|com|org|net)$/i.test(addr)) return false;
      return true;
    });
    if (solMatches.length > 0) {
      contractAddress = solMatches[0][1];
      chain = "solana";
    }
  }

  // Extract symbol — check Ticker label first, then $SYMBOL
  const tickerMatch = text.match(TICKER_LABEL_RE);
  if (tickerMatch) {
    symbol = tickerMatch[1].toUpperCase();
  } else {
    const symbolMatches = [...text.matchAll(SYMBOL_RE)];
    if (symbolMatches.length > 0) {
      symbol = symbolMatches[0][1].toUpperCase();
    }
  }

  // If no symbol and no contract — not a call
  if (!symbol && !contractAddress) return null;

  // If symbol is well-known and no contract — still a valid call (e.g. $XRP)
  if (!contractAddress && symbol && !WELL_KNOWN_SYMBOLS.has(symbol)) {
    // Unknown symbol with no address — too noisy, skip
    return null;
  }

  return {
    symbol: symbol ?? contractAddress?.slice(0, 6).toUpperCase() ?? "UNKNOWN",
    contractAddress: contractAddress ?? null,
    chain,
  };
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/**
 * Upsert a token and return its id.
 */
async function upsertToken({ symbol, contractAddress, chain, logoUrl = null }) {
  // Try to find existing token by contract address first
  if (contractAddress) {
    const normalized = contractAddress.toLowerCase();
    const { data: existing } = await supabase
      .from("tokens")
      .select("id, symbol, logo_url")
      .eq("chain", chain)
      .eq("contract_address_normalized", normalized)
      .maybeSingle();

    if (existing) {
      // Opportunistically backfill a missing logo on an existing token —
      // cheap, and means we don't have to wait for the price-update worker
      // (which only revisits tokens that still have an *open* call).
      if (!existing.logo_url && logoUrl) {
        await supabase.from("tokens").update({ logo_url: logoUrl }).eq("id", existing.id);
      }
      return existing.id;
    }
  }

  // Try by chain + symbol
  const { data: bySymbol } = await supabase
    .from("tokens")
    .select("id, logo_url")
    .eq("chain", chain)
    .eq("symbol_normalized", symbol.toUpperCase())
    .maybeSingle();

  if (bySymbol) {
    if (!bySymbol.logo_url && logoUrl) {
      await supabase.from("tokens").update({ logo_url: logoUrl }).eq("id", bySymbol.id);
    }
    return bySymbol.id;
  }

  // Insert new token
  const { data: inserted, error } = await supabase
    .from("tokens")
    .insert({
      slug: `${symbol.toLowerCase()}-${chain}-${Date.now()}`,
      symbol,
      name: symbol,
      chain,
      contract_address: contractAddress ?? null,
      logo_url: logoUrl,
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    LOG.error("Failed to insert token", { symbol, chain, error: error.message });
    return null;
  }

  LOG.info("New token inserted", { symbol, chain, contractAddress });
  return inserted.id;
}

/**
 * Insert a call row. Returns true on success.
 */
async function insertCall({
  channelId,
  tokenId,
  messageText,
  calledAt,
  telegramMessageId,
  entryPriceUsd,
}) {
  const { data: callRow, error } = await supabase
    .from("calls")
    .insert({
      channel_id: channelId,
      token_id: tokenId,
      message_text: messageText.slice(0, 4000),
      called_at: calledAt,
      telegram_message_id: telegramMessageId ?? null,
      entry_price_usd: entryPriceUsd ?? null,
      status: "open",
      confidence_score: 0.75,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return false; // duplicate
    LOG.error("Failed to insert call", { channelId, tokenId, error: error.message });
    return false;
  }

  // Always create a call_metrics row immediately after inserting a call.
  // Without this row the price-update worker has nothing to update, and
  // refresh_channel_stats LEFT JOINs on call_metrics so ROI/PnL stays 0.

  const { error: metricsError } = await supabase
    .from("call_metrics")
    .upsert({
      call_id: callRow.id,
      current_price_usd: entryPriceUsd ?? null,
      peak_price_usd: entryPriceUsd ?? null,
      current_roi_pct: 0,
      peak_roi_pct: 0,
      current_multiple: 1,
      peak_multiple: 1,
      is_win: false,
      hit_2x: false,
      hit_5x: false,
      hit_10x: false,
      hit_50x: false,
      hit_100x: false,
      simulated_investment_usd: 10,
      simulated_current_value_usd: 10,
      simulated_peak_value_usd: 10,
      simulated_current_pnl_usd: 0,
      simulated_peak_pnl_usd: 0,
    }, { onConflict: "call_id" });

  if (metricsError) {
    LOG.warn("Failed to create call_metrics row", {
      callId: callRow.id,
      error: metricsError.message,
    });
  }

  return true;
}
/**
 * Fetch current price + logo from DexScreener for a contract address.
 * Single request — previously `fetchEntryPrice` covered price only, and the
 * logo was never fetched anywhere in the pipeline. Returns null if unavailable.
 */
async function fetchDexScreenerData(contractAddress) {
  if (!contractAddress) return null;

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(contractAddress)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    const pair = data?.pairs?.[0];
    if (!pair) return null;

    const priceUsd = pair.priceUsd ? Number(pair.priceUsd) : null;
    // DexScreener omits `info` on thin-liquidity / brand-new pairs — guard for it.
    const logoUrl = pair.info?.imageUrl ?? null;

    return { priceUsd, logoUrl };
  } catch {
    return null;
  }
}

/**
 * Load all active/paused channels from DB.
 */
async function loadTrackedChannels() {
  const { data, error } = await supabase
    .from("channels")
    .select("id, slug, title, telegram_handle, telegram_peer_id")
    .in("status", ["active", "paused"]);

  if (error) {
    LOG.error("Failed to load channels", { error: error.message });
    return [];
  }

  return data ?? [];
}

/**
 * Update channel's last_scraped_at timestamp.
 */
async function touchChannel(channelId) {
  await supabase
    .from("channels")
    .update({ last_scraped_at: new Date().toISOString() })
    .eq("id", channelId);
}

async function processTrackingQueue(client) {
  const { data: requests, error } = await supabase
    .from("tracking_requests")
    .select("id, telegram_handle, telegram_title, member_count")
    .eq("status", "queued")
    .order("requested_at", { ascending: true })
    .limit(5);
 
  if (error) {
    LOG.error("Failed to fetch tracking queue", { error: error.message });
    return;
  }
 
  if (!requests || requests.length === 0) return;
 
  LOG.info("Processing tracking queue", { count: requests.length });
 
  for (const req of requests) {
    const handle = req.telegram_handle;
 
    await supabase
      .from("tracking_requests")
      .update({ status: "processing" })
      .eq("id", req.id);
 
    try {
      let entity;
      try {
        entity = await client.getEntity(handle);
      } catch (err) {
        LOG.warn("Could not resolve Telegram handle", { handle, error: err.message });
        await supabase
          .from("tracking_requests")
          .update({ status: "failed", rejection_reason: "telegram_resolve_failed", processed_at: new Date().toISOString() })
          .eq("id", req.id);
        continue;
      }
 
      const username    = entity.username ?? handle.replace("@", "");
      const title       = entity.title ?? req.telegram_title ?? username;
      const peerId      = entity.id?.toString() ?? null;
      const telegramUrl = `https://t.me/${username}`;
      const description = typeof entity.about === "string" && entity.about.trim().length > 0
       ? entity.about.trim()
       : null;
 
      const { data: existingChannel } = await supabase
        .from("channels")
        .select("id")
        .ilike("telegram_handle", `@${username}`)
        .maybeSingle();
 
      let channelId;
 
      if (existingChannel) {
        channelId = existingChannel.id;
        LOG.info("Channel already exists", { handle });
      } else {
        const slug = username.toLowerCase().replace(/[^a-z0-9-]/g, "-");
 
        const { data: newChannel, error: insertErr } = await supabase
          .from("channels")
          .insert({
            slug,
            title,
            telegram_handle:  `@${username}`,
            telegram_url:     telegramUrl,
            telegram_peer_id: peerId,
            status:           "tracked",
            is_verified:      false,
            is_paid_channel:  false,
          })
          .select("id")
          .single();
 
        if (insertErr) {
          if (insertErr.code === "23505") {
            // Slug collision — retry with timestamp suffix
            const { data: retried } = await supabase
              .from("channels")
              .insert({
                slug:             `${slug}-${Date.now()}`,
                title,
                telegram_handle:  `@${username}`,
                description,  
                telegram_url:     telegramUrl,
                telegram_peer_id: peerId,
                status:           "tracked",
                is_verified:      false,
                is_paid_channel:  false,
              })
              .select("id")
              .single();
            channelId = retried?.id;
          } else {
            LOG.error("Failed to insert channel", { handle, error: insertErr.message });
            await supabase
              .from("tracking_requests")
              .update({ status: "failed", rejection_reason: "db_insert_failed", processed_at: new Date().toISOString() })
              .eq("id", req.id);
            continue;
          }
        } else {
          channelId = newChannel.id;
        }
 
        LOG.info("Channel created", { handle, title, channelId });
      }
 
      if (!channelId) {
        await supabase
          .from("tracking_requests")
          .update({ status: "failed", rejection_reason: "no_channel_id", processed_at: new Date().toISOString() })
          .eq("id", req.id);
        continue;
      }
 
      const channelRow = { id: channelId, title, telegram_handle: `@${username}`, telegram_peer_id: peerId };
      await backfillChannel(client, channelRow, 100);
 
      await supabase
        .from("tracking_requests")
        .update({ status: "done", channel_id: channelId, processed_at: new Date().toISOString() })
        .eq("id", req.id);
 
      LOG.info("Tracking request completed", { handle, channelId });
 
    } catch (err) {
      LOG.error("Tracking request failed", { handle, error: err.message });
      await supabase
        .from("tracking_requests")
        .update({ status: "failed", rejection_reason: "unexpected_error", processed_at: new Date().toISOString() })
        .eq("id", req.id);
    }
  }
}
// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function handleMessage(channelId, message) {
  const text = message.message ?? "";
  if (!text || text.length < 10) return;

  const parsed = parseCallMessage(text);
  if (!parsed) {
    LOG.debug("No call detected in message", {
      channelId,
      messageId: message.id,
      preview: text.slice(0, 80),
    });
    return;
  }

  LOG.info("Call detected", {
    symbol: parsed.symbol,
    chain: parsed.chain,
    contract: parsed.contractAddress?.slice(0, 16),
    channelId,
  });

  // Get entry price + logo from DexScreener (single request covers both)
  const dexData = await fetchDexScreenerData(parsed.contractAddress);
  const entryPriceUsd = dexData?.priceUsd ?? null;

  // Upsert token
  const tokenId = await upsertToken({ ...parsed, logoUrl: dexData?.logoUrl ?? null });
  if (!tokenId) return;

  // Insert call
  const calledAt = message.date
    ? new Date(message.date * 1000).toISOString()
    : new Date().toISOString();

  const inserted = await insertCall({
    channelId,
    tokenId,
    messageText: text,
    calledAt,
    telegramMessageId: message.id ?? null,
    entryPriceUsd,
  });

  if (inserted) {
    LOG.info("Call saved", {
      symbol: parsed.symbol,
      chain: parsed.chain,
      entryPriceUsd,
      channelId,
    });
  }
}

// ---------------------------------------------------------------------------
// Historical backfill — fetch last N messages on startup
// ---------------------------------------------------------------------------

async function backfillChannel(client, channel, limit = 50) {
  LOG.info("Backfilling channel", { title: channel.title, limit });

  try {
    const messages = await client.getMessages(channel.telegram_handle, { limit });

    for (const msg of messages) {
      if (msg.message) {
        await handleMessage(channel.id, msg);
      }
    }

    await touchChannel(channel.id);
    LOG.info("Backfill complete", { title: channel.title, count: messages.length });
  } catch (err) {
    LOG.error("Backfill failed", { title: channel.title, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Main scraper loop
// ---------------------------------------------------------------------------

async function main() {
  LOG.info("Kelucalls scraper starting...");

  const client = new TelegramClient(
    new StringSession(telegram.session),
    telegram.apiId,
    telegram.apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();
  LOG.info("Telegram connected");

  // Load channels from DB
  let channels = await loadTrackedChannels();
  LOG.info("Channels loaded", { count: channels.length, titles: channels.map(c => c.title) });

  if (channels.length === 0) {
    LOG.warn("No active channels found in DB. Add channels and restart.");
  }

  // Backfill recent messages on startup (last 50 per channel)
  for (const channel of channels) {
    await backfillChannel(client, channel, 50);
  }

  // Refresh channel list every 5 minutes (picks up newly added channels)
  setInterval(async () => {
    channels = await loadTrackedChannels();
    LOG.info("Channel list refreshed", { count: channels.length });
  }, 5 * 60 * 1000);

  await processTrackingQueue(client);
  setInterval(() => processTrackingQueue(client), 5 * 60 * 1000);

    setTimeout(() => {
    processTrackingQueue(client); // run once on startup after 30s
    setInterval(() => processTrackingQueue(client), 5 * 60 * 1000);
  }, 30 * 1000);

  // Build a lookup map: telegram_handle (normalized) → channel DB row
  function buildHandleMap(channelList) {
    const map = new Map();
    for (const ch of channelList) {
      const handle = ch.telegram_handle.replace("@", "").toLowerCase();
      map.set(handle, ch);
    }
    return map;
  }

  // Listen for new messages in real time
client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message?.message) return;
 
      const peer = message.peerId;
      if (!peer) return;
 
      const handleMap = buildHandleMap(channels);
 
      let matchedChannel = null;
 
      if (peer.className === "PeerChannel") {
        const channelId = peer.channelId?.toString();
        matchedChannel = channels.find(
          ch => ch.telegram_peer_id?.toString() === channelId
        );
      }
 
      if (!matchedChannel) {
        try {
          const entity = await client.getEntity(peer);
          const username = entity?.username?.toLowerCase();
          if (username) {
            matchedChannel = handleMap.get(username);
          }
        } catch {
          return;
        }
      }
 
      if (!matchedChannel) return;
 
      await handleMessage(matchedChannel.id, message);
    } catch (err) {
      LOG.error("Event handler error", { error: err.message });
    }
  }, new NewMessage({}));
  LOG.info("Scraper live — listening for new messages");

  // Keep process alive
  process.on("SIGTERM", async () => {
    LOG.info("Shutting down...");
    await client.disconnect();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    LOG.info("Shutting down...");
    await client.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  LOG.error("Scraper crashed", { error: err.message, stack: err.stack });
  process.exit(1);
});