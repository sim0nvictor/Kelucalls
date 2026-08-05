"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  findSnapshot,
  type TokenMarketQuery,
  type TokenMarketSnapshot,
} from "@/lib/token-market";

type SnapshotMap = Record<string, TokenMarketSnapshot>;

const LiveMarketContext = createContext<SnapshotMap>({});

export function formatPrice(value: number | null) {
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

export function formatCompactUsd(value: number | null) {
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

function changeTone(value: number | null) {
  if (value === null) return "text-slate-500";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-slate-300";
}

type LiveMarketProviderProps = {
  /** Every token on the page. Symbols let us price tokens with no address. */
  tokens: TokenMarketQuery[];
  initialSnapshots?: SnapshotMap;
  refreshMs?: number;
  children: ReactNode;
};

/**
 * Polls /api/tokens/live once for the whole page and shares the result with
 * every price / market cap cell below it, so a 50 row feed makes one request
 * per refresh instead of fifty.
 */
export function LiveMarketProvider({
  tokens,
  initialSnapshots = {},
  refreshMs = 30_000,
  children,
}: LiveMarketProviderProps) {
  const [snapshots, setSnapshots] = useState<SnapshotMap>(initialSnapshots);
  const snapshotsRef = useRef<SnapshotMap>(initialSnapshots);

  const queries = useMemo(
    () =>
      tokens.filter((entry) => Boolean(entry?.address) || Boolean(entry?.symbol)),
    [tokens]
  );

  const queryKey = useMemo(
    () => queries.map((entry) => (entry.address ?? "") + "|" + (entry.symbol ?? "")).join(","),
    [queries]
  );

  const load = useCallback(async () => {
    if (queries.length === 0) return;

    try {
      const response = await fetch("/api/tokens/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokens: queries }),
        cache: "no-store",
      });

      if (!response.ok) throw new Error("Live price request failed");

      const payload = (await response.json()) as { tokens?: SnapshotMap };
      const incoming = payload.tokens ?? {};

      const merged = { ...snapshotsRef.current, ...incoming };
      snapshotsRef.current = merged;
      setSnapshots(merged);
    } catch {
      // Keep the last known values on screen.
    }
  }, [queries]);

  useEffect(() => {
    if (queryKey === "") return;

    void load();
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, refreshMs);

    return () => window.clearInterval(timer);
  }, [queryKey, load, refreshMs]);

  useEffect(() => {
    if (queryKey === "") return;

    const handleVisibility = () => {
      if (!document.hidden) void load();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [queryKey, load]);

  return (
    <LiveMarketContext.Provider value={snapshots}>{children}</LiveMarketContext.Provider>
  );
}

/** Reads the live snapshot for one token, by address or ticker symbol. */
export function useLiveSnapshot(
  address: string | null | undefined,
  symbol: string | null | undefined
) {
  const snapshots = useContext(LiveMarketContext);
  return findSnapshot(snapshots, address, symbol);
}

type CellProps = {
  address: string | null | undefined;
  symbol: string | null | undefined;
  className?: string;
};

/** Live price, falling back to the last stored price. */
export function LivePriceCell({
  address,
  symbol,
  fallbackPriceUsd = null,
  className = "",
}: CellProps & { fallbackPriceUsd?: number | null }) {
  const snapshot = useLiveSnapshot(address, symbol);
  const value = snapshot?.priceUsd ?? fallbackPriceUsd;

  return <span className={className}>{formatPrice(value)}</span>;
}

/** Live market cap, falling back to the last stored market cap. */
export function LiveMarketCapCell({
  address,
  symbol,
  fallbackMarketCapUsd = null,
  className = "",
}: CellProps & { fallbackMarketCapUsd?: number | null }) {
  const snapshot = useLiveSnapshot(address, symbol);
  const value = snapshot?.marketCapUsd ?? fallbackMarketCapUsd;

  return <span className={className}>{formatCompactUsd(value)}</span>;
}

/** 24h (or 1h) change, tinted green or red. */
export function LiveChangeCell({
  address,
  symbol,
  window: changeWindow = "24h",
  className = "",
}: CellProps & { window?: "1h" | "24h" }) {
  const snapshot = useLiveSnapshot(address, symbol);
  const value = changeWindow === "1h" ? (snapshot?.change1h ?? null) : (snapshot?.change24h ?? null);

  return (
    <span className={(changeTone(value) + " " + className).trim()}>{formatChange(value)}</span>
  );
}

/**
 * Stacked price + market cap, used on the live feed cards and the trending
 * sidebar where a full table column would not fit.
 */
export function LivePriceWithCap({
  address,
  symbol,
  fallbackPriceUsd = null,
  fallbackMarketCapUsd = null,
  align = "right",
}: CellProps & {
  fallbackPriceUsd?: number | null;
  fallbackMarketCapUsd?: number | null;
  align?: "left" | "right";
}) {
  const snapshot = useLiveSnapshot(address, symbol);
  const price = snapshot?.priceUsd ?? fallbackPriceUsd;
  const marketCap = snapshot?.marketCapUsd ?? fallbackMarketCapUsd;
  const isLive = Boolean(snapshot && snapshot.priceUsd !== null);

  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {align === "left" && isLive && (
          <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
        )}
        <span>Price</span>
        {align === "right" && isLive && (
          <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
        )}
      </div>
      <div className="text-lg font-semibold text-white">{formatPrice(price)}</div>
      <div className="text-xs text-slate-500">MCap {formatCompactUsd(marketCap)}</div>
    </div>
  );
}
