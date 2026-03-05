"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CoverageInterval } from "@/types";

type Props = { data: CoverageInterval[] };

const STORE_OPEN = 6;
const STORE_CLOSE = 22;

const buildFullGrid = (data: CoverageInterval[]) => {
  const lookup = new Map(data.map((d) => [d.timestamp, d]));
  if (data.length === 0) return [];

  const first = new Date(data[0].timestamp);
  const startDate = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const grid: { label: string; assigned: number; hour: number }[] = [];

  for (let d = 0; d < 7; d++) {
    const date = new Date(startDate.getTime() + d * 86_400_000);
    const dow = date.getUTCDay();
    const dayName = days[dow];
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");

    for (let h = STORE_OPEN; h < STORE_CLOSE; h++) {
      const hh = String(h).padStart(2, "0");
      const ts = `${date.getUTCFullYear()}-${mm}-${dd}T${hh}:00:00Z`;
      const point = lookup.get(ts);
      const ampm = h >= 12 ? (h === 12 ? "12p" : `${h - 12}p`) : `${h}a`;
      grid.push({ label: `${dayName} ${ampm}`, assigned: point?.assigned ?? 0, hour: h });
    }
  }
  return grid;
};

export const LaborChart = ({ data }: Props) => {
  const chartData = buildFullGrid(data);
  const dayStartIndices = new Set<number>();
  chartData.forEach((d, i) => { if (d.hour === STORE_OPEN) dayStartIndices.add(i); });

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground">Planned Labor</h3>
      <p className="mb-4 text-xs text-muted">Workers scheduled per hour across the week.</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            ticks={chartData.filter((_, i) => dayStartIndices.has(i)).map((d) => d.label)}
            axisLine={{ stroke: "#e5e7eb" }}
            tickLine={false}
            height={28}
          />
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e5e7eb" }}
            formatter={(value) => [`${value} workers`, "Scheduled"]}
          />
          <Bar dataKey="assigned" fill="#059669" radius={[2, 2, 0, 0]} maxBarSize={6} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
