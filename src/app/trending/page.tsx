import { Suspense } from "react";
import Link from "next/link";
import { TrendingUp, Flame, Filter, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTrendingTokens, getSponsoredTokenPlacements } from "@/lib/dashboard-data";
import { getTokenMarketSnapshotsForTokens } from "@/lib/token-market";
import { formatMultiple, formatPercent } from "@/lib/metrics";
import { TrendingTokenChart } from "./token-chart";
import { TokenAvatar } from "@/components/token-avatar";
import { ChainIcon, chainBrandColor } from "@/components/chain-icon";
import {
  LiveChangeCell,
  LiveMarketCapCell,
  LiveMarketProvider,
  LivePriceCell,
  LivePriceWithCap,
} from "@/components/tokens/live-market-cells";
import { SponsoredTokenCard } from "@/components/sponsored-placement-card";
import { siteConfig } from "@/config/site";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export const metadata = {
  title: `Trending Tokens | ${siteConfig.name}`,
  description: "Live prices, market caps and call activity for the hottest tokens across tracked channels"
};

// Chain call breakdown — computed from real data, not hardcoded
function getChainBreakdown(tokens: Awaited<ReturnType<typeof getTrendingTokens>>) {
  const chainMap = new Map<string, number>();
  for (const t of tokens) {
    chainMap.set(t.chain, (chainMap.get(t.chain) ?? 0) + t.totalCalls);
  }
  return Array.from(chainMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([chain, calls]) => ({ chain, calls }));
}

export default async function TrendingPage() {
  // Fetch all trending tokens directly — not capped at 6 like getDashboardSnapshot
  const [tokens, sponsoredTokens] = await Promise.all([
    getTrendingTokens(100, "unique_channels"),
    getSponsoredTokenPlacements("trending", 2),
  ]);

  // Symbols are sent alongside addresses so tokens with a missing or wrong
  // contract address still get a live price.
  const marketQueries = tokens.map((token) => ({
    address: token.contractAddress,
    symbol: token.symbol,
  }));

  // Seed the first paint so prices are never blank before the first poll.
  const initialSnapshots = await getTokenMarketSnapshotsForTokens(marketQueries);

  const topGainer = tokens[0] ?? null;
  const chainBreakdown = getChainBreakdown(tokens);

  return (
    <LiveMarketProvider tokens={marketQueries} initialSnapshots={initialSnapshots}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Sponsored token placements — always at the top */}
        {sponsoredTokens.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {sponsoredTokens.map((placement) => (
              <SponsoredTokenCard key={placement.id} placement={placement} />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="border-orange-400/20 bg-orange-400/10 text-orange-200">
              <Flame className="mr-1.5 size-3" />
              Hot right now
            </Badge>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Trending Tokens</h1>
            <p className="mt-2 text-slate-400">
              {tokens.length} tokens tracked across all channels, with live price and market cap
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm">
              <Filter className="mr-2 size-4" />
              Filter
            </Button>
            <Button variant="secondary" size="sm">
              <ArrowUpDown className="mr-2 size-4" />
              Sort
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 border-white/8 bg-slate-950/70">
            <CardContent className="p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Call Activity</h2>
                  <p className="text-sm text-slate-500">Top tokens by call volume</p>
                </div>
              </div>
              <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white/5" />}>
                <TrendingTokenChart tokens={tokens.slice(0, 20)} />
              </Suspense>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {/* Top gainer card */}
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-5 text-emerald-400" />
                  <h3 className="font-semibold text-white">Most Covered</h3>
                </div>
                {topGainer && (
                  <Link href={`/tokens?symbol=${topGainer.symbol}`}>
                    <div className="mt-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-transparent p-4 hover:from-emerald-500/15 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <TokenAvatar src={topGainer.logoUrl} symbol={topGainer.symbol} size={36} />
                          <div>
                            <div className="text-2xl font-bold text-white">{topGainer.symbol}</div>
                            <ChainIcon chain={topGainer.chain} size={14} showLabel />
                          </div>
                        </div>
                        <LivePriceWithCap
                          address={topGainer.contractAddress}
                          symbol={topGainer.symbol}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-slate-500">Channels</div>
                          <div className="font-semibold text-white">{topGainer.uniqueChannels}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Total calls</div>
                          <div className="font-semibold text-white">{topGainer.totalCalls}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Best multiple</div>
                          <div className="font-semibold text-emerald-400">{formatMultiple(topGainer.bestMultiple)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Avg ROI</div>
                          <div className={`font-semibold ${topGainer.averageRoiPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {formatPercent(topGainer.averageRoiPct)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Real chain breakdown from actual data */}
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <h3 className="font-semibold text-white">By Chain</h3>
                <div className="mt-4 space-y-3">
                  {chainBreakdown.map((item) => (
                    <div key={item.chain} className="flex items-center justify-between">
                      <ChainIcon chain={item.chain} size={20} showLabel />
                      <span
                        className="text-sm font-medium"
                        style={{ color: chainBrandColor(item.chain) }}
                      >
                        {item.calls} calls
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Full tokens table */}
        <Card className="border-white/8 bg-slate-950/70">
          <CardContent className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">All {tokens.length} Trending Tokens</h2>
              <p className="text-xs text-slate-500">Price, market cap and 24h move from DexScreener</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-white/8">
                    {["#", "Token", "Chain", "Price", "24h", "Market Cap", "Calls", "Channels", "Avg ROI", "Best Multiple", "Last Called"].map((h) => (
                      <th key={h} className={`pb-4 text-xs font-medium uppercase tracking-wider text-slate-500 ${h === "#" || h === "Token" || h === "Chain" ? "text-left" : "text-right"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token, index) => (
                    <tr key={token.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                      <td className="py-4">
                        <span className={`inline-flex size-6 items-center justify-center text-xs font-bold ${index < 3 ? "text-yellow-300" : "text-slate-400"}`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-4">
                        <Link href={`/tokens?symbol=${token.symbol}`} className="group">
                          <div className="flex items-center gap-3">
                            <TokenAvatar src={token.logoUrl} symbol={token.symbol} size={32} />
                            <div>
                              <div className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                                {token.symbol}
                              </div>
                              {token.name && <div className="text-xs text-slate-500">{token.name}</div>}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="py-4">
                        <ChainIcon chain={token.chain} size={20} showLabel />
                      </td>
                      <td className="py-4 text-right">
                        <LivePriceCell
                          address={token.contractAddress}
                          symbol={token.symbol}
                          className="font-medium text-white"
                        />
                      </td>
                      <td className="py-4 text-right">
                        <LiveChangeCell
                          address={token.contractAddress}
                          symbol={token.symbol}
                          className="font-medium"
                        />
                      </td>
                      <td className="py-4 text-right">
                        <LiveMarketCapCell
                          address={token.contractAddress}
                          symbol={token.symbol}
                          className="text-white"
                        />
                      </td>
                      <td className="py-4 text-right text-white">{token.totalCalls}</td>
                      <td className="py-4 text-right text-white">{token.uniqueChannels}</td>
                      <td className="py-4 text-right">
                        <span className={`font-medium ${token.averageRoiPct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatPercent(token.averageRoiPct)}
                        </span>
                      </td>
                      <td className="py-4 text-right font-medium text-white">{formatMultiple(token.bestMultiple)}</td>
                      <td className="py-4 text-right text-sm text-slate-500">
                        {token.lastCalledAt ? new Date(token.lastCalledAt).toLocaleDateString() : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </LiveMarketProvider>
  );
}
