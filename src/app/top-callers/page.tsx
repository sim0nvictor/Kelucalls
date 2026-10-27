import Link from "next/link";
import { Trophy, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { formatCompactPercent, formatNumber, formatPercent, formatCompactCurrency } from "@/lib/metrics";
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

      <Card className="border-white/[0.08] bg-slate-950/30">
        <CardContent className="p-2 sm:p-5">
          <DataTable
            caption="Top callers"
            minWidth="min-w-[480px] sm:min-w-[800px]"
            tableClassName="table-fixed"
            className="rounded-none border-0 bg-transparent"
            columns={[
              { className: "w-[42px] sm:w-16" },
              { className: "w-[180px] sm:w-56" },
              { className: "hidden sm:table-column" },
              { className: "w-[100px] sm:w-auto" },
              { className: "w-[80px] sm:w-auto" },
              { className: "w-[70px] sm:w-auto" },
              { className: "hidden sm:table-column" },
              { className: "hidden sm:table-column" },
            ]}
          >
              <DataTableHeader>
                  <th className="sticky left-0 z-50 bg-slate-950 px-1.5 py-3 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:px-3 sm:text-left sm:text-xs">
                    Rank
                  </th>
                  <th className="sticky left-[42px] z-40 bg-slate-950 px-1.5 py-3 text-left text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:left-16 sm:px-3 sm:text-xs">
                    Channel
                  </th>
                  <th className="hidden px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                    Score
                  </th>
                  <th className="whitespace-nowrap px-1 py-3 text-right text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:px-3 sm:text-xs">
                    Avg ROI
                  </th>
                  <th className="whitespace-nowrap px-1 py-3 text-right text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:px-3 sm:text-xs">
                    Win %
                  </th>
                  <th className="whitespace-nowrap px-1 py-3 text-right text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:px-3 sm:text-xs">
                    Calls
                  </th>
                  <th className="hidden px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                    Sim PnL
                  </th>
                  <th className="hidden px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                    10x / 100x
                  </th>
              </DataTableHeader>
              <tbody>
                {leaderboard.map((channel, index) => (
                  <DataTableRow
                    key={channel.id}
                    interactive
                    className="group"
                  >
                    <td className="sticky left-0 z-10 bg-[#06101f] px-1.5 py-2 text-center group-hover:bg-[#0b1c2a] sm:px-3 sm:text-left">
                      <div
                        className={`inline-flex size-7 items-center justify-center text-xs font-bold ${
                          index === 0
                            ? "text-amber-300"
                            : index === 1
                              ? "text-slate-200"
                              : index === 2
                                ? "text-orange-300"
                                : "text-slate-400"
                        }`}
                      >
                        {index + 1}
                      </div>
                    </td>
                    <td className="sticky left-[42px] z-10 bg-[#06101f] px-1.5 py-2 group-hover:bg-[#0b1c2a] sm:left-16 sm:px-3">
                      <Link href={`/channel/${channel.slug}`} className="group">
                        <div className="flex min-h-11 min-w-0 items-center gap-2 sm:gap-3">
                          <ChannelAvatar
                            src={channel.avatarUrl}
                            title={channel.title}
                            size={32}
                          />
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-xs font-semibold text-white transition-colors group-hover:text-cyan-300 sm:text-sm">
                                {channel.title}
                              </span>
                              {channel.isVerified && (
                                <Badge className="hidden shrink-0 border-emerald-400/20 bg-emerald-400/10 text-emerald-200 sm:inline-flex">
                                  Verified
                                </Badge>
                              )}
                            </div>
                            <div className="truncate text-[10px] text-slate-500 sm:text-xs">@{channel.telegramHandle}</div>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="hidden px-3 py-3 text-right sm:table-cell">
                      <span className="inline-flex items-center rounded-lg bg-cyan-500/10 px-2.5 py-1 text-sm font-semibold text-cyan-300">
                        {channel.rankingScore != null ? channel.rankingScore.toFixed(1) : "—"}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-right sm:px-3 sm:py-3">
                      <span
                        className={`whitespace-nowrap font-mono text-xs font-medium tabular-nums sm:text-sm ${
                          channel.averageRoiPct > 0 ? "text-emerald-400" : channel.averageRoiPct < 0 ? "text-red-400" : "text-slate-300"
                        }`}
                      >
                        {formatCompactPercent(channel.averageRoiPct)}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-right font-mono text-xs tabular-nums text-white sm:px-3 sm:py-3 sm:text-sm">{formatPercent(channel.winRatePct)}</td>
                    <td className="px-1 py-2 text-right font-mono text-xs tabular-nums text-white sm:px-3 sm:py-3 sm:text-sm">{formatNumber(channel.totalCalls)}</td>
                    <td className="hidden px-3 py-3 text-right sm:table-cell">
                      <span
                        className={`font-medium ${
                          channel.simulatedCurrentPnlUsd > 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatCompactCurrency(channel.simulatedCurrentPnlUsd)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-right text-white sm:table-cell">
                      {channel.hit10xCount} / {channel.hit100xCount}
                    </td>
                  </DataTableRow>
                ))}
              </tbody>
          </DataTable>
        </CardContent>
      </Card>
    </div>
  );
}