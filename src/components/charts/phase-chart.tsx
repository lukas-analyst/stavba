"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCzk } from "@/lib/format";

// Phase chart (Bar) — plan vs actual by phase
export function PhaseChart({ data }: { data: { phase: string; Plán: number; Skutečnost: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="phase" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(v: number) => formatCzk(v)}
          contentStyle={{
            backgroundColor: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Plán" fill="#06b6d4" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Skutečnost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
