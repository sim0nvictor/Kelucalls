"use client";

import { useSyncExternalStore } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";
import type { ChannelSummary } from "@/types/kelucalls";

interface TopCallersChartProps {
  channels: ChannelSummary[];
}

const COLORS = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#f87171", "#818cf8", "#4ade80", "#fb923c"];

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function TopCallersChart({ channels }: TopCallersChartProps) {
  const mounted = useIsClient();

  const data = channels.slice(0, 8).map((ch) => ({
    name: ch.title.length > 15 ? ch.title.slice(0, 15) + "..." : ch.title,
    fullName: ch.title,
    roi: parseFloat(ch.averageRoiPct.toFixed(1)),
    winRate: ch.winRatePct,
    calls: ch.totalCalls
  }));

  return (
    <div className="h-72">
      {!mounted ? (
        <div className="h-full w-full animate-pulse rounded-2xl bg-white/5" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 10 }}>
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              width={75}
            />
            <Tooltip
              content={({ payload }) => {
                if (payload && payload[0]) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-xl">
                      <div className="font-semibold text-white">{data.fullName}</div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <span className="text-slate-500">Avg ROI</span>
                        <span className="text-cyan-300">{data.roi}%</span>
                        <span className="text-slate-500">Win Rate</span>
                        <span className="text-white">{data.winRate}%</span>
                        <span className="text-slate-500">Total Calls</span>
                        <span className="text-white">{data.calls}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
            />
            <Bar dataKey="roi" radius={[0, 4, 4, 0]} opacity={0.85}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
