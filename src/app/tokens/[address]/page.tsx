import Link from "next/link";
import { ArrowLeft, ExternalLink, TrendingUp, BarChart2, Zap, Radio } from "lucide-react";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChainIcon } from "@/components/chain-icon";
import { chainLabel } from "@/lib/chains";
import { DexChart } from "@/components/tokens/dex-chart";
import { LiveTokenPrice } from "@/components/tokens/live-token-price";
import { IntentPanel } from "@/components/intent/intent-panel";
import { getIntentHistory, getTokenIntent, getTokenSummary } from "@/lib/intent/queries";
import { findSnapshot, getTokenMarketSnapshotsForTokens } from "@/lib/token-market";
import { withSupabase } from "@/lib/supabase";
import { formatPercent, formatMultiple, toNumber } from "@/lib/metrics";

const DEXSCREENER_SEARCH_URL = "https://dexscreener.com/search?q=";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ address: string }>;
};

async function getTokenData(address: string) {
  return withSupabase(async (supabase) => {
    // ── Token row ──────────────────────────────────────────────────────
    const { data: token, error: tokenErr } = await supabase
      .from("tokens")
      .select("id, symbol, name, chain, contract_address, last_price_usd, last_market_cap_usd")
      .ilike("contract_address", address)
      .maybeSingle();

    if (tokenErr) throw tokenErr;
    if (!token) return null;

    // ── All calls for this token ────────────────────────────────────────
    const { data: calls, error: callsErr } = await supabase
      .from("calls")
      .select(`
        id,
        called_at,
        entry_price_usd,
        channels (
          slug,
          title,
          telegram_url
        ),
        call_metrics (
          current_price_usd,
          peak_price_usd,
          current_roi_pct,
          peak_multiple,
          hit_2x,
          hit_10x,
          hit_100x,
          is_win
        )
      `)
      .eq("token_id", token.id)
      .in("status", ["open", "closed"])
      .order("called_at", { ascending: false })
      .limit(50);

    if (callsErr) throw callsErr;

    // ── Aggregate stats ───────────────────────────────────────────────
    const callList = calls ?? [];
    const withMetrics = callList.filter((c) => c.call_metrics?.length);
    const totalCalls = callList.length;
    const wins = withMetrics.filter((c) => {
      const m = Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics;
      return m?.is_win;
    }).length;
    const winRate = withMetrics.length > 0 ? (wins / withMetrics.length) * 100 : 0;

    const roiValues = withMetrics.map((c) => {
      const m = Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics;
      return toNumber(m?.current_roi_pct);
    });
    const avgRoi = roiValues.length > 0 ? roiValues.reduce((a, b) => a + b, 0) / roiValues.length : 0;

    const multiples = withMetrics.map((c) => {
      const m = Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics;
      return toNumber(m?.peak_multiple, 1);
    });
    const bestMultiple = multiples.length > 0 ? Math.max(...multiples) : 1;

    const uniqueChannels = new Set(
      callList.map((c) => {
        const ch = Array.isArray(c.channels) ? c.channels[0] : c.channels;
        return ch?.slug;
      }).filter(Boolean)
    ).size;

    return {
      token: {
        id: String(token.id),
        symbol: String(token.symbol),
        name: token.name ? String(token.name) : null,
        chain: String(token.chain),
        contractAddress: String(token.contract_address),
        lastPriceUsd: token.last_price_usd ? Number(token.last_price_usd) : null,
        lastMarketCapUsd: token.last_market_cap_usd ? Number(token.last_market_cap_usd) : null,
      },
      stats: { totalCalls, winRate, avgRoi, bestMultiple, uniqueChannels },
      calls: callList.map((c) => {
        const ch = Array.isArray(c.channels) ? c.channels[0] : c.channels;
        const m  = Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics;
        return {
          id: c.id,
          calledAt: c.called_at,
          entryPriceUsd: toNumber(c.entry_price_usd),
          channelSlug: ch?.slug ?? "unknown",
          channelTitle: ch?.title ?? "Unknown channel",
          channelTelegramUrl: ch?.telegram_url ?? null,
          currentRoiPct: toNumber(m?.current_roi_pct),
          peakMultiple: toNumber(m?.peak_multiple, 1),
          hit2x: Boolean(m?.hit_2x),
          hit10x: Boolean(m?.hit_10x),
          hit100x: Boolean(m?.hit_100x),
          isWin: Boolean(m?.is_win),
        };
      }),
    };
  }, null);
}

// ── Chain badge colour ─────────────────────────────────────────────
function chainColour(chain: string) {
  const map: Record<string, string> = {
    solana:   "border-purple-400/25 bg-purple-400/10 text-purple-200",
    ethereum: "border-blue-400/25 bg-blue-400/10 text-blue-200",
    bsc:      "border-yellow-400/25 bg-yellow-400/10 text-yellow-200",
    base:     "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
    arbitrum: "border-sky-400/25 bg-sky-400/10 text-sky-200",
    polygon:  "border-violet-400/25 bg-violet-400/10 text-violet-200",
  };
  return map[chain.toLowerCase()] ?? "border-white/10 bg-white/5 text-slate-300";
}

export default async function TokenDetailPage({ params }: PageProps) {
  const { address } = await params;
  const data = await getTokenData(decodeURIComponent(address));

  if (!data) notFound();

  const { token, stats, calls } = data;

  // Resolve the deepest liquidity pair so the chart points at a real market.
  // The KeluScore reads run alongside it rather than after it, so the Intent
  // section costs no extra round trip in the critical path. The summary is a
  // cached row, never a model call, so it is safe in the render path.
  const [snapshots, intent, intentHistory, intentSummary] = await Promise.all([
    getTokenMarketSnapshotsForTokens([
      { address: token.contractAddress, symbol: token.symbol },
    ]),
    getTokenIntent(token.id),
    getIntentHistory(token.id, 60),
    getTokenSummary(token.id),
  ]);
  const snapshot = findSnapshot(snapshots, token.contractAddress, token.symbol);

  const dexUrl = DEXSCREENER_SEARCH_URL + encodeURIComponent(token.contractAddress);
  const shortAddr = token.contractAddress.slice(0, 6) + "…" + token.contractAddress.slice(-4);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">

      {/* Back */}
      <Link href="/tokens" className="flex w-fit items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="size-4" />
        Back to Tokens
      </Link>

      {/* Hero */}
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 px-6 py-8 shadow-[0_0_80px_rgba(8,145,178,0.10)] sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={chainColour(token.chain)}>
                <ChainIcon chain={token.chain} size={16} className="mr-1.5" />
                {chainLabel(token.chain)}
              </Badge>
              {token.name && (
                <Badge className="border-white/10 bg-white/5 text-slate-300">{token.name}</Badge>
              )}
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {token.symbol}
            </h1>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className="font-mono">{shortAddr}</span>
              <a
                href={snapshot?.pairUrl ?? dexUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-cyan-400 transition-colors hover:text-cyan-300"
              >
                View on DexScreener
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>

          <LiveTokenPrice
            address={token.contractAddress}
            symbol={token.symbol}
            fallbackPriceUsd={token.lastPriceUsd}
            fallbackMarketCapUsd={token.lastMarketCapUsd}
          />
        </div>
      </section>

      {/* Live chart, straight from DexScreener */}
      <DexChart
        pairUrl={snapshot?.pairUrl ?? null}
        chainId={snapshot?.chainId ?? null}
        contractAddress={token.contractAddress}
        symbol={token.symbol}
        chain={token.chain}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { icon: Radio,    label: "Total calls",     value: String(stats.totalCalls) },
          { icon: BarChart2, label: "Avg ROI",        value: formatPercent(stats.avgRoi) },
          { icon: TrendingUp, label: "Win rate",      value: formatPercent(stats.winRate) },
          { icon: Zap,       label: "Best multiple",  value: formatMultiple(stats.bestMultiple) },
          { icon: BarChart2, label: "Channels",       value: String(stats.uniqueChannels) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-white/4 p-4">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-slate-500">
              <Icon className="size-3.5 shrink-0" />
              {label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* KeluScore intent breakdown */}
      <IntentPanel
        intent={intent}
        symbol={token.symbol}
        history={intentHistory}
        summary={intentSummary}
      />

      {/* Calls table */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">All calls for {token.symbol}</h2>

        {calls.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-400">
              No calls tracked yet for this token.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {calls.map((call) => (
              <div
                key={call.id}
                className="rounded-2xl border border-white/8 bg-slate-900/80 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={"/channel/" + call.channelSlug}
                        className="text-sm font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
                      >
                        {call.channelTitle}
                      </Link>
                      {call.channelTelegramUrl && (
                        <a
                          href={call.channelTelegramUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(call.calledAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                    <div className="text-xs text-slate-600">
                      Entry ${call.entryPriceUsd > 0
                        ? call.entryPriceUsd < 0.0001
                          ? call.entryPriceUsd.toExponential(2)
                          : call.entryPriceUsd.toPrecision(4)
                        : "—"}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-right">
                    <div>
                      <div className="text-xs text-slate-500">ROI</div>
                      <div className={call.currentRoiPct >= 0 ? "text-lg font-semibold text-emerald-300" : "text-lg font-semibold text-red-400"}>
                        {formatPercent(call.currentRoiPct)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Peak</div>
                      <div className="text-lg font-semibold text-white">
                        {formatMultiple(call.peakMultiple)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Milestone badges */}
                {(call.hit2x || call.hit10x || call.hit100x) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {call.hit2x   && <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-xs text-emerald-300">2x</span>}
                    {call.hit10x  && <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-0.5 text-xs text-cyan-300">10x</span>}
                    {call.hit100x && <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-0.5 text-xs text-yellow-300">100x 🔥</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
