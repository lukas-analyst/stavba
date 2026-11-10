"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCzk, formatNumber } from "@/lib/format";

type SpendingMonth = {
  key: string;
  label: string;
  spend: number;
  hours: number;
};

// Spending trend chart (dual-axis) — spend on the right axis (Kč),
// hours on the left axis. X-axis is the month label (date/time).
// Uses a ComposedChart so each series binds to its own YAxis via yAxisId.
export function SpendingTrendChart({ data }: { data: SpendingMonth[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10 }}
          interval={0}
          axisLine={false}
          tickLine={false}
        />
        {/* Left axis: hours (small numbers) */}
        <YAxis
          yAxisId="hours"
          orientation="left"
          tick={{ fontSize: 10, fill: "#8b5cf6" }}
          tickFormatter={(v) => `${v.toFixed(0)}`}
          axisLine={false}
          tickLine={false}
          width={32}
          allowDecimals={false}
        />
        {/* Right axis: spend (Kč, large numbers) */}
        <YAxis
          yAxisId="spend"
          orientation="right"
          tick={{ fontSize: 10, fill: "#f59e0b" }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          formatter={(v: number, name: string) => {
            if (name === "Výdaje") return [formatCzk(v), "Výdaje"];
            return [formatNumber(v, " h"), "Hodiny"];
          }}
          contentStyle={{
            backgroundColor: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelStyle={{ fontSize: 11, fontWeight: 600 }}
        />
        <Area
          yAxisId="spend"
          type="monotone"
          dataKey="spend"
          name="Výdaje"
          stroke="#f59e0b"
          strokeWidth={2}
          fill="url(#spendGradient)"
        />
        <Line
          yAxisId="hours"
          type="monotone"
          dataKey="hours"
          name="Hodiny"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ r: 2, fill: "#8b5cf6" }}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
