import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";

import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";

const REQUIRED_ENV = [
  "TELEGRAM_API_ID",
  "TELEGRAM_API_HASH",
  "SUPABASE_URL",
  "SUPABASE_KEY"
];
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const CHANNEL_REFRESH_MS = 5 * 60 * 1000;
const recentDetections = new Map();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function validateEnv() {
  for (const name of REQUIRED_ENV) {
    requireEnv(name);
  }
}

function createSupabaseClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function normalizeTelegramUsername(telegramUrl) {
  if (!telegramUrl) {
    return null;
  }

  const value = String(telegramUrl).trim();
  const directHandle = value.match(/^@([A-Za-z0-9_]{5,})$/);
  if (directHandle) {
    return directHandle[1].toLowerCase();
  }

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!url.hostname.includes("t.me") && !url.hostname.includes("telegram.me")) {
      return null;
    }

    const username = url.pathname.split("/").filter(Boolean)[0];
    return username && !username.startsWith("+") ? username.toLowerCase() : null;
  } catch {
    const fallback = value.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{5,})/i);
    return fallback ? fallback[1].toLowerCase() : null;
  }
}

function normalizeTokenSymbol(symbol) {
  return symbol ? symbol.replace(/^\$/, "").toUpperCase() : null;
}

export function extractToken(text = "") {
  const contractMatch = text.match(/0x[a-fA-F0-9]{40}/);
  const symbolMatch = text.match(/\$([A-Za-z][A-Za-z0-9_]{1,15})\b/);

  return {
    contract_address: contractMatch?.[0] ?? null,
    token_symbol: normalizeTokenSymbol(symbolMatch?.[1] ?? null)
  };
}

export async function getTokenPrice(contract) {
  if (!contract) {
    return null;
  }

  try {
    const { data } = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(contract)}`,
      { timeout: 10_000 }
    );

    const price = data?.pairs?.[0]?.priceUsd;
    const parsed = price == null ? null : Number(price);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (error) {
    console.error(`[price] failed contract=${contract}: ${error.message}`);
    return null;
  }
}

export async function getChannelsFromDB(supabase) {
  const { data, error } = await supabase
    .from("channels")
    .select("id, name, telegram_url");

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      telegramUrl: channel.telegram_url,
      username: normalizeTelegramUsername(channel.telegram_url)
    }))
    .filter((channel) => channel.id && channel.username);
}

function makeDuplicateKey(channelId, token) {
  const tokenKey = token.contract_address || token.token_symbol;
  return `${channelId}:${tokenKey?.toLowerCase()}`;
}

function isDuplicate(channelId, token, now = Date.now()) {
  const key = makeDuplicateKey(channelId, token);
  if (!key.endsWith(":undefined") && recentDetections.has(key)) {
    const lastSeen = recentDetections.get(key);
    if (now - lastSeen < DEDUPE_WINDOW_MS) {
      return true;
    }
  }

  recentDetections.set(key, now);
  for (const [existingKey, lastSeen] of recentDetections.entries()) {
    if (now - lastSeen >= DEDUPE_WINDOW_MS) {
      recentDetections.delete(existingKey);
    }
  }

  return false;
}

function getMessageTimestamp(message) {
  if (message?.date) {
    return new Date(message.date * 1000).toISOString();
  }

  return new Date().toISOString();
}

function getMessageText(message) {
  return message?.message || message?.text || "";
}

async function createTelegramClient() {
  const apiId = Number(requireEnv("TELEGRAM_API_ID"));
  if (!Number.isInteger(apiId)) {
    throw new Error("TELEGRAM_API_ID must be an integer.");
  }

  const session = new StringSession(process.env.TELEGRAM_SESSION || "");
  const client = new TelegramClient(session, apiId, requireEnv("TELEGRAM_API_HASH"), {
    connectionRetries: 5
  });

  const rl = createInterface({ input, output });
  try {
    await client.start({
      phoneNumber: async () => rl.question("Telegram phone number: "),
      password: async () => rl.question("Telegram 2FA password: "),
      phoneCode: async () => rl.question("Telegram login code: "),
      onError: (error) => console.error(`[telegram] auth error: ${error.message}`)
    });
  } finally {
    rl.close();
  }

  const savedSession = client.session.save();
  if (savedSession && savedSession !== process.env.TELEGRAM_SESSION) {
    console.log("[telegram] save this TELEGRAM_SESSION value for future runs:");
    console.log(savedSession);
  }

  return client;
}

async function resolveChannelEntities(client, channels) {
  const resolved = new Map();

  for (const channel of channels) {
    try {
      const entity = await client.getEntity(channel.username);
      const peerId = String(entity.id?.value ?? entity.id);
      resolved.set(peerId, channel);
      resolved.set(channel.username, channel);
      console.log(`[channels] listening ${channel.name} (@${channel.username})`);
    } catch (error) {
      console.error(`[channels] failed to resolve ${channel.name} (@${channel.username}): ${error.message}`);
    }
  }

  return resolved;
}

function getChannelForMessage(message, channelsByPeer) {
  const peer = message?.peerId?.channelId ?? message?.peerId?.chatId ?? message?.chatId;
  const peerId = peer == null ? null : String(peer.value ?? peer);
  return peerId ? channelsByPeer.get(peerId) : null;
}

async function processMessage({ message, supabase, channelsByPeer }) {
  const channel = getChannelForMessage(message, channelsByPeer);
  if (!channel) {
    return;
  }

  const token = extractToken(getMessageText(message));
  if (!token.contract_address && !token.token_symbol) {
    return;
  }

  if (isDuplicate(channel.id, token)) {
    console.log(`[skip] ${channel.name}: duplicate ${token.contract_address || token.token_symbol}`);
    return;
  }

  const entryPrice = token.contract_address ? await getTokenPrice(token.contract_address) : null;
  const detectedToken = token.token_symbol || token.contract_address;

  const payload = {
    channel_id: channel.id,
    token_symbol: token.token_symbol,
    contract_address: token.contract_address,
    entry_price: entryPrice,
    current_price: entryPrice,
    peak_price: entryPrice,
    called_at: getMessageTimestamp(message)
  };

  const { error } = await supabase.from("calls").insert(payload);
  if (error) {
    console.error(`[insert] failed ${channel.name} token=${detectedToken}: ${error.message}`);
    return;
  }

  console.log(`[insert] ${channel.name}: detected ${detectedToken} entry=${entryPrice ?? "n/a"}`);
}

async function main() {
  validateEnv();

  const supabase = createSupabaseClient();
  const client = await createTelegramClient();

  let channels = await getChannelsFromDB(supabase);
  let channelsByPeer = await resolveChannelEntities(client, channels);

  setInterval(async () => {
    try {
      channels = await getChannelsFromDB(supabase);
      channelsByPeer = await resolveChannelEntities(client, channels);
      console.log(`[channels] refreshed ${channels.length} channel(s)`);
    } catch (error) {
      console.error(`[channels] refresh failed: ${error.message}`);
    }
  }, CHANNEL_REFRESH_MS).unref();

  client.addEventHandler(
    async (event) => {
      try {
        await processMessage({
          message: event.message,
          supabase,
          channelsByPeer
        });
      } catch (error) {
        console.error(`[message] processing failed: ${error.message}`);
      }
    },
    new NewMessage({})
  );

  console.log(`[telegram] scraper running. Monitoring ${channels.length} channel(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[fatal] ${error.message}`);
    process.exitCode = 1;
  });
}
