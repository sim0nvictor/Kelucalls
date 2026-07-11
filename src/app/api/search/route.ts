import { NextRequest, NextResponse } from "next/server";
import { withSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ channels: [], tokens: [] });
  }

  const term = `%${q}%`;

  const [channels, tokens] = await Promise.all([
    // ── Channels ────────────────────────────────────────────────────────────
    withSupabase(async (supabase) => {
      const { data, error } = await supabase
        .from("channels")
        .select(`
          id,
          slug,
          title,
          telegram_handle,
          telegram_url,
          status,
          is_verified,
          channel_stats (
            total_calls,
            win_rate_pct,
            average_roi_pct,
            ranking_score
          )
        `)
        .or(`title.ilike.${term},telegram_handle.ilike.${term}`)
        .in("status", ["active", "paused"])
        .limit(6);

      if (error) throw error;

      return (data ?? []).map((row) => {
        const stats = Array.isArray(row.channel_stats)
          ? row.channel_stats[0] ?? {}
          : (row.channel_stats ?? {});
        return {
          id: row.id,
          slug: row.slug,
          title: row.title,
          telegramHandle: row.telegram_handle,
          telegramUrl: row.telegram_url,
          status: row.status,
          isVerified: row.is_verified,
          totalCalls: Number(stats.total_calls ?? 0),
          winRatePct: Number(stats.win_rate_pct ?? 0),
          averageRoiPct: Number(stats.average_roi_pct ?? 0),
          rankingScore: Number(stats.ranking_score ?? 0),
        };
      });
    }, []),

    // ── Tokens ──────────────────────────────────────────────────────────────
    withSupabase(async (supabase) => {
      const { data, error } = await supabase
        .from("tokens")
        .select(`
          id,
          symbol,
          name,
          chain,
          contract_address,
          last_price_usd,
          last_market_cap_usd
        `)
        .or(`symbol.ilike.${term},name.ilike.${term},contract_address.ilike.${term}`)
        .limit(6);

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: String(row.id),
        symbol: String(row.symbol),
        name: row.name ? String(row.name) : null,
        chain: String(row.chain),
        contractAddress: row.contract_address ? String(row.contract_address) : null,
        lastPriceUsd: row.last_price_usd ? Number(row.last_price_usd) : null,
        lastMarketCapUsd: row.last_market_cap_usd ? Number(row.last_market_cap_usd) : null,
      }));
    }, []),
  ]);

  return NextResponse.json({ channels, tokens });
}