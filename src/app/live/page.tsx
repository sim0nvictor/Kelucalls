import Link from "next/link";
import { Radio, Zap, Clock, TrendingUp, TrendingDown, Flame, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLiveCalls, getTrendingTokens, getSponsoredTokenPlacements } from "@/lib/dashboard-data";
import { getTokenMarketSnapshotsForTokens } from "@/lib/token-market";
import { formatMultiple, formatPercent } from "@/lib/metrics";
import { LiveFeedTicker } from "./live-ticker";
import { SponsoredTokenCard } from "@/components/sponsored-placement-card";
import { TokenAvatar } from "@/components/token-avatar";
import { ChainIcon } from "@/components/chain-icon";
import {
  LiveMarketCapCell,
  LiveMarketProvider,
  LivePriceCell,
  LivePriceWithCap,
} from "@/components/tokens/live-market-cells";
import { siteConfig } from "@/config/site";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export const metadata = {
  title: `Live Feed | ${siteConfig.name}`,
  description: "Real-time feed of crypto calls with live price and market cap as they happen"
};

type PageProps = {
  searchParams: Promise<{ hits?: string }>;
};

/** Milestone filters behind the All / 2x+ / 10x+ buttons. */
const HIT_FILTERS = [
  { key: "all", label: "All" },
  { key: "2x", label: "2x+" },
  { key: "10x", label: "10x+" },
] as const;

const CHIP_BASE =
  "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors";
const CHIP_ACTIVE = "border-cyan-400/40 bg-cyan-400/10 text-cyan-200";
const CHIP_IDLE =
  "border-white/12 bg-white/6 text-slate-300 hover:border-cyan-400/30 hover:text-white";

export default async function LivePage({ searchParams }: PageProps) {
  const params = await searchParams;

  const requestedHits = typeof params.hits === "string" ? params.hits : "all";
  const activeHits = HIT_FILTERS.some((filter) => filter.key === requestedHits)
    ? requestedHits
    : "all";

  // Fetch independently at their real limits — not capped by getDashboardSnapshot
  const [liveCalls, trendingTokens, sponsoredTokens] = await Promise.all([
    getLiveCalls(50),       // show up to 50 recent calls
    getTrendingTokens(10),  // top 10 hot tokens for the sidebar
    getSponsoredTokenPlacements("live_feed", 2),
  ]);

  const visibleCalls =
    activeHits === "2x"
      ? liveCalls.filter((call) => call.hit2x)
      : activeHits === "10x"
        ? liveCalls.filter((call) => call.hit10x)
        : liveCalls;

  // One shared price feed for the call cards and the sidebar. Symbols are sent
  // too so calls with a missing contract address still show a price.
  const marketQueries = [
    ...liveCalls.map((call) => ({
      address: call.contractAddress,
      symbol: call.tokenSymbol,
    })),
    ...trendingTokens.map((token) => ({
      address: token.contractAddress,
      symbol: token.symbol,
    })),
  ];

  const initialSnapshots = await getTokenMarketSnapshotsForTokens(marketQueries);

  const hitsHref = (key: string) => (key === "all" ? "/live" : "/live?hits=" + key);

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
            <Badge className="border-red-400/20 bg-red-400/10 text-red-200 animate-pulse">
              <Zap className="mr-1.5 size-3" />
              Live
            </Badge>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Live Feed</h1>
            <p className="mt-2 text-slate-400">
              {activeHits === "all"
                ? `${liveCalls.length} recent calls with live price, market cap and ROI tracking`
                : `${visibleCalls.length} of ${liveCalls.length} calls that hit ${activeHits}`}
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
          {/* ── Main call feed ── */}
          <Card className="border-white/8 bg-slate-950/70 lg:col-span-2">
            <CardContent className="p-6">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-3 w-3 animate-pulse items-center justify-center rounded-full bg-red-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">Recent Calls</h2>
                  <span className="text-sm text-slate-500">({visibleCalls.length} calls)</span>
                </div>

                {/* Milestone filters */}
                <div className="flex gap-2">
                  {HIT_FILTERS.map((filter) => (
                    <Link
                      key={filter.key}
                      href={hitsHref(filter.key)}
                      scroll={false}
                      className={`${CHIP_BASE} ${activeHits === filter.key ? CHIP_ACTIVE : CHIP_IDLE}`}
                    >
                      {filter.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {visibleCalls.length > 0 ? (
                  visibleCalls.map((call) => (
                    <div
                      key={call.id}
                      className="group relative overflow-hidden rounded-2xl border border-white/8 bg-slate-900/60 p-4 transition-all hover:border-cyan-400/30 hover:bg-slate-900/80"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="relative flex flex-wrap items-start justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <TokenAvatar
                            src={call.tokenLogoUrl}
                            symbol={call.tokenSymbol}
                            size={40}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/channels/${call.channelSlug}`}
                                className="text-sm text-cyan-300 hover:text-cyan-200 transition-colors"
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
                                <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">2x</Badge>
                              )}
                              {call.hit10x && (
                                <Badge className="border-yellow-400/20 bg-yellow-400/10 text-yellow-200">10x</Badge>
                              )}
                              {call.hit100x && (
                                <Badge className="border-red-400/20 bg-red-400/10 text-red-200">100x</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-6">
                          <LivePriceWithCap
                            address={call.contractAddress}
                            symbol={call.tokenSymbol}
                            fallbackPriceUsd={call.currentPriceUsd}
                          />
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Current ROI</div>
                            <div className={`text-2xl font-bold ${call.currentRoiPct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {formatPercent(call.currentRoiPct)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Peak Multiple</div>
                            <div className="text-xl font-bold text-white">
                              {formatMultiple(call.peakMultiple)}
                            </div>
                          </div>
                          <div className={`flex size-10 items-center justify-center rounded-xl ${call.currentRoiPct > 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                            {call.currentRoiPct > 0
                              ? <TrendingUp className="size-5 text-emerald-400" />
                              : <TrendingDown className="size-5 text-red-400" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                    <Radio className="mb-4 size-12 opacity-50" />
                    <p>
                      {activeHits === "all"
                        ? "No live calls at the moment"
                        : "No calls have hit " + activeHits + " yet"}
                    </p>
                    {activeHits === "all" ? (
                      <p className="mt-1 text-sm">Check back soon for new calls.</p>
                    ) : (
                      <Link href="/live" scroll={false} className="mt-1 text-sm text-cyan-400 hover:text-cyan-300">
                        Show all calls
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Sidebar ── */}
          <div className="space-y-4">
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <Flame className="size-5 text-orange-400" />
                  <h3 className="font-semibold text-white">Hot Tokens</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {trendingTokens.map((token, index) => (
                    <Link key={token.id} href={`/tokens?symbol=${token.symbol}`}>
                      <div className="flex items-center justify-between rounded-xl bg-white/5 p-3 hover:bg-white/8 transition-colors">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-bold text-slate-400">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-white">{token.symbol}</div>
                            <ChainIcon chain={token.chain} size={14} showLabel />
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <LivePriceCell
                            address={token.contractAddress}
                            symbol={token.symbol}
                            className="block text-sm font-medium text-white"
                          />
                          <LiveMarketCapCell
                            address={token.contractAddress}
                            symbol={token.symbol}
                            className="block text-xs text-slate-500"
                          />
                          <div className="text-xs text-slate-600">
                            {formatMultiple(token.bestMultiple)} · {token.totalCalls} calls
                          </div>
                        </div>
                      </div>
                    </Link>
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
                    <div className="text-xs text-slate-500">Calls Loaded</div>
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
    </LiveMarketProvider>
  );
}
