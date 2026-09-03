"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Flame,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { ChainIcon } from "@/components/chain-icon";
import { TokenAvatar } from "@/components/token-avatar";
import {
  findSnapshot,
  snapshotKey,
  symbolKey,
  type TokenMarketQuery,
  type TokenMarketSnapshot,
} from "@/lib/token-market";
import type { TokenMarketRow } from "@/lib/tokens-data";

type SnapshotMap = Record<string, TokenMarketSnapshot>;

type TokenMarketProps = {
  tokens: TokenMarketRow[];
  initialSnapshots: SnapshotMap;
  initialFetchedAt: string;
  initialQuery?: string;
  refreshMs?: number;
};

type MarketRow = TokenMarketRow & {
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  change1h: number | null;
  change24h: number | null;
  pairUrl: string | null;
  isLive: boolean;
};

type SortKey =
  | "symbol"
  | "price"
  | "change1h"
  | "change24h"
  | "marketCap"
  | "volume"
  | "liquidity"
  | "calls"
  | "channels"
  | "roi"
  | "best";

const NUMERIC_ACCESSORS: Record<
  Exclude<SortKey, "symbol">,
  (row: MarketRow) => number | null
> = {
  price: (row) => row.priceUsd,
  change1h: (row) => row.change1h,
  change24h: (row) => row.change24h,
  marketCap: (row) => row.marketCapUsd,
  volume: (row) => row.volume24hUsd,
  liquidity: (row) => row.liquidityUsd,
  calls: (row) => row.totalCalls,
  channels: (row) => row.uniqueChannels,
  roi: (row) => row.averageRoiPct,
  best: (row) => row.bestMultiple,
};

function formatPrice(value: number | null) {
  if (value === null) return "\u2014";
  if (value === 0) return "$0";

  const abs = Math.abs(value);
  if (abs >= 1) {
    return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (abs >= 0.01) return "$" + value.toFixed(4);
  if (abs >= 0.000001) return "$" + value.toFixed(8);
  return "$" + value.toExponential(2);
}

function formatCompactUsd(value: number | null) {
  if (value === null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatChange(value: number | null) {
  if (value === null) return "\u2014";
  return (value >= 0 ? "+" : "") + value.toFixed(2) + "%";
}

function formatRoi(value: number) {
  return (value >= 0 ? "+" : "") + value.toFixed(1) + "%";
}

function formatMultiple(value: number) {
  return value.toFixed(value >= 10 ? 1 : 2) + "x";
}

function changeTone(value: number | null) {
  if (value === null) return "text-slate-500";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-slate-300";
}

function tokenHref(row: TokenMarketRow) {
  return row.contractAddress
    ? "/tokens/" + encodeURIComponent(row.contractAddress)
    : "/tokens?symbol=" + encodeURIComponent(row.symbol);
}

export function TokenMarket({
  tokens,
  initialSnapshots,
  initialFetchedAt,
  initialQuery = "",
  refreshMs = 30_000,
}: TokenMarketProps) {
  const [snapshots, setSnapshots] = useState<SnapshotMap>(initialSnapshots);
  const [fetchedAt, setFetchedAt] = useState(initialFetchedAt);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDesc, setSortDesc] = useState(true);
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});
  const [now, setNow] = useState(() => Date.now());

  const snapshotsRef = useRef<SnapshotMap>(initialSnapshots);
  const flashTimerRef = useRef<number | null>(null);

  // Send the symbol alongside the address so tokens with a missing or wrong
  // contract address still get priced by ticker.
  const marketQueries = useMemo<TokenMarketQuery[]>(
    () =>
      tokens
        .map((token) => ({
          address: token.contractAddress ?? null,
          symbol: token.symbol ?? null,
        }))
        .filter((entry) => Boolean(entry.address) || Boolean(entry.symbol)),
    [tokens]
  );

  const queryKey = useMemo(
    () => marketQueries.map((entry) => (entry.address ?? "") + "|" + (entry.symbol ?? "")).join(","),
    [marketQueries]
  );

  const refresh = useCallback(
    async (silent: boolean) => {
      if (marketQueries.length === 0) return;
      if (!silent) setIsRefreshing(true);

      try {
        const response = await fetch("/api/tokens/live", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tokens: marketQueries }),
          cache: "no-store",
        });

        if (!response.ok) throw new Error("Live price request failed");

        const payload = (await response.json()) as {
          tokens?: SnapshotMap;
          fetchedAt?: string;
        };
        const incoming = payload.tokens ?? {};
        const previous = snapshotsRef.current;

        const changed: Record<string, "up" | "down"> = {};
        for (const [key, snapshot] of Object.entries(incoming)) {
          const before = previous[key]?.priceUsd ?? null;
          const after = snapshot.priceUsd ?? null;
          if (before === null || after === null || before === after) continue;
          changed[key] = after > before ? "up" : "down";
        }

        const merged = { ...previous, ...incoming };
        snapshotsRef.current = merged;
        setSnapshots(merged);
        setFetchedAt(payload.fetchedAt ?? new Date().toISOString());
        setHasError(false);

        if (Object.keys(changed).length > 0) {
          setFlash(changed);
          if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
          flashTimerRef.current = window.setTimeout(() => setFlash({}), 1_400);
        }
      } catch {
        setHasError(true);
      } finally {
        if (!silent) setIsRefreshing(false);
      }
    },
    [marketQueries]
  );

  // Poll for fresh prices, pausing while the tab is in the background.
  useEffect(() => {
    if (queryKey === "") return;

    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh(true);
    }, refreshMs);

    return () => window.clearInterval(timer);
  }, [queryKey, refresh, refreshMs]);

  // Catch up immediately when the visitor comes back to the tab.
  useEffect(() => {
    if (queryKey === "") return;

    const handleVisibility = () => {
      if (!document.hidden) void refresh(true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [queryKey, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    },
    []
  );

  const rows = useMemo<MarketRow[]>(
    () =>
      tokens.map((token) => {
        const snapshot = findSnapshot(snapshots, token.contractAddress, token.symbol);

        return {
          ...token,
          priceUsd: snapshot?.priceUsd ?? token.lastPriceUsd,
          marketCapUsd: snapshot?.marketCapUsd ?? token.lastMarketCapUsd,
          volume24hUsd: snapshot?.volume24hUsd ?? null,
          liquidityUsd: snapshot?.liquidityUsd ?? null,
          change1h: snapshot?.change1h ?? null,
          change24h: snapshot?.change24h ?? null,
          pairUrl: snapshot?.pairUrl ?? null,
          isLive: Boolean(snapshot && snapshot.priceUsd !== null),
        };
      }),
    [snapshots, tokens]
  );

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered =
      term === ""
        ? rows
        : rows.filter((row) =>
            [row.symbol, row.name ?? "", row.chain, row.contractAddress ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(term)
          );

    return [...filtered].sort((left, right) => {
      if (sortKey === "symbol") {
        const byName = left.symbol.localeCompare(right.symbol);
        return sortDesc ? -byName : byName;
      }

      const accessor = NUMERIC_ACCESSORS[sortKey];
      const leftValue = accessor(left);
      const rightValue = accessor(right);

      // Unknown values always sink to the bottom, whichever way we sort.
      if (leftValue === null && rightValue === null) return 0;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;

      return sortDesc ? rightValue - leftValue : leftValue - rightValue;
    });
  }, [query, rows, sortDesc, sortKey]);

  const liveRows = useMemo(() => rows.filter((row) => row.change24h !== null), [rows]);

  const gainers = useMemo(
    () =>
      [...liveRows]
        .filter((row) => (row.change24h ?? 0) > 0)
        .sort((left, right) => (right.change24h ?? 0) - (left.change24h ?? 0))
        .slice(0, 5),
    [liveRows]
  );

  const losers = useMemo(
    () =>
      [...liveRows]
        .filter((row) => (row.change24h ?? 0) < 0)
        .sort((left, right) => (left.change24h ?? 0) - (right.change24h ?? 0))
        .slice(0, 5),
    [liveRows]
  );

  const livePriceCount = rows.filter((row) => row.isLive).length;
  const combinedMarketCap = rows.reduce((total, row) => total + (row.marketCapUsd ?? 0), 0);
  const combined24hVolume = rows.reduce((total, row) => total + (row.volume24hUsd ?? 0), 0);

  const secondsAgo = Math.max(
    0,
    Math.round((now - new Date(fetchedAt).getTime()) / 1000)
  );

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDesc((previous) => !previous);
      return;
    }
    setSortKey(key);
    setSortDesc(key !== "symbol");
  };

  const sortIndicator = (key: SortKey) => {
    if (key !== sortKey) return null;
    return sortDesc ? (
      <ArrowDownRight className="size-3" />
    ) : (
      <ArrowUpRight className="size-3" />
    );
  };

  const headerButton = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <th
      key={key}
      className={
        "pb-4 text-xs font-medium uppercase tracking-wider text-slate-500 " +
        (align === "left" ? "text-left" : "text-right")
      }
    >
      <button
        type="button"
        onClick={() => handleSort(key)}
        className={
          "inline-flex items-center gap-1 transition-colors hover:text-slate-300 " +
          (key === sortKey ? "text-cyan-300" : "")
        }
      >
        {label}
        {sortIndicator(key)}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Live status + search */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-slate-950/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Live prices
          </span>
          <span className="text-slate-400">
            {livePriceCount} of {rows.length} tokens streaming
          </span>
          <span className="text-slate-600">
            {hasError
              ? "Last refresh failed \u2014 retrying"
              : secondsAgo === null
                ? "Updating\u2026"
                : "Updated " + secondsAgo + "s ago"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search symbol, name or address"
              className="w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/20"
            />
          </div>
          <button
            type="button"
            onClick={() => void refresh(false)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-white"
            aria-label="Refresh prices"
          >
            <RefreshCw className={"size-4 " + (isRefreshing ? "animate-spin" : "")} />
          </button>
        </div>
      </div>

      {/* Market stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Activity,
            label: "Tokens tracked",
            value: String(rows.length),
            tone: "text-white",
          },
          {
            icon: Flame,
            label: "Combined market cap",
            value: combinedMarketCap > 0 ? formatCompactUsd(combinedMarketCap) : "\u2014",
            tone: "text-white",
          },
          {
            icon: TrendingUp,
            label: "24h gainers",
            value: String(liveRows.filter((row) => (row.change24h ?? 0) > 0).length),
            tone: "text-emerald-400",
          },
          {
            icon: TrendingDown,
            label: "24h losers",
            value: String(liveRows.filter((row) => (row.change24h ?? 0) < 0).length),
            tone: "text-red-400",
          },
        ].map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-slate-500">
              <Icon className="size-4" />
              <span className="text-xs uppercase tracking-wider">{label}</span>
            </div>
            <div className={"mt-3 text-3xl font-bold " + tone}>{value}</div>
          </div>
        ))}
      </div>

      {/* Gainers and losers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MoverPanel
          title="Top 24h gainers"
          icon={TrendingUp}
          accent="text-emerald-400"
          rows={gainers}
          emptyLabel={
            livePriceCount === 0
              ? "Waiting for live market data\u2026"
              : "No tracked token is up over the last 24h."
          }
        />
        <MoverPanel
          title="Top 24h losers"
          icon={TrendingDown}
          accent="text-red-400"
          rows={losers}
          emptyLabel={
            livePriceCount === 0
              ? "Waiting for live market data\u2026"
              : "No tracked token is down over the last 24h."
          }
        />
      </div>

      {/* Full market table */}
      <div className="rounded-2xl border border-white/8 bg-slate-950/70 p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">
            {query.trim() === ""
              ? "All " + rows.length + " tracked tokens"
              : visibleRows.length + " of " + rows.length + " tokens match"}
          </h3>
          <p className="text-xs text-slate-500">
            {"Prices, market caps and 24h moves from DexScreener \u00b7 24h volume " +
              formatCompactUsd(combined24hVolume)}
          </p>
        </div>

        {visibleRows.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            No tokens match that search yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1024px]">
              <thead>
                <tr className="border-b border-white/8">
                  {headerButton("symbol", "Token", "left")}
                  <th className="pb-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Chain
                  </th>
                  {headerButton("price", "Price")}
                  {headerButton("change1h", "1h")}
                  {headerButton("change24h", "24h")}
                  {headerButton("marketCap", "Market cap")}
                  {headerButton("volume", "24h vol")}
                  {headerButton("liquidity", "Liquidity")}
                  {headerButton("calls", "Calls")}
                  {headerButton("channels", "Channels")}
                  {headerButton("roi", "Avg ROI")}
                  {headerButton("best", "Best")}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const pulse =
                    flash[snapshotKey(row.contractAddress)] ?? flash[symbolKey(row.symbol)];

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/5"
                    >
                      <td className="py-4">
                        <Link href={tokenHref(row)} className="group flex items-center gap-3">
                          <TokenAvatar src={row.logoUrl} symbol={row.symbol} size={32} />
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold text-white transition-colors group-hover:text-purple-300">
                              {row.symbol}
                              {row.isLive && (
                                <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
                              )}
                            </div>
                            {row.name && <div className="text-xs text-slate-500">{row.name}</div>}
                          </div>
                        </Link>
                      </td>
                      <td className="py-4">
                        <ChainIcon chain={row.chain} size={20} showLabel />
                      </td>
                      <td
                        className={
                          "py-4 text-right font-medium transition-colors duration-500 " +
                          (pulse === "up"
                            ? "text-emerald-300"
                            : pulse === "down"
                              ? "text-red-300"
                              : "text-white")
                        }
                      >
                        {formatPrice(row.priceUsd)}
                      </td>
                      <td className={"py-4 text-right " + changeTone(row.change1h)}>
                        {formatChange(row.change1h)}
                      </td>
                      <td className={"py-4 text-right font-medium " + changeTone(row.change24h)}>
                        {formatChange(row.change24h)}
                      </td>
                      <td className="py-4 text-right text-white">
                        {formatCompactUsd(row.marketCapUsd)}
                      </td>
                      <td className="py-4 text-right text-slate-300">
                        {formatCompactUsd(row.volume24hUsd)}
                      </td>
                      <td className="py-4 text-right text-slate-300">
                        {formatCompactUsd(row.liquidityUsd)}
                      </td>
                      <td className="py-4 text-right text-white">{row.totalCalls}</td>
                      <td className="py-4 text-right text-white">{row.uniqueChannels}</td>
                      <td
                        className={
                          "py-4 text-right font-medium " +
                          (row.averageRoiPct > 0 ? "text-emerald-400" : "text-red-400")
                        }
                      >
                        {formatRoi(row.averageRoiPct)}
                      </td>
                      <td className="py-4 text-right font-medium text-purple-300">
                        {formatMultiple(row.bestMultiple)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

type MoverPanelProps = {
  title: string;
  icon: typeof TrendingUp;
  accent: string;
  rows: MarketRow[];
  emptyLabel: string;
};

function MoverPanel({ title, icon: Icon, accent, rows, emptyLabel }: MoverPanelProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/70 p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
          <Icon className={"size-4 " + accent} />
          {title}
        </h3>
        <span className="text-xs text-slate-600">24h change</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-1">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={tokenHref(row)}
                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <TokenAvatar src={row.logoUrl} symbol={row.symbol} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-white">{row.symbol}</span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <ChainIcon chain={row.chain} size={14} />
                      <span className="truncate">{row.name ?? row.chain}</span>
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm text-white">{formatPrice(row.priceUsd)}</span>
                  <span className={"block text-xs font-medium " + changeTone(row.change24h)}>
                    {formatChange(row.change24h)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <p className="mt-3 flex items-center gap-1 text-xs text-slate-600">
          <ExternalLink className="size-3" />
          Tap a token for every call it received
        </p>
      )}
    </div>
  );
}
