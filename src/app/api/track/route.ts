import { NextRequest, NextResponse } from "next/server";
import { withSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const MIN_MEMBERS = 200;

// ── Normalise input → bare username ───────────────────────────────────────
function extractUsername(raw: string): string | null {
  let s = raw.trim();
  s = s.replace(/^https?:\/\//i, "");
  if (s.toLowerCase().startsWith("t.me/")) s = s.slice("t.me/".length);
  s = s.replace(/^@+/, "").split(/[/?]/)[0];
  if (/^[a-zA-Z0-9_]{5,32}$/.test(s)) return s;
  return null;
}

// ── Telegram live lookup (reuses same singleton as telegram-lookup route) ──
async function lookupTelegram(username: string) {
  try {
    const { TelegramClient } = await import("telegram");
    const { StringSession } = await import("telegram/sessions/index.js" as string);

    const apiId   = Number(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH ?? "";
    const session = process.env.TELEGRAM_SESSION ?? "";

    if (!apiHash || !session) return null;

    const client = new TelegramClient(
      new StringSession(session), apiId, apiHash,
      { connectionRetries: 2, requestRetries: 1 }
    );
    await client.connect();

    const entity = await client.getEntity(`@${username}`);
    const cls = (entity as unknown as Record<string, unknown>).className as string;
    if (cls !== "Channel") return { error: "not_a_channel" };

    const ch = entity as unknown as Record<string, unknown>;
    return {
      title:       String(ch.title ?? username),
      handle:      `@${String(ch.username ?? username)}`,
      memberCount: typeof ch.participantsCount === "number" ? ch.participantsCount : null,
      isScam:      Boolean(ch.scam),
      isFake:      Boolean(ch.fake),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("USERNAME_NOT_OCCUPIED") || msg.includes("Cannot find any entity")) {
      return { error: "not_found" };
    }
    // If Telegram is unavailable, allow the request through without the quality gate
    return null;
  }
}

// ── POST /api/track ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const raw = typeof (body as Record<string, unknown>).handle === "string"
    ? ((body as Record<string, unknown>).handle as string)
    : "";

  const username = extractUsername(raw);
  if (!username) {
    return NextResponse.json(
      { error: "Enter a valid Telegram handle (5–32 characters)." },
      { status: 422 }
    );
  }

  const normalised = `@${username}`;

  // ── 1. Already tracked? ──────────────────────────────────────────────────
  const existing = await withSupabase(async (sb) => {
    const { data } = await sb.from("channels").select("slug, status")
      .ilike("telegram_handle", normalised).maybeSingle();
    return data;
  }, null);

  if (existing) {
    return NextResponse.json({
      alreadyTracked: true,
      slug: existing.slug,
      message: "This channel is already live on Kelucalls.",
    });
  }

  // ── 2. Already queued? ───────────────────────────────────────────────────
  const queued = await withSupabase(async (sb) => {
    const { data } = await sb.from("tracking_requests").select("id, status")
      .ilike("telegram_handle", normalised)
      .in("status", ["queued", "processing"]).maybeSingle();
    return data;
  }, null);

  if (queued) {
    return NextResponse.json({
      alreadyQueued: true,
      message: "This channel is already in the tracking queue — it will appear on the leaderboard shortly.",
    });
  }

  // ── 3. Quality gate via live Telegram lookup ─────────────────────────────
  const tg = await lookupTelegram(username);

  if (tg && "error" in tg) {
    if (tg.error === "not_found") {
      return NextResponse.json(
        { error: "No Telegram channel found with that handle." },
        { status: 404 }
      );
    }
    if (tg.error === "not_a_channel") {
      return NextResponse.json(
        { error: "That handle belongs to a user or bot, not a channel." },
        { status: 422 }
      );
    }
  }

  if (tg && !("error" in tg)) {
    if (tg.isScam || tg.isFake) {
      // Still insert but as rejected so we don't re-check this handle
      await withSupabase(async (sb) => {
        await sb.from("tracking_requests").insert({
          telegram_handle: normalised,
          telegram_title:  tg.title,
          member_count:    tg.memberCount,
          status:          "rejected",
          rejection_reason: tg.isScam ? "scam" : "fake",
        });
      }, null);
      return NextResponse.json(
        { error: "This channel is flagged as a scam by Telegram and cannot be tracked." },
        { status: 422 }
      );
    }

    if (tg.memberCount !== null && tg.memberCount < MIN_MEMBERS) {
      await withSupabase(async (sb) => {
        await sb.from("tracking_requests").insert({
          telegram_handle: normalised,
          telegram_title:  tg.title,
          member_count:    tg.memberCount,
          status:          "rejected",
          rejection_reason: "too_small",
        });
      }, null);
      return NextResponse.json(
        {
          error: `Channel has ${tg.memberCount} members. We require at least ${MIN_MEMBERS} to track.`,
          memberCount: tg.memberCount,
          minRequired: MIN_MEMBERS,
        },
        { status: 422 }
      );
    }
  }

  // ── 4. Insert into tracking_requests (queued) ────────────────────────────
  const inserted = await withSupabase(async (sb) => {
    const { data, error } = await sb.from("tracking_requests").insert({
      telegram_handle: normalised,
      telegram_title:  tg && !("error" in tg) ? tg.title  : null,
      member_count:    tg && !("error" in tg) ? tg.memberCount : null,
      status: "queued",
    }).select("id").single();
    if (error) throw error;
    return data;
  }, null);

  if (!inserted) {
    return NextResponse.json(
      { error: "Could not save your request. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    queued: true,
    message: "Tracking request received. Analysis usually appears within a few minutes.",
  }, { status: 201 });
}