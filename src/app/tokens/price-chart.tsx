"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { OhlcvCandle, OhlcvFailureReason, OhlcvTimeframe } from "@/lib/tokens/ohlcv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChartFailureReason = OhlcvFailureReason | "missing_address" | "network_error";

type OhlcvApiSuccess = {
  chain: string;
  network: string;
  address: string;
  timeframe: OhlcvTimeframe;
  poolAddress: string | null;
  source: string;
  candles: OhlcvCandle[];
};

type OhlcvApiError = { error?: { reason?: string; message?: string } };

type ChartState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; candles: OhlcvCandle[] }
  | { status: "error"; reason: ChartFailureReason; message: string };

type TimeframeOption = { value: OhlcvTimeframe; label: string };

const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { value: "1H", label: "1H" },
  { value: "24H", label: "24H" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
];

const DEFAULT_TIMEFRAME: OhlcvTimeframe = "24H";

// ---------------------------------------------------------------------------
// Formatting utilities
// ---------------------------------------------------------------------------

export function formatUsdPrice(value: number | string | undefined | null): string {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return "—";
  if (parsed === 0) return "$0";
  if (Math.abs(parsed) < 0.000001) return `$${parsed.toExponential(2)}`;
  if (Math.abs(parsed) < 1) return `$${parsed.toPrecision(4)}`;
  return `$${parsed.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatTimestamp(unixSeconds: number, timeframe: OhlcvTimeframe): string {
  const date = new Date(unixSeconds * 1000);
  if (timeframe === "1H" || timeframe === "24H") {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ---------------------------------------------------------------------------
// Data layer: cached + deduplicated fetching against our own API only
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

const candleCache = new Map<string, { expiresAt: number; candles: OhlcvCandle[] }>();
const inFlightRequests = new Map<string, Promise<OhlcvCandle[]>>();

class OhlcvRequestError extends Error {
  constructor(readonly reason: ChartFailureReason, message: string) {
    super(message);
    this.name = "OhlcvRequestError";
  }
}

function cacheKey(chain: string, address: string, timeframe: OhlcvTimeframe) {
  return `${chain.toLowerCase()}|${address.toLowerCase()}|${timeframe}`;
}

async function requestCandles(
  chain: string,
  address: string,
  timeframe: OhlcvTimeframe,
  signal: AbortSignal
): Promise<OhlcvCandle[]> {
  const url =
    `/api/tokens/ohlcv?chain=${encodeURIComponent(chain)}` +
    `&address=${encodeURIComponent(address)}` +
    `&timeframe=${encodeURIComponent(timeframe)}`;

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new OhlcvRequestError("network_error", "Unable to reach the price service.");
  }

  if (!response.ok) {
    let payload: OhlcvApiError = {};
    try {
      payload = (await response.json()) as OhlcvApiError;
    } catch {
      // Ignore — fall back to a generic message below.
    }

    const reason = (payload.error?.reason ?? "upstream_error") as ChartFailureReason;
    const message = payload.error?.message ?? "Unable to load price history.";
    throw new OhlcvRequestError(reason, message);
  }

  const payload = (await response.json()) as OhlcvApiSuccess;
  return Array.isArray(payload.candles) ? payload.candles : [];
}

/**
 * Loads candles with an in-memory TTL cache and in-flight deduplication so
 * remounts / rapid timeframe toggles never fire duplicate network requests.
 */
function loadCandles(
  chain: string,
  address: string,
  timeframe: OhlcvTimeframe,
  options: { force: boolean; signal: AbortSignal }
): { promise: Promise<OhlcvCandle[]>; owned: boolean } {
  const key = cacheKey(chain, address, timeframe);

  if (options.force) {
    candleCache.delete(key);
    inFlightRequests.delete(key);
  } else {
    const cached = candleCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { promise: Promise.resolve(cached.candles), owned: false };
    }

    const existing = inFlightRequests.get(key);
    if (existing) {
      return { promise: existing, owned: false };
    }
  }

  const promise = requestCandles(chain, address, timeframe, options.signal)
    .then((candles) => {
      candleCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, candles });
      return candles;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, promise);
  return { promise, owned: true };
}

function useTokenOhlcv(
  chain: string | null | undefined,
  contractAddress: string | null | undefined,
  timeframe: OhlcvTimeframe
) {
  const [state, setState] = useState<ChartState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const reloadKeyRef = useRef(reloadKey);
  reloadKeyRef.current = reloadKey;

  useEffect(() => {
    const trimmedChain = chain?.trim() ?? "";
    const trimmedAddress = contractAddress?.trim() ?? "";

    // Never fetch without an address.
    if (!trimmedChain || !trimmedAddress) {
      setState({
        status: "error",
        reason: "missing_address",
        message: "No contract address on record for this token yet.",
      });
      return;
    }

    const controller = new AbortController();
    let active = true;

    setState({ status: "loading" });

    const { promise, owned } = loadCandles(trimmedChain, trimmedAddress, timeframe, {
      force: reloadKeyRef.current > 0,
      signal: controller.signal,
    });

    promise
      .then((candles) => {
        if (!active) return;
        setState({ status: "success", candles });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (error instanceof OhlcvRequestError) {
          setState({ status: "error", reason: error.reason, message: error.message });
          return;
        }
        setState({
          status: "error",
          reason: "network_error",
          message: "Unable to load price history.",
        });
      });

    return () => {
      active = false;
      // Only abort the underlying request if this effect started it.
      if (owned) controller.abort();
    };
  }, [chain, contractAddress, timeframe, reloadKey]);

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  return { state, retry };
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const read = () =>
      root.classList.contains("dark") ||
      (!root.classList.contains("light") && media.matches);

    setIsDark(read());

    const observer = new MutationObserver(() => setIsDark(read()));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    const onMediaChange = () => setIsDark(read());
    media.addEventListener("change", onMediaChange);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", onMediaChange);
    };
  }, []);

  return isDark;
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function ChartSkeleton() {
  return (
    <div className="h-64 w-full animate-pulse rounded-2xl bg-slate-200/60 dark:bg-white/5" />
  );
}

function ChartMessage({
  title,
  description,
  onRetry,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-64 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-100/50 px-6 text-center dark:border-white/8 dark:bg-white/[0.03]">
      <TriangleAlert className="size-5 text-slate-400 dark:text-slate-500" />
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{description}</p>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 rounded-lg border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-600 transition-colors hover:bg-purple-500/20 dark:text-purple-300"
        >
          <RefreshCw className="size-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

function TimeframeSelector({
  value,
  onChange,
  disabled,
}: {
  value: OhlcvTimeframe;
  onChange: (next: OhlcvTimeframe) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Chart timeframe">
      {TIMEFRAME_OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              isActive
                ? "bg-purple-500/20 text-purple-600 dark:text-purple-300"
                : "bg-slate-200/60 text-slate-500 hover:text-slate-900 dark:bg-white/5 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

export type TokenPriceChartProps = {
  chain: string;
  contractAddress: string | null;
  symbol: string;
};

export function TokenPriceChart({ chain, contractAddress, symbol }: TokenPriceChartProps) {
  const [timeframe, setTimeframe] = useState<OhlcvTimeframe>(DEFAULT_TIMEFRAME);
  const { state, retry } = useTokenOhlcv(chain, contractAddress, timeframe);
  const isDark = useIsDarkTheme();

  const candles = state.status === "success" ? state.candles : null;

  const chartData = useMemo(
    () =>
      (candles ?? []).map((candle) => ({
        time: candle.time,
        label: formatTimestamp(candle.time, timeframe),
        close: candle.close,
      })),
    [candles, timeframe]
  );

  const axisColor = isDark ? "#64748b" : "#94a3b8";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.08)";
  const tooltipStyle = {
    backgroundColor: isDark ? "rgba(2, 8, 23, 0.95)" : "rgba(255,255,255,0.98)",
    border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.08)",
    borderRadius: "12px",
    color: isDark ? "#e2e8f0" : "#0f172a",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimeframeSelector
          value={timeframe}
          onChange={setTimeframe}
          disabled={state.status === "loading"}
        />
        {candles && candles.length > 0 && (
          <span className="text-xs text-slate-500">
            {symbol} · last {formatUsdPrice(candles[candles.length - 1]?.close)}
          </span>
        )}
      </div>

      {state.status === "loading" || state.status === "idle" ? (
        <ChartSkeleton />
      ) : state.status === "error" ? (
        state.reason === "unsupported_chain" ? (
          <ChartMessage title="This chain is not yet supported." />
        ) : state.reason === "no_data" || state.reason === "no_pools" ? (
          <ChartMessage title="No historical data available." />
        ) : state.reason === "missing_address" || state.reason === "invalid_address" ? (
          <ChartMessage title="No historical data available." description={state.message} />
        ) : (
          <ChartMessage
            title="Couldn't load price history."
            description={state.message}
            onRetry={retry}
          />
        )
      ) : chartData.length === 0 ? (
        <ChartMessage title="No historical data available." />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tokenPriceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                minTickGap={24}
                tick={{ fill: axisColor, fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={72}
                domain={["auto", "auto"]}
                tick={{ fill: axisColor, fontSize: 11 }}
                tickFormatter={(value: number) => formatUsdPrice(value)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: axisColor }}
                labelFormatter={(_label, payload) => {
                  const time = payload?.[0]?.payload?.time as number | undefined;
                  return time ? formatFullTimestamp(time) : "";
                }}
                formatter={(value: number | string) => [formatUsdPrice(value), "Close"]}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke="#a855f7"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#tokenPriceGradient)"
                isAnimationActive
                animationDuration={400}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
