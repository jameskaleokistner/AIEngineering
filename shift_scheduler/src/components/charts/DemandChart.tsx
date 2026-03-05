"use client";

import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { DemandPoint } from "@/types";
import { buildHourSlots, ChartTooltipCard } from "./chart-utils";

type Props = { data: DemandPoint[] };

const buildFullGrid = (data: DemandPoint[]) => {
  if (!data.length) return [];
  const lookup = new Map(data.map((d) => [d.timestamp, d]));
  return buildHourSlots(data[0].timestamp).map(({ ts, label, isDayStart }) => {
    const p = lookup.get(ts);
    return {
      label,
      isDayStart,
      volume: p?.volume ?? (p?.requiredHeadcount ? p.requiredHeadcount * 100 : 0),
    };
  });
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!payload?.length) return null;
  return (
    <ChartTooltipCard active={active} label={label}>
      <div className="flex items-baseline gap-1.5">
        <p className="text-base font-bold text-primary">{payload[0].value.toLocaleString()}</p>
        <p className="text-[10px] text-muted">cookies/hr</p>
      </div>
    </ChartTooltipCard>
  );
};

export const DemandChart = ({ data }: Props) => {
  const chartData = useMemo(() => buildFullGrid(data), [data]);
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
