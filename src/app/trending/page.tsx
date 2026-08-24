import { Suspense } from "react";
import Link from "next/link";
import { TrendingUp, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getTrendingTokens, getSponsoredTokenPlacements } from "@/lib/dashboard-data";
import {
  findSnapshot,
  getTokenMarketSnapshotsForTokens,
  type TokenMarketSnapshotMap,
} from "@/lib/token-market";
import { chainBrandColor, chainLabel, normalizeChainKey } from "@/lib/chains";
import { formatMultiple, formatPercent } from "@/lib/metrics";
import { TrendingTokenChart } from "./token-chart";
import { TrendingControls, type SortOption } from "./trending-controls";
import { TokenAvatar } from "@/components/token-avatar";
import { ChainIcon } from "@/components/chain-icon";
import {
  LiveChangeCell,
  LiveMarketCapCell,
  LiveMarketProvider,
  LivePriceCell,
  LivePriceWithCap,
} from "@/components/tokens/live-market-cells";
import { SponsoredTokenCard } from "@/components/sponsored-placement-card";
import { siteConfig } from "@/config/site";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export const metadata = {
  title: `Trending Tokens | ${siteConfig.name}`,
  description: "Live prices, market caps and call activity for the hottest tokens across tracked channels"
};

type TrendingToken = Awaited<ReturnType<typeof getTrendingTokens>>[number];

type PageProps = {
  searchParams: Promise<{ chain?: string; sort?: string; dir?: string }>;
};

/** Sort keys offered by the Sort button. The first entry is the default. */
const SORT_OPTIONS: SortOption[] = [
  { key: "channels", label: "Channels" },
  { key: "calls", label: "Total calls" },
  { key: "marketCap", label: "Market cap" },
  { key: "price", label: "Price" },
  { key: "change24h", label: "24h change" },
  { key: "roi", label: "Average ROI" },
  { key: "best", label: "Best multiple" },
  { key: "recent", label: "Last called" },
];

const DEFAULT_SORT = SORT_OPTIONS[0].key;

/** Value a token is ranked by. Null sorts to the bottom in both directions. */
function sortValue(
  token: TrendingToken,
  key: string,
  snapshots: TokenMarketSnapshotMap
): number | null {
  const snapshot = findSnapshot(snapshots, token.contractAddress, token.symbol);

  switch (key) {
    case "calls":
      return token.totalCalls;
    case "roi":
      return token.averageRoiPct;
    case "best":
      return token.bestMultiple;
    case "price":
      return snapshot?.priceUsd ?? null;
    case "marketCap":
      return snapshot?.marketCapUsd ?? null;
    case "change24h":
      return snapshot?.change24h ?? null;
    case "recent":
      return token.lastCalledAt ? new Date(token.lastCalledAt).getTime() : null;
    case "channels":
    default:
      return token.uniqueChannels;
  }
}

// Chain call breakdown — computed from real data, not hardcoded
function getChainBreakdown(tokens: TrendingToken[]) {
  const chainMap = new Map<string, number>();
  for (const t of tokens) {
    chainMap.set(t.chain, (chainMap.get(t.chain) ?? 0) + t.totalCalls);
  }
  return Array.from(chainMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([chain, calls]) => ({ chain, calls }));
}

export default async function TrendingPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Fetch all trending tokens directly — not capped at 6 like getDashboardSnapshot
  const [tokens, sponsoredTokens] = await Promise.all([
    getTrendingTokens(100, "unique_channels"),
    getSponsoredTokenPlacements("trending", 2),
  ]);

  // Symbols are sent alongside addresses so tokens with a missing or wrong
  // contract address still get a live price.
  const marketQueries = tokens.map((token) => ({
    address: token.contractAddress,
    symbol: token.symbol,
  }));

  // Seed the first paint so prices are never blank before the first poll.
  const initialSnapshots = await getTokenMarketSnapshotsForTokens(marketQueries);

  // ── Filter and sort state, read from the URL ────────────────────────
  const chainOptionMap = new Map<string, { key: string; label: string; count: number }>();
  for (const token of tokens) {
    const key = normalizeChainKey(token.chain);
    if (key === "") continue;

    const existing = chainOptionMap.get(key);
    if (existing) existing.count += 1;
    else chainOptionMap.set(key, { key, label: chainLabel(token.chain), count: 1 });
  }
  const chainOptions = Array.from(chainOptionMap.values()).sort((a, b) => b.count - a.count);

  const requestedChain = normalizeChainKey(params.chain);
  const activeChain = chainOptionMap.has(requestedChain) ? requestedChain : null;

  const requestedSort = typeof params.sort === "string" ? params.sort : "";
  const activeSort = SORT_OPTIONS.some((option) => option.key === requestedSort)
    ? requestedSort
    : DEFAULT_SORT;
  const activeDir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";

  const filteredTokens = activeChain
    ? tokens.filter((token) => normalizeChainKey(token.chain) === activeChain)
    : tokens;

  const visibleTokens = [...filteredTokens].sort((left, right) => {
    const leftValue = sortValue(left, activeSort, initialSnapshots);
    const rightValue = sortValue(right, activeSort, initialSnapshots);

    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;

    return activeDir === "asc" ? leftValue - rightValue : rightValue - leftValue;
  });

  // "Most covered" always means most channels, regardless of the sort choice.
  const topGainer =
    [...filteredTokens].sort((a, b) => b.uniqueChannels - a.uniqueChannels)[0] ?? null;

  // The breakdown stays global so it can be used to switch between chains.
  const chainBreakdown = getChainBreakdown(tokens);

  const chainHref = (key: string | null) => {
    const next = new URLSearchParams();
    if (key) next.set("chain", key);
    if (activeSort !== DEFAULT_SORT) next.set("sort", activeSort);
    if (activeDir !== "desc") next.set("dir", activeDir);

    const queryString = next.toString();
    return queryString === "" ? "/trending" : "/trending?" + queryString;
  };

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
            <Badge className="border-orange-400/20 bg-orange-400/10 text-orange-200">
              <Flame className="mr-1.5 size-3" />
              Hot right now
            </Badge>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Trending Tokens</h1>
            <p className="mt-2 text-slate-400">
              {activeChain
                ? `${visibleTokens.length} of ${tokens.length} tokens on ${chainLabel(activeChain)}`
                : `${tokens.length} tokens tracked across all channels, with live price and market cap`}
            </p>
          </div>

          <Suspense fallback={<div className="h-9 w-40 animate-pulse rounded-full bg-white/5" />}>
            <TrendingControls
              chains={chainOptions}
              sorts={SORT_OPTIONS}
              activeChain={activeChain}
              activeSort={activeSort}
              activeDir={activeDir}
            />
          </Suspense>
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
                <TrendingTokenChart tokens={visibleTokens.slice(0, 20)} />
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
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <TokenAvatar src={topGainer.logoUrl} symbol={topGainer.symbol} size={36} />
                          <div>
                            <div className="text-2xl font-bold text-white">{topGainer.symbol}</div>
                            <ChainIcon chain={topGainer.chain} size={14} showLabel />
                          </div>
                        </div>
                        <LivePriceWithCap
                          address={topGainer.contractAddress}
                          symbol={topGainer.symbol}
                        />
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

            {/* Real chain breakdown — each row filters the table */}
            <Card className="border-white/8 bg-slate-950/70">
              <CardContent className="p-5">
                <h3 className="font-semibold text-white">By Chain</h3>
                <p className="mt-1 text-xs text-slate-500">Tap a chain to filter</p>
                <div className="mt-4 space-y-2">
                  {chainBreakdown.map((item) => {
                    const key = normalizeChainKey(item.chain);
                    const isActive = key === activeChain;

                    return (
                      <Link
                        key={item.chain}
                        href={chainHref(isActive ? null : key)}
                        scroll={false}
                        className={`flex items-center justify-between rounded-xl px-2 py-1.5 transition-colors ${isActive ? "bg-cyan-400/10 ring-1 ring-cyan-400/30" : "hover:bg-white/5"}`}
                      >
                        <ChainIcon chain={item.chain} size={20} showLabel />
                        <span
                          className="text-sm font-medium"
                          style={{ color: chainBrandColor(item.chain) }}
                        >
                          {item.calls} calls
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Full tokens table */}
        <Card className="border-white/8 bg-slate-950/70">
          <CardContent className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">
                {activeChain ? `${chainLabel(activeChain)} Tokens` : `All ${tokens.length} Trending Tokens`}
              </h2>
              <p className="text-xs text-slate-500">
                Showing {visibleTokens.length} of {tokens.length} · sorted by{" "}
                {(SORT_OPTIONS.find((option) => option.key === activeSort)?.label ?? "").toLowerCase()}
              </p>
            </div>

            {visibleTokens.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                No tokens match this filter.{" "}
                <Link href="/trending" className="text-cyan-400 hover:text-cyan-300">
                  Clear it
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-0 table-fixed sm:min-w-[1100px]">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03]">
                      {["#", "Token", "Chain", "Price", "24h", "Market Cap", "Calls", "Channels", "Avg ROI", "Best Multiple", "Last Called"].map((h) => {
                        const hiddenOnMobile = ["Chain", "Market Cap", "Calls", "Channels", "Best Multiple", "Last Called"].includes(h);
                        return (
                        <th key={h} className={`${hiddenOnMobile ? "hidden sm:table-cell" : ""} px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 ${h === "#" || h === "Token" || h === "Chain" ? "text-left" : "text-right"}`}>
                          {h}
                        </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTokens.map((token, index) => (
                      <tr key={token.id} className="border-b border-white/[0.07] transition-colors hover:bg-cyan-400/[0.045]">
                        <td className="px-3 py-3 first:pl-4">
                          <span className={`inline-flex size-6 items-center justify-center text-xs font-bold ${index < 3 ? "text-yellow-300" : "text-slate-400"}`}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Link href={`/tokens?symbol=${token.symbol}`} className="group">
                            <div className="flex items-center gap-3">
                              <TokenAvatar src={token.logoUrl} symbol={token.symbol} size={32} />
                              <div>
                                <div className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                                  {token.symbol}
                                </div>
                                {token.name && <div className="text-xs text-slate-500">{token.name}</div>}
                              </div>
                            </div>
                          </Link>
                          <details className="mt-2 sm:hidden">
                            <summary className="cursor-pointer text-xs text-cyan-300 marker:text-slate-600">More token data</summary>
                            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <div><dt className="text-slate-500">Chain</dt><dd className="text-slate-300">{token.chain}</dd></div>
                              <div><dt className="text-slate-500">Calls</dt><dd className="text-slate-300">{token.totalCalls}</dd></div>
                              <div><dt className="text-slate-500">Channels</dt><dd className="text-slate-300">{token.uniqueChannels}</dd></div>
                              <div><dt className="text-slate-500">Market cap</dt><dd className="text-slate-300"><LiveMarketCapCell address={token.contractAddress} symbol={token.symbol} /></dd></div>
                              <div><dt className="text-slate-500">Best multiple</dt><dd className="text-slate-300">{formatMultiple(token.bestMultiple)}</dd></div>
                              <div><dt className="text-slate-500">Last called</dt><dd className="text-slate-300">{token.lastCalledAt ? new Date(token.lastCalledAt).toLocaleDateString() : "—"}</dd></div>
                            </dl>
                          </details>
                        </td>
                        <td className="hidden px-3 py-3 sm:table-cell">
                          <Link href={chainHref(normalizeChainKey(token.chain))} scroll={false}>
                            <ChainIcon chain={token.chain} size={20} showLabel />
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          <LivePriceCell
                            address={token.contractAddress}
                            symbol={token.symbol}
                            className="font-medium text-white"
                          />
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          <LiveChangeCell
                            address={token.contractAddress}
                            symbol={token.symbol}
                            className="font-medium"
                          />
                        </td>
                        <td className="hidden px-3 py-3 text-right font-mono tabular-nums sm:table-cell">
                          <LiveMarketCapCell
                            address={token.contractAddress}
                            symbol={token.symbol}
                            className="text-white"
                          />
                        </td>
                        <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-white sm:table-cell">{token.totalCalls}</td>
                        <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-white sm:table-cell">{token.uniqueChannels}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          <span className={`font-semibold ${token.averageRoiPct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {formatPercent(token.averageRoiPct)}
                          </span>
                        </td>
                        <td className="hidden px-3 py-3 text-right font-mono tabular-nums font-semibold text-white sm:table-cell">{formatMultiple(token.bestMultiple)}</td>
                        <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-sm text-slate-500 sm:table-cell">
                          {token.lastCalledAt ? new Date(token.lastCalledAt).toLocaleDateString() : "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </LiveMarketProvider>
  );
}
