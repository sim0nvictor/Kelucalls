"use client";

import { useSyncExternalStore } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

/**
 * Structurally compatible with IntentHistoryPoint from lib/intent/queries,
 * declared here so the chart never imports server code.
 */
export type TimelinePoint = {
  keluScore: number;
  capturedAt: string;
};

/**
 * Recharts measures the DOM to size itself, so it cannot render during SSR.
 * Same guard used by the existing token price chart: render a skeleton until
 * mounted rather than letting the server and client disagree.
 */
function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatScoreValue(value: number | string | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : "--";
}

/**
 * KeluScore over time.
 *
 * The Y axis is pinned to 0-100 rather than auto-scaled. A token drifting
 * between 41 and 43 should look flat, not like a rollercoaster, which is
 * exactly what auto-scaling would make it look like.
 */
export function ScoreHistoryChart({ points }: { points: TimelinePoint[] }) {
  const mounted = useIsClient();

  // A single snapshot is a dot, not a trend. Show nothing until there are two.
  if (points.length < 2) return null;

  const data = points.map((point) => ({
    label: formatDay(point.capturedAt),
    score: Math.max(0, Math.min(100, point.keluScore))
  }));

  const first = points[0];
  const last = points[points.length - 1];
  const drift = last.keluScore - first.keluScore;

  const DriftIcon = drift > 0.5 ? TrendingUp : drift < -0.5 ? TrendingDown : Minus;
  const driftClass =
    drift > 0.5 ? "text-emerald-300" : drift < -0.5 ? "text-red-400" : "text-slate-400";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-slate-500">Timeline</h3>
        <div className={"flex items-center gap-1.5 text-xs font-medium " + driftClass}>
          <DriftIcon className="size-3.5" />
          {drift > 0 ? "+" : ""}
          {drift.toFixed(1)} over {points.length} snapshots
        </div>
      </div>

      <div className="h-48">
        {!mounted ? (
          <div className="h-full w-full animate-pulse rounded-2xl bg-white/5" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="keluScoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b", fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b", fontSize: 11 }}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(2, 8, 23, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px"
                }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value) => [
                  formatScoreValue(value as number | string | undefined),
                  "KeluScore"
                ]}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#22d3ee"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#keluScoreGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex justify-between text-[11px] text-slate-600">
        <span>{new Date(first.capturedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
        <span>{new Date(last.capturedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
      </div>
    </div>
  );
}
