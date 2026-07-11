import Link from "next/link";
import { ArrowRight, Radio, Sparkles, TrendingUp } from "lucide-react";

import { TokenAvatar } from "@/components/token-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardSnapshot, getSponsoredTokenPlacements } from "@/lib/dashboard-data";
import { formatCompactCurrency, formatMultiple, formatPercent } from "@/lib/metrics";
import type { RankingMode } from "@/types/kelucalls";
import { LeaderboardWithPlacements } from "@/components/leaderboard-with-placements";
import { SponsoredTokenCard } from "@/components/sponsored-placement-card";

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
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 px-6 py-10 shadow-[0_0_120px_rgba(8,145,178,0.12)] sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Badge>Performance-first intelligence</Badge>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Kelucalls ranks Telegram crypto channels on what they actually deliver.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                Track ROI, win rate, simulated PnL, and breakout multiples from real call timestamps.
                Sponsored placements stay visible, but never contaminate trust rankings.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/channels">
                <Button size="lg">
                  Explore leaderboard
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <a href="#submissions">
                <Button variant="secondary" size="lg">Submit a channel</Button>
              </a>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
                <div className="text-2xl font-semibold text-white">{snapshot.totals.trackedChannels}</div>
                <div className="mt-2 text-sm text-slate-400">Tracked channels</div>
              </div>
              <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
                <div className="text-2xl font-semibold text-white">{snapshot.totals.trackedCalls}</div>
                <div className="mt-2 text-sm text-slate-400">Tracked calls</div>
              </div>
              <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
                <div className="text-2xl font-semibold text-white">
                  {formatCompactCurrency(snapshot.totals.simulatedPnlUsd)}
                </div>
                <div className="mt-2 text-sm text-slate-400">Simulated PnL</div>
              </div>
            </div>
          </div>

          <Card className="border-cyan-400/15 bg-white/5">
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.32em] text-cyan-300">Ranking model</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Trust-based leaderboard</h2>
                </div>
                <Sparkles className="size-6 text-cyan-300" />
              </div>
              <p className="text-sm leading-7 text-slate-300">
                Score = average ROI x 0.5 + win rate x 0.3 + log(total calls + 1) x 0.2. Paid
                channels are excluded from ranking inputs by design.
              </p>
              <div className="grid gap-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/8 bg-slate-950/80 p-4">
                  <div className="text-slate-500">Portfolio win rate</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {formatPercent(snapshot.totals.winRatePct)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-slate-950/80 p-4">
                  <div className="text-slate-500">Live call feed</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{snapshot.liveCalls.length}</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-slate-950/80 p-4">
                  <div className="text-slate-500">Trending tokens</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {snapshot.totals.trackedTokens}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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

      {/* ── Leaderboard ───────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
              Leaderboard
            </Badge>
            <h2 className="mt-3 text-3xl font-semibold text-white">
              Real rankings, not subscriber theater.
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {rankingModes.map((mode) => (
              <Link key={mode.value} href={`/?ranking=${mode.value}`}>
                <Button variant={rankingMode === mode.value ? "default" : "secondary"} size="sm">
                  {mode.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>
        {/* Channel sponsored placements inject after rank 5/6 inside this component */}
        <LeaderboardWithPlacements
          channels={snapshot.leaderboard.slice(0, 6)}
          placements={snapshot.sponsoredPlacements}
        />
      </section>

      {/* ── Live feed + Trending + Sponsored ──────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">

        {/* Live call feed */}
        <Card>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3">
              <Radio className="size-5 text-cyan-300" />
              <div>
                <h2 className="text-2xl font-semibold text-white">Live call feed</h2>
                <p className="text-sm text-slate-400">Recent calls with live ROI and breakout detection.</p>
              </div>
            </div>

            {/* Sponsored token — top of live feed card */}
            {sponsoredTokens.length > 0 && (
              <SponsoredTokenCard placement={sponsoredTokens[0]} />
            )}

            <div className="space-y-3">
              {snapshot.liveCalls.map((call) => (
                <div key={call.id} className="rounded-2xl border border-white/8 bg-slate-900/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <TokenAvatar src={call.tokenLogoUrl} symbol={call.tokenSymbol} size={36} />
                      <div>
                        <div className="text-sm text-cyan-300">{call.channelTitle}</div>
                        <div className="mt-0.5 text-lg font-semibold text-white">{call.tokenSymbol}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {new Date(call.calledAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-500">Current ROI</div>
                      <div className="mt-1 text-xl font-semibold text-white">
                        {formatPercent(call.currentRoiPct)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span>Peak {formatMultiple(call.peakMultiple)}</span>
                    {call.hit2x   ? <span className="text-emerald-400">2x</span>   : null}
                    {call.hit10x  ? <span className="text-emerald-400">10x</span>  : null}
                    {call.hit100x ? <span className="text-emerald-400">100x</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Trending tokens */}
          <Card>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3">
                <TrendingUp className="size-5 text-emerald-300" />
                <div>
                  <h2 className="text-2xl font-semibold text-white">Trending tokens</h2>
                  <p className="text-sm text-slate-400">Most-called tokens across tracked channels.</p>
                </div>
              </div>
              <div className="space-y-3">
                {snapshot.trendingTokens.map((token) => (
                  <Link key={token.id} href={`/tokens?symbol=${token.symbol}`}>
                    <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-4 transition-colors hover:bg-white/5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <TokenAvatar src={token.logoUrl} symbol={token.symbol} size={36} />
                          <div>
                            <div className="text-lg font-semibold text-white">{token.symbol}</div>
                            <div className="text-sm text-slate-500">{token.chain}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-slate-500">Best multiple</div>
                          <div className="text-lg font-semibold text-white">
                            {formatMultiple(token.bestMultiple)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-400">
                        <span>{token.totalCalls} calls</span>
                        <span>{token.uniqueChannels} channels</span>
                        <span className={token.averageRoiPct >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatPercent(token.averageRoiPct)} avg ROI
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}