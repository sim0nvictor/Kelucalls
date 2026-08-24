import Link from "next/link";
import { ArrowRight, Radio, Sparkles, TrendingUp } from "lucide-react";

import { SearchBox } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChannelIdentity,
  DataTable,
  DataTableHeader,
  DataTableRow,
  MetricValue,
  PerformanceValue,
  StatusBadge,
  TokenIdentity,
  VerificationBadge,
} from "@/components/ui/data-table";
import { getDashboardSnapshot, getSponsoredTokenPlacements } from "@/lib/dashboard-data";
import { formatCompactCurrency, formatMultiple, formatPercent } from "@/lib/metrics";
import type { RankingMode } from "@/types/kelucalls";
import { SponsoredPlacementCard } from "@/components/sponsored-placement-card";
import { siteConfig } from "@/config/site";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{ ranking?: string }>;
};

const rankingModes: Array<{ value: RankingMode; label: string }> = [
  { value: "smart",    label: "Smart ranking" },
  { value: "roi",      label: "ROI" },
  { value: "win-rate", label: "Win rate" },
  { value: "pnl",      label: "PnL" }
];

function formatTablePrice(value: number | null) {
  if (value === null) return "—";
  if (value === 0) return "$0";

  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1) {
    return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (absoluteValue >= 0.01) return "$" + value.toFixed(4);
  if (absoluteValue >= 0.000001) return "$" + value.toFixed(8);
  return "$" + value.toExponential(2);
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { ranking } = await searchParams;
  const rankingMode = rankingModes.some((item) => item.value === ranking)
    ? (ranking as RankingMode)
    : "smart";

  const [snapshot, sponsoredTokens] = await Promise.all([
    getDashboardSnapshot(rankingMode),
    getSponsoredTokenPlacements("homepage", 1),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <section className="border-b border-white/10 pb-7">
        <div className="mb-5 md:hidden"><SearchBox mobile /></div>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge>Performance-first intelligence</Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{siteConfig.name} market overview</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Real call performance, token momentum, and channel reputation in one live dashboard.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/channels"><Button size="sm">Explore leaderboard<ArrowRight className="size-4" /></Button></Link>
            <a href="#submissions"><Button variant="secondary" size="sm">Submit a channel</Button></a>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 divide-x divide-white/10 border-y border-white/10 sm:grid-cols-4">
          <div className="px-4 py-4 first:pl-0"><div className="text-2xl font-semibold text-white">{snapshot.totals.trackedChannels}</div><div className="mt-1 text-xs text-slate-500">Tracked channels</div></div>
          <div className="px-4 py-4"><div className="text-2xl font-semibold text-white">{snapshot.totals.trackedTokens}</div><div className="mt-1 text-xs text-slate-500">Tracked tokens</div></div>
          <div className="border-t border-white/10 px-4 py-4 sm:border-t-0"><div className="text-2xl font-semibold text-white">{snapshot.totals.trackedCalls}</div><div className="mt-1 text-xs text-slate-500">Tracked calls</div></div>
          <div className="border-t border-white/10 px-4 py-4 last:pr-0 sm:border-t-0"><div className="text-2xl font-semibold text-emerald-400">{formatCompactCurrency(snapshot.totals.simulatedPnlUsd)}</div><div className="mt-1 text-xs text-slate-500">Simulated PnL</div></div>
        </div>
      </section>

      {!snapshot.isConfigured ? (
        <Card className="border-amber-400/20 bg-amber-400/10">
          <CardContent>
            <p className="text-sm text-amber-100">
              Supabase is not configured yet. Apply the SQL migration, set the environment variables,
              and the dashboard will populate from live channel, call, token, and stats tables.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><TrendingUp className="size-5 text-emerald-300" /><h2 className="text-2xl font-semibold text-white">Trending Tokens</h2></div>
            <p className="mt-1 text-sm text-slate-400">Most-called tokens across tracked channels.</p>
          </div>
        </div>
        <DataTable caption="Trending tokens" minWidth="min-w-0 sm:min-w-[38rem]" tableClassName="table-fixed">
          <DataTableHeader>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 first:pl-4">Token</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">ROI</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Calls</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Channels</th>
            <th scope="col" className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Chain</th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Best</th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 last:pr-4 sm:table-cell">Last called</th>
          </DataTableHeader>
          <tbody>{snapshot.trendingTokens.map((token) => (
            <DataTableRow key={token.id} interactive>
              <td className="px-3 py-3 first:pl-4"><TokenIdentity href={`/tokens?symbol=${token.symbol}`} symbol={token.symbol} name={token.name} logoUrl={token.logoUrl} chain={token.chain} /></td>
              <td className="px-3 py-3 text-right"><MetricValue value={<PerformanceValue value={token.averageRoiPct} />} /></td>
              <td className="px-3 py-3 text-right"><MetricValue value={token.totalCalls} /></td>
              <td className="px-3 py-3 text-right"><MetricValue value={token.uniqueChannels} /></td>
              <td className="hidden px-3 py-3 text-left text-slate-300 sm:table-cell">{token.chain}</td>
              <td className="hidden px-3 py-3 text-right text-slate-300 sm:table-cell">{formatMultiple(token.bestMultiple)}</td>
              <td className="hidden px-3 py-3 text-right text-xs text-slate-500 last:pr-4 sm:table-cell">{token.lastCalledAt ? new Date(token.lastCalledAt).toLocaleString() : "—"}</td>
            </DataTableRow>
          ))}</tbody>
        </DataTable>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2"><Radio className="size-5 text-cyan-300" /><div><h2 className="text-2xl font-semibold text-white">Live Calls</h2><p className="mt-1 text-sm text-slate-400">Recent calls with live ROI and breakout detection.</p></div></div>
        <DataTable caption="Live calls" minWidth="min-w-0 sm:min-w-[52rem]" tableClassName="table-fixed">
          <DataTableHeader>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 first:pl-4">Token</th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Channel</th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Entry</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Current</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">ROI</th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Peak</th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 last:pr-4 sm:table-cell">Time</th>
          </DataTableHeader>
          <tbody>{snapshot.liveCalls.map((call) => (
            <DataTableRow key={call.id} interactive>
              <td className="px-3 py-3 first:pl-4"><Link href={`/tokens?symbol=${call.tokenSymbol}`} className="font-semibold text-white hover:text-cyan-300">{call.tokenSymbol}</Link><details className="mt-1 sm:hidden"><summary className="cursor-pointer text-xs text-cyan-300 marker:text-slate-600">More call data</summary><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><div><dt className="text-slate-500">Entry</dt><dd className="text-slate-300">{formatTablePrice(call.entryPriceUsd)}</dd></div><div><dt className="text-slate-500">Peak</dt><dd className="text-slate-300">{formatMultiple(call.peakMultiple)}</dd></div><div className="col-span-2"><dt className="text-slate-500">Called</dt><dd className="text-slate-300">{new Date(call.calledAt).toLocaleString()}</dd></div></dl></details></td>
              <td className="max-w-44 px-3 py-3"><Link href={`/channels/${call.channelSlug}`} className="block truncate text-cyan-300 hover:text-cyan-200">{call.channelTitle}</Link></td>
              <td className="hidden px-3 py-3 text-right font-medium text-slate-300 sm:table-cell">{formatTablePrice(call.entryPriceUsd)}</td>
              <td className="px-3 py-3 text-right font-medium text-white">{formatTablePrice(call.currentPriceUsd)}</td>
              <td className={`px-3 py-3 text-right text-base font-bold ${call.currentRoiPct > 0 ? "text-emerald-400" : "text-red-400"}`}>{formatPercent(call.currentRoiPct)}</td>
              <td className="hidden px-3 py-3 text-right text-base font-bold text-white sm:table-cell">{formatMultiple(call.peakMultiple)}</td>
              <td className="hidden whitespace-nowrap px-3 py-3 text-right text-xs text-slate-400 last:pr-4 sm:table-cell">{new Date(call.calledAt).toLocaleTimeString()}</td>
            </DataTableRow>
          ))}</tbody>
        </DataTable>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">Leaderboard</Badge><h2 className="mt-3 text-2xl font-semibold text-white">Channel Leaderboard</h2><p className="mt-1 text-sm text-slate-400">Ranked by the selected trust model, excluding paid placements.</p></div>
          <div className="flex flex-wrap gap-2">{rankingModes.map((mode) => <Link key={mode.value} href={`/?ranking=${mode.value}`}><Button variant={rankingMode === mode.value ? "default" : "secondary"} size="sm">{mode.label}</Button></Link>)}</div>
        </div>
        <DataTable caption="Channel leaderboard" minWidth="min-w-0 sm:min-w-[56rem]" tableClassName="table-fixed">
          <DataTableHeader>
            <th scope="col" className="w-14 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 first:pl-4">Rank</th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Channel</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Calls</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Win Rate</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Avg ROI</th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Best</th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">PnL</th>
            <th scope="col" className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 last:pr-4 sm:table-cell">Status</th>
          </DataTableHeader>
          <tbody>{snapshot.leaderboard.slice(0, 6).map((channel, index) => (
            <DataTableRow key={channel.id} interactive>
              <td className="px-3 py-3 first:pl-4"><span className={index < 3 ? "font-semibold text-yellow-300" : "font-semibold text-slate-400"}>#{index + 1}</span></td>
              <td className="px-3 py-3"><ChannelIdentity href={`/channels/${channel.slug}`} title={channel.title} avatarUrl={channel.avatarUrl} description={channel.description} /><div className="mt-1 sm:hidden"><VerificationBadge verified={channel.isVerified} /></div></td>
              <td className="px-3 py-3 text-right"><MetricValue value={channel.totalCalls} /></td>
              <td className="px-3 py-3 text-right"><PerformanceValue value={channel.winRatePct} /></td>
              <td className="px-3 py-3 text-right"><PerformanceValue value={channel.averageRoiPct} /></td>
              <td className="hidden px-3 py-3 text-right text-slate-300 sm:table-cell">{formatMultiple(channel.bestMultiple)}</td>
              <td className="hidden px-3 py-3 text-right sm:table-cell"><PerformanceValue value={channel.simulatedCurrentPnlUsd} kind="currency" /></td>
              <td className="hidden px-3 py-3 text-left last:pr-4 sm:table-cell"><StatusBadge status={channel.status} /></td>
            </DataTableRow>
          ))}</tbody>
        </DataTable>
        {snapshot.sponsoredPlacements.filter((placement) => placement.placementSubtype === "channel_placement").length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">{snapshot.sponsoredPlacements.filter((placement) => placement.placementSubtype === "channel_placement").map((placement) => <SponsoredPlacementCard key={placement.id} placement={placement} />)}</div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="border-cyan-400/15 bg-white/5"><CardContent className="space-y-5"><div className="flex items-center justify-between"><div><p className="text-sm uppercase tracking-[0.32em] text-cyan-300">Insights</p><h2 className="mt-2 text-2xl font-semibold text-white">Trust-based ranking model</h2></div><Sparkles className="size-6 text-cyan-300" /></div><p className="text-sm leading-7 text-slate-300">Score = average ROI x 0.5 + win rate x 0.3 + log(total calls + 1) x 0.2. Paid channels are excluded from ranking inputs by design.</p><div className="grid gap-3 text-sm sm:grid-cols-3"><div><div className="text-2xl font-semibold text-white">{formatPercent(snapshot.totals.winRatePct)}</div><div className="text-slate-500">Portfolio win rate</div></div><div><div className="text-2xl font-semibold text-white">{snapshot.liveCalls.length}</div><div className="text-slate-500">Live calls</div></div><div><div className="text-2xl font-semibold text-white">{snapshot.totals.trackedTokens}</div><div className="text-slate-500">Trending tokens</div></div></div></CardContent></Card>
        {sponsoredTokens.length > 0 ? <SponsoredPlacementCard placement={sponsoredTokens[0]} /> : null}
      </section>
    </div>
  );
}