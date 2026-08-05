"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import type { TokenMarketSnapshot } from "@/lib/token-market";

type LiveTokenPriceProps = {
  address: string | null;
  fallbackPriceUsd: number | null;
  fallbackMarketCapUsd: number | null;
  refreshMs?: number;
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

function changeTone(value: number | null) {
  if (value === null) return "text-slate-500";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-slate-300";
}

export function LiveTokenPrice({
  address,
  fallbackPriceUsd,
  fallbackMarketCapUsd,
  refreshMs = 20_000,
}: LiveTokenPriceProps) {
  const [snapshot, setSnapshot] = useState<TokenMarketSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const previousPriceRef = useRef<number | null>(null);
  const [pulse, setPulse] = useState<"up" | "down" | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);

    try {
      const response = await fetch(
        "/api/tokens/live?addresses=" + encodeURIComponent(address),
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Live price request failed");

      const payload = (await response.json()) as { tokens?: Record<string, TokenMarketSnapshot> };
      const next = payload.tokens?.[address.toLowerCase()] ?? null;
      if (!next) return;

      const before = previousPriceRef.current;
      const after = next.priceUsd;
      if (before !== null && after !== null && after !== before) {
        setPulse(after > before ? "up" : "down");
        window.setTimeout(() => setPulse(null), 1_400);
      }
      previousPriceRef.current = after;

      setSnapshot(next);
    } catch {
      // Keep whatever we already have on screen.
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;

    void load();
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, refreshMs);

    return () => window.clearInterval(timer);
  }, [address, load, refreshMs]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const priceUsd = snapshot?.priceUsd ?? fallbackPriceUsd;
  const marketCapUsd = snapshot?.marketCapUsd ?? fallbackMarketCapUsd;
  const isLive = Boolean(snapshot && snapshot.priceUsd !== null);

  const secondsAgo =
    now === null || !snapshot
      ? null
      : Math.max(0, Math.round((now - new Date(snapshot.fetchedAt).getTime()) / 1000));

  return (
    <div className="min-w-[15rem] rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-right">
      <div className="flex items-center justify-end gap-2 text-xs uppercase tracking-widest text-slate-500">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Live price
          </span>
        ) : (
          <span>Last price</span>
        )}
        {isLoading && <RefreshCw className="size-3 animate-spin text-slate-500" />}
      </div>

      <div
        className={
          "mt-1 text-3xl font-semibold transition-colors duration-500 " +
          (pulse === "up" ? "text-emerald-300" : pulse === "down" ? "text-red-300" : "text-white")
        }
      >
        {formatPrice(priceUsd)}
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm text-slate-400">
        <span>MCap {formatCompactUsd(marketCapUsd)}</span>
        {snapshot?.change1h !== undefined && snapshot?.change1h !== null && (
          <span className={changeTone(snapshot.change1h)}>1h {formatChange(snapshot.change1h)}</span>
        )}
        {snapshot?.change24h !== undefined && snapshot?.change24h !== null && (
          <span className={changeTone(snapshot.change24h)}>
            24h {formatChange(snapshot.change24h)}
          </span>
        )}
      </div>

      {snapshot && (
        <div className="mt-2 space-y-0.5 text-xs text-slate-600">
          {snapshot.liquidityUsd !== null && (
            <div>Liquidity {formatCompactUsd(snapshot.liquidityUsd)}</div>
          )}
          {snapshot.volume24hUsd !== null && (
            <div>24h volume {formatCompactUsd(snapshot.volume24hUsd)}</div>
          )}
          {secondsAgo !== null && <div>Updated {secondsAgo}s ago</div>}
        </div>
      )}
    </div>
  );
}
