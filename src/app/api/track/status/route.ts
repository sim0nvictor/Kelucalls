import { NextRequest, NextResponse } from "next/server";
import { withSupabase } from "@/lib/supabase";
import { toNumber } from "@/lib/metrics";

export const runtime = "nodejs";

// GET /api/track/status?handle=@channelname
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("handle")?.trim() ?? "";
  if (!raw) {
    return NextResponse.json({ error: "Missing handle." }, { status: 400 });
  }

  const handle = raw.startsWith("@") ? raw : `@${raw}`;

  const row = await withSupabase(async (sb) => {
    const { data } = await sb
      .from("tracking_requests")
      .select("id, status, channel_id, rejection_reason")
      .ilike("telegram_handle", handle)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }, null);

  if (!row) {
    return NextResponse.json({ status: "not_found" });
  }

  // Still in progress
  if (row.status === "queued" || row.status === "processing") {
    return NextResponse.json({ status: row.status });
  }

  // Failed / rejected
  if (row.status === "failed" || row.status === "rejected") {
    return NextResponse.json({
      status: row.status,
      reason: row.rejection_reason ?? null,
    });
  }

  // Done — fetch channel stats
  if (row.status === "done" && row.channel_id) {
    const channel = await withSupabase(async (sb) => {
      const { data, error } = await sb
        .from("channels")
        .select(`
          id,
          slug,
          title,
          telegram_handle,
          telegram_url,
          is_verified,
          channel_stats (
            total_calls,
            win_rate_pct,
            average_roi_pct,
            average_peak_roi_pct,
            best_multiple,
            ranking_score,
            hit_2x_count,
            hit_10x_count,
            simulated_current_pnl_usd
          )
        `)
        .eq("id", row.channel_id)
        .maybeSingle();

      if (error || !data) return null;

      // PostgREST one-to-one relationship — handle both array and object shapes
      const stats = Array.isArray(data.channel_stats)
        ? (data.channel_stats[0] ?? {})
        : (data.channel_stats ?? {});

      return {
        slug:                   data.slug,
        title:                  data.title,
        telegramHandle:         data.telegram_handle,
        telegramUrl:            data.telegram_url,
        isVerified:             data.is_verified,
        totalCalls:             toNumber(stats.total_calls),
        winRatePct:             toNumber(stats.win_rate_pct),
        averageRoiPct:          toNumber(stats.average_roi_pct),
        averagePeakRoiPct:      toNumber(stats.average_peak_roi_pct),
        bestMultiple:           toNumber(stats.best_multiple, 1),
        rankingScore:           toNumber(stats.ranking_score),
        hit2xCount:             toNumber(stats.hit_2x_count),
        hit10xCount:            toNumber(stats.hit_10x_count),
        simulatedCurrentPnlUsd: toNumber(stats.simulated_current_pnl_usd),
      };
    }, null);

    if (!channel) {
      // channel_id set but stats not ready yet — treat as still processing
      return NextResponse.json({ status: "processing" });
    }

    return NextResponse.json({ status: "done", channel });
  }

  return NextResponse.json({ status: row.status });
}