"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { DemandPoint } from "@/types";

type Props = { data: DemandPoint[] };

const STORE_OPEN = 6;
const STORE_CLOSE = 22;

/** Build a complete grid of store hours (6am-10pm) for 7 days, filling gaps with 0 */
const buildFullGrid = (data: DemandPoint[]) => {
  const lookup = new Map(data.map((d) => [d.timestamp, d]));

  // Find the first date in the data
  if (data.length === 0) return [];
  const first = new Date(data[0].timestamp);
  const startDate = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));

  const grid: { label: string; dayLabel: string; volume: number; hour: number }[] = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
      const ampm = h >= 12 ? (h === 12 ? "12p" : `${h - 12}p`) : (h === 0 ? "12a" : `${h}a`);

      grid.push({
        label: `${dayName} ${ampm}`,
        dayLabel: dayName,
        volume: point?.volume ?? point?.requiredHeadcount ? (point.requiredHeadcount * 100) : 0,
        hour: h,
      });
    }
  }
  return grid;
};

export const DemandChart = ({ data }: Props) => {
  const chartData = buildFullGrid(data);
  // Show day labels at the start of each day
  const dayStartIndices = new Set<number>();
  chartData.forEach((d, i) => { if (d.hour === STORE_OPEN) dayStartIndices.add(i); });

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-foreground">Cookie Volume</h3>
        <span className="text-xs text-muted">7-day forecast &middot; 1 worker = 100 cookies/hr</span>
      </div>
      <p className="mb-4 text-xs text-muted">
        Hourly cookie production demand during store hours (6am - 10pm). Bars above the red line require more than 5 workers.
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            ticks={chartData.filter((_, i) => dayStartIndices.has(i)).map((d) => d.label)}
            axisLine={{ stroke: "#e5e7eb" }}
            tickLine={false}
            height={28}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e5e7eb" }}
            formatter={(value) => [`${value} cookies`, "Volume"]}
            labelFormatter={(label) => String(label)}
          />
          <ReferenceLine y={500} stroke="#dc2626" strokeDasharray="6 4" strokeWidth={1} label={{ value: "5-worker cap", position: "right", fill: "#dc2626", fontSize: 10 }} />
          <Area type="monotone" dataKey="volume" stroke="#4f46e5" fill="url(#volumeGrad)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
