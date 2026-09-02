"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
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

// Spending trend chart (Area) — monthly spend + hours
export function SpendingTrendChart({ data }: { data: SpendingMonth[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
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
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          orientation="right"
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number, name: string) => {
            if (name === "Výdaje") return formatCzk(v);
            return formatNumber(v, " h");
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
          type="monotone"
          dataKey="spend"
          name="Výdaje"
          stroke="#f59e0b"
          strokeWidth={2}
          fill="url(#spendGradient)"
        />
        <Area
          type="monotone"
          dataKey="hours"
          name="Hodiny"
          stroke="#8b5cf6"
          strokeWidth={2}
          fill="url(#hoursGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
