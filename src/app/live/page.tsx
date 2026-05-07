import Link from "next/link";
import { Radio, Zap, Clock, TrendingUp, TrendingDown, Flame, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { formatMultiple, formatPercent } from "@/lib/metrics";
import { LiveFeedTicker } from "./live-ticker";

export const metadata = {
  title: "Live Feed | Kelucalls",
  description: "Real-time feed of crypto calls as they happen across tracked channels"
};

export default async function LivePage() {
  const snapshot = await getDashboardSnapshot("smart");
  const liveCalls = snapshot.liveCalls;
  const trendingTokens = snapshot.trendingTokens;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="border-red-400/20 bg-red-400/10 text-red-200 animate-pulse">
            <Zap className="mr-1.5 size-3" />
            Live
          </Badge>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Live Feed</h1>
          <p className="mt-2 text-slate-400">
            Watch calls come in live with real-time ROI tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Bell className="mr-2 size-4" />
            Subscribe
          </Button>
        </div>
      </div>

      <LiveFeedTicker calls={liveCalls} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-white/8 bg-slate-950/70 lg:col-span-2">
          <CardContent className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-3 w-3 animate-pulse items-center justify-center rounded-full bg-red-500">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">Recent Calls</h2>
                <span className="text-sm text-slate-500">({liveCalls.length} calls)</span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm">
                  All
                </Button>
                <Button variant="secondary" size="sm">
                  2x+
                </Button>
                <Button variant="secondary" size="sm">
                  10x+
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {liveCalls.length > 0 ? (
                liveCalls.map((call) => (
                  <div
                    key={call.id}
                    className="group relative overflow-hidden rounded-2xl border border-white/8 bg-slate-900/60 p-4 transition-all hover:border-cyan-400/30 hover:bg-slate-900/80"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="relative flex flex-wrap items-start justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-white/5">
                          <span className="text-sm font-bold text-cyan-300">
                            {call.tokenSymbol.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/channel/${call.channelSlug}`}
                              className="text-sm text-cyan-300 hover:text-cyan-200"
                            >
                              {call.channelTitle}
                            </Link>
                            <Clock className="size-3 text-slate-500" />
                            <span className="text-xs text-slate-500">
                              {new Date(call.calledAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xl font-bold text-white">{call.tokenSymbol}</span>
                            {call.hit2x && (
                              <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                                2x
                              </Badge>
                            )}
                            {call.hit10x && (
                              <Badge className="border-yellow-400/20 bg-yellow-400/10 text-yellow-200">
                                10x
                              </Badge>
                            )}
                            {call.hit100x && (
                              <Badge className="border-red-400/20 bg-red-400/10 text-red-200">
                                100x
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-xs text-slate-500">Current ROI</div>
                          <div
                            className={`text-2xl font-bold ${
                              call.currentRoiPct > 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {formatPercent(call.currentRoiPct)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500">Peak Multiple</div>
                          <div className="text-xl font-bold text-white">
                            {formatMultiple(call.peakMultiple)}
                          </div>
                        </div>
                        <div
                          className={`flex size-10 items-center justify-center rounded-xl ${
                            call.currentRoiPct > 0
                              ? "bg-emerald-500/10"
                              : "bg-red-500/10"
                          }`}
                        >
                          {call.currentRoiPct > 0 ? (
                            <TrendingUp className="size-5 text-emerald-400" />
                          ) : (
                            <TrendingDown className="size-5 text-red-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <Radio className="mb-4 size-12 opacity-50" />
                  <p>No live calls at the moment</p>
                  <p className="mt-1 text-sm">Check back soon for new calls.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Flame className="size-5 text-orange-400" />
                <h3 className="font-semibold text-white">Hot Tokens</h3>
              </div>
              <div className="mt-4 space-y-3">
                {trendingTokens.slice(0, 5).map((token, index) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between rounded-xl bg-white/5 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-6 items-center justify-center rounded-md bg-white/10 text-xs font-bold text-slate-400">
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-medium text-white">{token.symbol}</div>
                        <div className="text-xs text-slate-500">{token.chain}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-white">
                        {formatMultiple(token.bestMultiple)}
                      </div>
                      <div className="text-xs text-slate-500">{token.totalCalls} calls</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-5">
              <h3 className="font-semibold text-white">Today&apos;s Stats</h3>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-white/5 p-3">
                  <div className="text-2xl font-bold text-white">{liveCalls.length}</div>
                  <div className="text-xs text-slate-500">Calls Today</div>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <div className="text-2xl font-bold text-emerald-400">
                    {liveCalls.filter((c) => c.currentRoiPct > 0).length}
                  </div>
                  <div className="text-xs text-slate-500">Profitable</div>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <div className="text-2xl font-bold text-white">
                    {liveCalls.reduce((acc, c) => acc + (c.hit2x ? 1 : 0), 0)}
                  </div>
                  <div className="text-xs text-slate-500">2x Hits</div>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <div className="text-2xl font-bold text-yellow-400">
                    {liveCalls.reduce((acc, c) => acc + (c.hit10x ? 1 : 0), 0)}
                  </div>
                  <div className="text-xs text-slate-500">10x Hits</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}