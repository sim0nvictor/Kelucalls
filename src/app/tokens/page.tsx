import { Suspense } from "react";
import Link from "next/link";
import { Activity, Search, Filter, TrendingUp, BarChart2, Wallet, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTrendingTokens } from "@/lib/dashboard-data";
import { formatMultiple, formatPercent } from "@/lib/metrics";
import { TokenPriceChart } from "./price-chart";
import { TokenAvatar } from "@/components/token-avatar";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Token Analytics | Kelucalls",
  description: "Deep analytics on tokens across all tracked channels"
};

export default async function TokensPage({
  searchParams
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const { symbol } = await searchParams;

  // Fetch all tokens directly — not capped at 6 like getDashboardSnapshot
  const tokens = await getTrendingTokens(200, "total_calls");

  const selectedToken = symbol
    ? tokens.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase())
    : null;

  // Summary stats computed from real data
  const profitableCount  = tokens.filter((t) => t.averageRoiPct > 0).length;
  const avgRoi           = tokens.length > 0
    ? tokens.reduce((acc, t) => acc + t.averageRoiPct, 0) / tokens.length
    : 0;
  const bestMultipleAll  = tokens.length > 0
    ? Math.max(...tokens.map((t) => t.bestMultiple))
    : 0;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="border-purple-400/20 bg-purple-400/10 text-purple-200">
            <Activity className="mr-1.5 size-3" />
            Analytics
          </Badge>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Token Analytics</h1>
          <p className="mt-2 text-slate-400">
            {tokens.length} tokens tracked across all channels
          </p>
        </div>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search tokens by symbol..."
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/20"
          />
        </div>
      </div>

      {selectedToken ? (
        // ── Single token detail view ────────────────────────────────────────
        <div className="space-y-6">
          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <TokenAvatar src={selectedToken.logoUrl} symbol={selectedToken.symbol} size={56} />
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedToken.symbol}</h2>
                    <div className="flex items-center gap-2 text-slate-500">
                      <span>{selectedToken.chain}</span>
                      {selectedToken.name && <><span>•</span><span>{selectedToken.name}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm">
                    <BarChart2 className="mr-2 size-4" />Chart
                  </Button>
                  <Button variant="secondary" size="sm">
                    <Wallet className="mr-2 size-4" />Portfolio
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-4">
            {[
              { icon: TrendingUp, label: "Avg ROI", value: formatPercent(selectedToken.averageRoiPct), color: selectedToken.averageRoiPct > 0 ? "text-emerald-400" : "text-red-400" },
              { icon: Activity,   label: "Total Calls",    value: String(selectedToken.totalCalls),       color: "text-white" },
              { icon: Users,      label: "Channels",       value: String(selectedToken.uniqueChannels),   color: "text-white" },
              { icon: TrendingUp, label: "Best Multiple",  value: formatMultiple(selectedToken.bestMultiple), color: "text-purple-300" },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label} className="border-white/8 bg-slate-950/70">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon className="size-4" />
                    <span className="text-xs uppercase tracking-wider">{label}</span>
                  </div>
                  <div className={`mt-3 text-3xl font-bold ${color}`}>{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-white">Price History</h3>
              <p className="text-sm text-slate-500">Simulated chart — live price data from DexScreener</p>
              <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-white/5" />}>
                <div className="mt-6"><TokenPriceChart /></div>
              </Suspense>
            </CardContent>
          </Card>

          <div className="flex">
            <Link href="/tokens">
              <Button variant="secondary">← Back to all tokens</Button>
            </Link>
          </div>
        </div>
      ) : (
        // ── Token list view ─────────────────────────────────────────────────
        <>
          <div className="grid gap-6 lg:grid-cols-4">
            {[
              { icon: Activity,   label: "Total Tokens",  value: String(tokens.length),          color: "text-white" },
              { icon: TrendingUp, label: "Profitable",    value: String(profitableCount),         color: "text-emerald-400" },
              { icon: BarChart2,  label: "Avg ROI",       value: formatPercent(avgRoi),           color: "text-white" },
              { icon: TrendingUp, label: "Best Multiple", value: formatMultiple(bestMultipleAll), color: "text-purple-300" },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label} className="border-white/8 bg-slate-950/70">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon className="size-4" />
                    <span className="text-xs uppercase tracking-wider">{label}</span>
                  </div>
                  <div className={`mt-3 text-3xl font-bold ${color}`}>{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">
                  All {tokens.length} Tracked Tokens
                </h3>
                <Button variant="secondary" size="sm">
                  <Filter className="mr-2 size-4" />Filter
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/8">
                      {["Token", "Chain", "Calls", "Channels", "Avg ROI", "Best Multiple", "Last Called"].map((h) => (
                        <th
                          key={h}
                          className={`pb-4 text-xs font-medium uppercase tracking-wider text-slate-500 ${h === "Token" || h === "Chain" ? "text-left" : "text-right"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token) => (
                      <tr key={token.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
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
                        <td className="py-4 text-right font-medium text-white">
                          {formatMultiple(token.bestMultiple)}
                        </td>
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
        </>
      )}
    </div>
  );
}