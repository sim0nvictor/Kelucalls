import { Suspense } from "react";
import Link from "next/link";
import { TrendingUp, Flame, Filter, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTrendingTokens, getSponsoredTokenPlacements } from "@/lib/dashboard-data";
import { formatMultiple, formatPercent } from "@/lib/metrics";
import { TrendingTokenChart } from "./token-chart";
import { TokenAvatar } from "@/components/token-avatar";
import { SponsoredTokenCard } from "@/components/sponsored-placement-card";
import { siteConfig } from "@/config/site";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export const metadata = {
  title: `Trending Tokens | ${siteConfig.name}`,
  description: "Discover the hottest tokens being called across tracked channels"
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
    .map(([chain, calls]) => ({ chain: chain.toUpperCase(), calls }));
}

const CHAIN_COLORS: Record<string, string> = {
  SOLANA: "#14f195",
  ETHEREUM: "#627eea",
  BASE: "#0052ff",
  BSC: "#f3ba2f",
  ARBITRUM: "#28a0f0",
  POLYGON: "#8247e5",
  AVALANCHE: "#e84142",
  OTHER: "#64748b",
};

export default async function TrendingPage() {
  // Fetch all trending tokens directly — not capped at 6 like getDashboardSnapshot
  const [tokens, sponsoredTokens] = await Promise.all([
    getTrendingTokens(100, "unique_channels"),
    getSponsoredTokenPlacements("trending", 2),
  ]);

  const topGainer = tokens[0] ?? null;
  const chainBreakdown = getChainBreakdown(tokens);

  return (
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
            {tokens.length} tokens tracked across all channels — sorted by channel coverage
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
                    <div className="flex items-center gap-3">
                      <TokenAvatar src={topGainer.logoUrl} symbol={topGainer.symbol} size={36} />
                      <div className="text-2xl font-bold text-white">{topGainer.symbol}</div>
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
                    <div className="flex items-center gap-2">
                      <div
                        className="size-2 rounded-full"
                        style={{ backgroundColor: CHAIN_COLORS[item.chain] ?? CHAIN_COLORS.OTHER }}
                      />
                      <span className="text-sm text-slate-300">{item.chain}</span>
                    </div>
                    <span className="text-sm font-medium text-white">{item.calls} calls</span>
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">All {tokens.length} Trending Tokens</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  {["#", "Token", "Chain", "Calls", "Channels", "Avg ROI", "Best Multiple", "Last Called"].map((h) => (
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
                      <Badge className="border-white/10 bg-white/5 text-slate-300">{token.chain}</Badge>
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
                      {token.lastCalledAt ? new Date(token.lastCalledAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}