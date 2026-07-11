import { NextRequest, NextResponse } from "next/server";
import { withSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// ── Env helpers ────────────────────────────────────────────────────────────
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

// ── Normalise user input → bare username ──────────────────────────────────
function extractUsername(raw: string): string | null {
  let s = raw.trim();

  // Strip t.me/ links: https://t.me/handle or t.me/handle
  s = s.replace(/^https?:\/\//i, "");
  if (s.toLowerCase().startsWith("t.me/")) {
    s = s.slice("t.me/".length);
  }

  // Strip leading @
  s = s.replace(/^@+/, "");

  // Remove anything after a slash or ?
  s = s.split(/[/?]/)[0];

  // Telegram username rules: 5-32 chars, alphanumeric + underscore
  if (/^[a-zA-Z0-9_]{5,32}$/.test(s)) return s;
  return null;
}

// ── Singleton Telegram client (reused across requests in same process) ─────
let _clientPromise: Promise<import("telegram").TelegramClient> | null = null;

async function getTelegramClient() {
  if (_clientPromise) return _clientPromise;

  _clientPromise = (async () => {
    // Dynamic import so this module doesn't crash at build time if telegram
    // is not installed — it will throw at runtime with a clear message.
    const { TelegramClient } = await import("telegram");
    const { StringSession } = await import("telegram/sessions/index.js" as string);

    const apiId   = Number(requireEnv("TELEGRAM_API_ID"));
    const apiHash = requireEnv("TELEGRAM_API_HASH");
    const session = requireEnv("TELEGRAM_SESSION");

    const client = new TelegramClient(
      new StringSession(session),
      apiId,
      apiHash,
      { connectionRetries: 3, requestRetries: 2, autoReconnect: true }
    );

    await client.connect();
    return client;
  })();

  // If connection fails, reset so next request retries
  _clientPromise.catch(() => { _clientPromise = null; });
  return _clientPromise;
}

// ── GET /api/telegram-lookup?handle=xxx ───────────────────────────────────
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("handle") ?? "";
  const username = extractUsername(raw);

  if (!username) {
    return NextResponse.json(
      { error: "Enter a valid Telegram handle or t.me link." },
      { status: 422 }
    );
  }

  try {
    const client = await getTelegramClient();

    // resolveUsername returns the full entity
    const entity = await client.getEntity(`@${username}`);

    // Only proceed for channels/megagroups — not users or bots
    // entity.className will be "Channel" for public channels/groups
    const cls = (entity as unknown as Record<string, unknown>).className as string;
    if (cls !== "Channel") {
      return NextResponse.json(
        { error: "That handle belongs to a user or bot, not a channel." },
        { status: 422 }
      );
    }

    const ch = entity as unknown as Record<string, unknown>;

    const title       = String(ch.title ?? username);
    const handle      = `@${String(ch.username ?? username)}`;
    const memberCount = typeof ch.participantsCount === "number"
      ? ch.participantsCount
      : null;
    const description = typeof ch.about === "string" ? ch.about : null;
    const isBroadcast = Boolean(ch.broadcast);   // true = channel, false = group
    const isScam      = Boolean(ch.scam);
    const isFake      = Boolean(ch.fake);
    const isVerified  = Boolean(ch.verified);

    // Check if already tracked in our DB
    const trackedStatus = await withSupabase(async (supabase) => {
      const { data } = await supabase
        .from("channels")
        .select("status")
        .ilike("telegram_handle", handle)
        .maybeSingle();
      return data?.status ?? null;
    }, null);

    // Check if already queued
    const queuedStatus = trackedStatus ? null : await withSupabase(async (supabase) => {
      const { data } = await supabase
        .from("submissions")
        .select("status")
        .ilike("telegram_handle", handle)
        .in("status", ["pending", "queued"])
        .maybeSingle();
      return data?.status ?? null;
    }, null);

    return NextResponse.json({
      found: true,
      title,
      handle,
      memberCount,
      description,
      isBroadcast,
      isScam,
      isFake,
      isVerified,
      telegramUrl: `https://t.me/${username}`,
      trackedStatus,   // null | "active" | "paused" | etc.
      queuedStatus,    // null | "pending" | "queued"
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // Telegram throws specific errors for unknown usernames
    if (
      msg.includes("USERNAME_NOT_OCCUPIED") ||
      msg.includes("USERNAME_INVALID") ||
      msg.includes("No user has") ||
      msg.includes("Cannot find any entity")
    ) {
      return NextResponse.json(
        { found: false, error: "No Telegram channel found with that handle." },
        { status: 404 }
      );
    }

    console.error("[telegram-lookup]", msg);
    return NextResponse.json(
      { error: "Telegram lookup failed. Please try again." },
      { status: 500 }
    );
  }
}