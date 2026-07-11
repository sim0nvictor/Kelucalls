"use client";

import { useState, useSyncExternalStore } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar
} from "recharts";

const generatePriceData = () => {
  const data = [];
  let basePrice = 0.0001 + Math.random() * 0.001;
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const change = (Math.random() - 0.4) * basePrice * 0.5;
    basePrice = Math.max(0.00001, basePrice + change);
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: basePrice,
      volume: Math.floor(Math.random() * 10000 + 1000)
    });
  }
  return data;
};

function formatPriceValue(value: number | string | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(6)}` : "$0.000000";
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function TokenPriceChart() {
  const mounted = useIsClient();
  const [chartType, setChartType] = useState<"area" | "composed">("area");
  const data = generatePriceData();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { key: "area", label: "Price" },
          { key: "composed", label: "Price + Volume" }
        ].map((type) => (
          <button
            key={type.key}
            onClick={() => setChartType(type.key as typeof chartType)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              chartType === type.key
                ? "bg-purple-500/20 text-purple-300"
                : "bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="h-64">
        {!mounted ? (
          <div className="h-full w-full animate-pulse rounded-2xl bg-white/5" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "area" ? (
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickFormatter={(value) => `$${value.toFixed(6)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(2, 8, 23, 0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px"
                  }}
                  labelStyle={{ color: "#94a3b8" }}
                  formatter={(value) => [formatPriceValue(value as number | string | undefined), "Price"]}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorPrice)"
                />
              </AreaChart>
            ) : (
              <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickFormatter={(value) => `$${value.toFixed(5)}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(2, 8, 23, 0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px"
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="price"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="none"
                />
                <Bar yAxisId="right" dataKey="volume" fill="#6366f1" opacity={0.5} radius={[4, 4, 0, 0]} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
