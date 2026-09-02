"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCzk } from "@/lib/format";

const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#64748b", "#ec4899", "#84cc16"];

// Category chart (Pie) — plan distribution by category
export function CategoryChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={90}
          innerRadius={40}
          dataKey="value"
          label={({ percent }) =>
            percent && percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""
          }
          labelStyle={{ fontSize: 11 }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => formatCzk(v)}
          contentStyle={{
            backgroundColor: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          layout="vertical"
          align="right"
          verticalAlign="middle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
