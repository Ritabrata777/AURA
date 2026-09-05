"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import type { TrendPoint } from "@/lib/types";

interface TrendChartProps {
  data: TrendPoint[];
  type: "HEART_RATE" | "SPO2" | "TEMPERATURE";
  unit: string;
}

const colors = {
  HEART_RATE: "#f87171",
  SPO2: "#60a5fa",
  TEMPERATURE: "#fb923c",
};

export function TrendChart({ data, type, unit }: TrendChartProps) {
  const color = colors[type];

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/50">
        No trend data available
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`color${type}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 12, fill: "rgba(255,255,255,0.45)" }}
            stroke="rgba(255,255,255,0.25)"
            tickFormatter={(value: string) => `${value}`.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "rgba(255,255,255,0.45)" }}
            stroke="rgba(255,255,255,0.25)"
            label={{
              value: unit,
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 12, fill: "rgba(255,255,255,0.45)" },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(18,18,18,0.92)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "12px",
              padding: "8px 12px",
              color: "#fff",
              backdropFilter: "blur(12px)",
            }}
            labelStyle={{ color: "rgba(255,255,255,0.6)" }}
            itemStyle={{ color: "#fff" }}
            cursor={{ stroke: "rgba(255,255,255,0.2)" }}
            formatter={(value) =>
              [Number(value ?? 0).toFixed(type === "TEMPERATURE" ? 1 : 0), ""]
            }
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="avg"
            stroke={color}
            strokeWidth={2}
            fill={`url(#color${type})`}
            name="Average"
          />
          <Line
            type="monotone"
            dataKey="min"
            stroke={color}
            strokeWidth={1}
            strokeDasharray="5 5"
            dot={false}
            name="Min"
          />
          <Line
            type="monotone"
            dataKey="max"
            stroke={color}
            strokeWidth={1}
            strokeDasharray="5 5"
            dot={false}
            name="Max"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
