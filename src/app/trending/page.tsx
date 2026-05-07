import { Suspense } from "react";
import Link from "next/link";
import { TrendingUp, Flame, Filter, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { formatMultiple, formatPercent } from "@/lib/metrics";
import { TrendingTokenChart } from "./token-chart";

export const metadata = {
  title: "Trending Tokens | Kelucalls",
  description: "Discover the hottest tokens being called across tracked channels"
};

export default async function TrendingPage() {
  const snapshot = await getDashboardSnapshot("smart");

  const tokens = snapshot.trendingTokens;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="border-orange-400/20 bg-orange-400/10 text-orange-200">
            <Flame className="mr-1.5 size-3" />
            Hot right now
          </Badge>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Trending Tokens</h1>
          <p className="mt-2 text-slate-400">
            Tokens with the most recent call activity across all tracked channels
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
                <p className="text-sm text-slate-500">Calls per token over time</p>
              </div>
              <div className="flex gap-2">
                {["24h", "7d", "30d"].map((period) => (
                  <Button
                    key={period}
                    variant={period === "7d" ? "default" : "secondary"}
                    size="sm"
                    className="text-xs"
                  >
                    {period}
                  </Button>
                ))}
              </div>
            </div>
            <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white/5" />}>
              <TrendingTokenChart tokens={tokens} />
            </Suspense>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-5 text-emerald-400" />
                <h3 className="font-semibold text-white">Top Gainer</h3>
              </div>
              {tokens[0] && (
                <div className="mt-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-transparent p-4">
                  <div className="text-3xl font-bold text-white">{tokens[0].symbol}</div>
                  <div className="mt-2 flex items-center gap-2 text-emerald-400">
                    <span className="text-lg font-semibold">
                      {formatMultiple(tokens[0].bestMultiple)}
                    </span>
                    <span className="text-sm">best multiple</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-5">
              <h3 className="font-semibold text-white">By Chain</h3>
              <div className="mt-4 space-y-3">
                {[
                  { chain: "SOL", color: "#14f195", calls: 45 },
                  { chain: "ETH", color: "#627eea", calls: 32 },
                  { chain: "BASE", color: "#0052ff", calls: 28 },
                  { chain: "PEPE", color: "#ffeb3b", calls: 18 }
                ].map((item) => (
                  <div key={item.chain} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="size-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-slate-300">{item.chain}</span>
                    </div>
                    <span className="text-sm font-medium text-white">
                      {item.calls} calls
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-white/8 bg-slate-950/70">
        <CardContent className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="pb-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    #
                  </th>
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
                {tokens.map((token, index) => (
                  <tr
                    key={token.id}
                    className="border-b border-white/5 transition-colors hover:bg-white/5"
                  >
                    <td className="py-4">
                      <span
                        className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                          index < 3
                            ? "bg-gradient-to-br from-yellow-500/20 to-orange-500/20 text-yellow-300"
                            : "bg-white/10 text-slate-400"
                        }`}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td className="py-4">
                      <Link href={`/tokens?symbol=${token.symbol}`} className="group">
                        <div className="font-semibold text-white group-hover:text-cyan-300">
                          {token.symbol}
                        </div>
                        {token.name && (
                          <div className="text-xs text-slate-500">{token.name}</div>
                        )}
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
    </div>
  );
}