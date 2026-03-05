"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { DemandPoint } from "@/types";

type Props = { data: DemandPoint[] };

const STORE_OPEN = 6;
const STORE_CLOSE = 22;

const buildFullGrid = (data: DemandPoint[]) => {
  const lookup = new Map(data.map((d) => [d.timestamp, d]));
  if (data.length === 0) return [];

  const first = new Date(data[0].timestamp);
  const startDate = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const grid: { label: string; dayLabel: string; fullLabel: string; volume: number; hour: number; isDayStart: boolean }[] = [];

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

      grid.push({
        label: `${dayName} ${ampm}`,
        fullLabel: `${dayName} ${mm}/${dd} ${h}:00`,
        dayLabel: dayName,
        volume: point?.volume ?? (point?.requiredHeadcount ? point.requiredHeadcount * 100 : 0),
        hour: h,
        isDayStart: h === STORE_OPEN,
      });
    }
  }
  return grid;
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-2xl shadow-black/50 backdrop-blur-sm">
      <p className="text-[10px] font-medium text-muted mb-1">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <p className="text-base font-bold text-primary">{payload[0].value.toLocaleString()}</p>
        <p className="text-[10px] text-muted">cookies/hr</p>
      </div>
    </div>
  );
};

export const DemandChart = ({ data }: Props) => {
  const chartData = buildFullGrid(data);
  const dayStarts = chartData.filter((d) => d.isDayStart);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Cookie Volume Forecast</h3>
          <p className="mt-1 text-xs text-muted">Hourly demand across 7 days · store hours 6 am–10 pm · 1 worker ≈ 100 cookies/hr</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          <div className="h-3 w-3 rounded-full bg-primary/30" />
          <span className="text-[10px] text-muted">Volume</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300} className="mt-4">
        <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
              <stop offset="55%" stopColor="#8b5cf6" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />

          {/* Day separator lines */}
          {dayStarts.slice(1).map((d) => (
            <ReferenceLine key={d.label} x={d.label} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
          ))}

          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#6b7280" }}
            ticks={dayStarts.map((d) => d.label)}
            axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
            tickLine={false}
            height={28}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={500}
            stroke="#fb7185"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{ value: "5-worker cap", position: "insideTopRight", fill: "#fb7185", fontSize: 9 }}
          />
          <Area
            type="monotone"
            dataKey="volume"
            stroke="url(#strokeGrad)"
            fill="url(#volumeGrad)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: "#8b5cf6", strokeWidth: 2, stroke: "#0d0d1f" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
