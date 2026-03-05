"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { CoverageInterval } from "@/types";
import { buildHourSlots, ChartTooltipCard } from "./chart-utils";

type Props = { data: CoverageInterval[] };

const buildFullGrid = (data: CoverageInterval[]) => {
  if (!data.length) return [];
  const lookup = new Map(data.map((d) => [d.timestamp, d]));
  return buildHourSlots(data[0].timestamp).map(({ ts, label, isDayStart }) => {
    const p = lookup.get(ts);
    return { label, isDayStart, assigned: p?.assigned ?? 0 };
  });
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!payload?.length) return null;
  return (
    <ChartTooltipCard active={active} label={label}>
      <div className="flex items-baseline gap-1.5">
        <p className="text-base font-bold text-success">{payload[0].value}</p>
        <p className="text-[10px] text-muted">workers scheduled</p>
      </div>
    </ChartTooltipCard>
  );
};

export const LaborChart = ({ data }: Props) => {
  const chartData = useMemo(() => buildFullGrid(data), [data]);
  const dayStarts = chartData.filter((d) => d.isDayStart);
  const maxAssigned = Math.max(...chartData.map((d) => d.assigned), 1);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Planned Labor</h3>
          <p className="mt-1 text-xs text-muted">Workers scheduled per hour — peak: {maxAssigned}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          <div className="h-3 w-3 rounded bg-success/50" />
          <span className="text-[10px] text-muted">Assigned</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260} className="mt-4">
        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="laborGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0.7} />
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
            width={32}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="assigned" fill="url(#laborGrad)" radius={[3, 3, 0, 0]} maxBarSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
