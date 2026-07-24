import Link from "next/link";
import { Trophy, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { formatPercent, formatCompactCurrency } from "@/lib/metrics";
import { TopCallersChart } from "./callers-chart";
import { ChannelAvatar } from "@/components/channel-avatar";
import { siteConfig } from "@/config/site";

export const metadata = {
  title: `Top Callers | ${siteConfig.name}`,
  description: "The most profitable Telegram crypto call channels ranked by performance"
};

export default async function TopCallersPage() {
  const snapshot = await getDashboardSnapshot("smart");
  const leaderboard = snapshot.leaderboard;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="border-yellow-400/20 bg-yellow-400/10 text-yellow-200">
            <Crown className="mr-1.5 size-3" />
            Elite Performers
          </Badge>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Top Callers</h1>
          <p className="mt-2 text-slate-400">
            Channels ranked by our trust-based algorithm — no paid placements
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm">
            By ROI
          </Button>
          <Button variant="secondary" size="sm">
            By Win Rate
          </Button>
          <Button variant="secondary" size="sm">
            By PnL
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="border-white/8 bg-slate-950/70 lg:col-span-3">
          <CardContent className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Performance Overview</h2>
                <p className="text-sm text-slate-500">Average ROI across top channels</p>
              </div>
            </div>
            <TopCallersChart channels={leaderboard.slice(0, 10)} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Trophy className="size-5 text-yellow-400" />
                <h3 className="font-semibold text-white">This Month&apos;s #1</h3>
              </div>
              {leaderboard[0] && (
                <div className="mt-4">
                  <div className="flex items-center gap-3">
                    <ChannelAvatar
                      src={leaderboard[0].avatarUrl}
                      title={leaderboard[0].title}
                      size={40}
                    />
                    <div className="text-lg font-bold text-white">{leaderboard[0].title}</div>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Avg ROI</span>
                      <span className="font-medium text-emerald-400">
                        {formatPercent(leaderboard[0].averageRoiPct)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Win Rate</span>
                      <span className="font-medium text-white">
                        {formatPercent(leaderboard[0].winRatePct)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Calls</span>
                      <span className="font-medium text-white">
                        {leaderboard[0].totalCalls}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-5">
              <h3 className="font-semibold text-white">Quick Stats</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-2xl font-bold text-white">
                    {formatPercent(snapshot.totals.winRatePct)}
                  </div>
                  <div className="text-xs text-slate-500">Portfolio Win Rate</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">
                    {formatCompactCurrency(snapshot.totals.simulatedPnlUsd)}
                  </div>
                  <div className="text-xs text-slate-500">Total Simulated PnL</div>
                </div>
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
                    Rank
                  </th>
                  <th className="pb-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Channel
                  </th>
                  <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    Score
                  </th>
                  <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    Avg ROI
                  </th>
                  <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    Win Rate
                  </th>
                  <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    Calls
                  </th>
                  <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    Sim PnL
                  </th>
                  <th className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    10x / 100x
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((channel, index) => (
                  <tr
                    key={channel.id}
                    className="border-b border-white/5 transition-colors hover:bg-white/5"
                  >
                    <td className="py-4">
                      <div
                        className={`inline-flex size-8 items-center justify-center font-bold ${
                          index === 0
                            ? "bg-transparent text-slate-400"
                            : index === 1
                              ? "bg-transparent text-slate-400"
                              : index === 2
                                ? "bg-transparent text-slate-400"
                                : "bg-transparent text-slate-400"
                        }`}
                      >
                        {index + 1}
                      </div>
                    </td>
                    <td className="py-4">
                      <Link href={`/channel/${channel.slug}`} className="group">
                        <div className="flex items-center gap-3">
                          <ChannelAvatar
                            src={channel.avatarUrl}
                            title={channel.title}
                            size={36}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                                {channel.title}
                              </span>
                              {channel.isVerified && (
                                <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                                  Verified
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">@{channel.telegramHandle}</div>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-4 text-right">
                      <span className="inline-flex items-center rounded-lg bg-cyan-500/10 px-2.5 py-1 text-sm font-semibold text-cyan-300">
                        {channel.rankingScore != null ? channel.rankingScore.toFixed(1) : "—"}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <span
                        className={`font-medium ${
                          channel.averageRoiPct > 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatPercent(channel.averageRoiPct)}
                      </span>
                    </td>
                    <td className="py-4 text-right text-white">{formatPercent(channel.winRatePct)}</td>
                    <td className="py-4 text-right text-white">{channel.totalCalls}</td>
                    <td className="py-4 text-right">
                      <span
                        className={`font-medium ${
                          channel.simulatedCurrentPnlUsd > 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatCompactCurrency(channel.simulatedCurrentPnlUsd)}
                      </span>
                    </td>
                    <td className="py-4 text-right text-white">
                      {channel.hit10xCount} / {channel.hit100xCount}
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