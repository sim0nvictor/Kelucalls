"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import type { TrendingToken } from "@/types/kelucalls";

interface TrendingTokenChartProps {
  tokens: TrendingToken[];
}

const generateMockData = () => {
  const data = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      calls: Math.floor(Math.random() * 50 + 10),
      volume: Math.floor(Math.random() * 100000 + 50000)
    });
  }
  return data;
};

export function TrendingTokenChart({ tokens }: TrendingTokenChartProps) {
  const data = generateMockData();

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
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
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(2, 8, 23, 0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
            }}
            labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
            itemStyle={{ color: "#22d3ee" }}
          />
          <Area
            type="monotone"
            dataKey="calls"
            stroke="#22d3ee"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorCalls)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}