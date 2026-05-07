import { Suspense } from "react";
import Link from "next/link";
import { Activity, Search, Filter, TrendingUp, BarChart2, Wallet, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { formatMultiple, formatPercent } from "@/lib/metrics";
import { TokenPriceChart } from "./price-chart";

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
  const snapshot = await getDashboardSnapshot("smart");
  const tokens = snapshot.trendingTokens;

  const selectedToken = symbol
    ? tokens.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase())
    : null;

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
            Comprehensive token performance data across all calls
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
        <div className="space-y-6">
          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20">
                    <span className="text-xl font-bold text-purple-300">
                      {selectedToken.symbol.slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedToken.symbol}</h2>
                    <div className="flex items-center gap-2 text-slate-500">
                      <span>{selectedToken.chain}</span>
                      {selectedToken.name && (
                        <>
                          <span>•</span>
                          <span>{selectedToken.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm">
                    <BarChart2 className="mr-2 size-4" />
                    Chart
                  </Button>
                  <Button variant="secondary" size="sm">
                    <Wallet className="mr-2 size-4" />
                    Portfolio
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-4">
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <TrendingUp className="size-4" />
                  <span className="text-xs uppercase tracking-wider">Avg ROI</span>
                </div>
                <div
                  className={`mt-3 text-3xl font-bold ${
                    selectedToken.averageRoiPct > 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {formatPercent(selectedToken.averageRoiPct)}
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <Activity className="size-4" />
                  <span className="text-xs uppercase tracking-wider">Total Calls</span>
                </div>
                <div className="mt-3 text-3xl font-bold text-white">{selectedToken.totalCalls}</div>
              </CardContent>
            </Card>
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <Users className="size-4" />
                  <span className="text-xs uppercase tracking-wider">Channels</span>
                </div>
                <div className="mt-3 text-3xl font-bold text-white">{selectedToken.uniqueChannels}</div>
              </CardContent>
            </Card>
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <TrendingUp className="size-4" />
                  <span className="text-xs uppercase tracking-wider">Best Multiple</span>
                </div>
                <div className="mt-3 text-3xl font-bold text-purple-300">
                  {formatMultiple(selectedToken.bestMultiple)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-white">Price History</h3>
              <p className="text-sm text-slate-500">Mock price data for visualization</p>
              <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-white/5" />}>
                <div className="mt-6 h-64">
                  <TokenPriceChart />
                </div>
              </Suspense>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-4">
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <Activity className="size-4" />
                  <span className="text-xs uppercase tracking-wider">Total Tokens</span>
                </div>
                <div className="mt-3 text-3xl font-bold text-white">{tokens.length}</div>
              </CardContent>
            </Card>
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <TrendingUp className="size-4" />
                  <span className="text-xs uppercase tracking-wider">Profitable</span>
                </div>
                <div className="mt-3 text-3xl font-bold text-emerald-400">
                  {tokens.filter((t) => t.averageRoiPct > 0).length}
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <BarChart2 className="size-4" />
                  <span className="text-xs uppercase tracking-wider">Avg ROI</span>
                </div>
                <div className="mt-3 text-3xl font-bold text-white">
                  {formatPercent(
                    tokens.reduce((acc, t) => acc + t.averageRoiPct, 0) / Math.max(tokens.length, 1)
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <TrendingUp className="size-4" />
                  <span className="text-xs uppercase tracking-wider">Best Multiple</span>
                </div>
                <div className="mt-3 text-3xl font-bold text-purple-300">
                  {formatMultiple(
                    Math.max(...tokens.map((t) => t.bestMultiple), 0)
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">All Tracked Tokens</h3>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm">
                    <Filter className="mr-2 size-4" />
                    Filter
                  </Button>
                </div>
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/8">
                      <th className="pb-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                        Token
                      </th>
                      <th className="pb-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                        Chain
                      </th>
                      <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                        Calls
                      </th>
                      <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                        Channels
                      </th>
                      <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                        Avg ROI
                      </th>
                      <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                        Best Multiple
                      </th>
                      <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                        Last Called
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token) => (
                      <tr
                        key={token.id}
                        className="border-b border-white/5 transition-colors hover:bg-white/5"
                      >
                        <td className="py-4">
                          <Link href={`/tokens?symbol=${token.symbol}`} className="group">
                            <div className="font-semibold text-white group-hover:text-purple-300">
                              {token.symbol}
                            </div>
                            {token.name && <div className="text-xs text-slate-500">{token.name}</div>}
                          </Link>
                        </td>
                        <td className="py-4">
                          <Badge className="border-white/10 bg-white/5 text-slate-300">
                            {token.chain}
                          </Badge>
                        </td>
                        <td className="py-4 text-right text-white">{token.totalCalls}</td>
                        <td className="py-4 text-right text-white">{token.uniqueChannels}</td>
                        <td className="py-4 text-right">
                          <span
                            className={`font-medium ${
                              token.averageRoiPct > 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {formatPercent(token.averageRoiPct)}
                          </span>
                        </td>
                        <td className="py-4 text-right font-medium text-white">
                          {formatMultiple(token.bestMultiple)}
                        </td>
                        <td className="py-4 text-right text-sm text-slate-500">
                          {token.lastCalledAt
                            ? new Date(token.lastCalledAt).toLocaleDateString()
                            : "—"}
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