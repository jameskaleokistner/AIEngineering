"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import type { CoverageInterval } from "@/types";
import { buildHourSlots, ChartTooltipCard } from "./chart-utils";

type Props = { data: CoverageInterval[] };

const buildFullGrid = (data: CoverageInterval[]) => {
  if (!data.length) return [];
  const lookup = new Map(data.map((d) => [d.timestamp, d]));
  return buildHourSlots(data[0].timestamp).map(({ ts, label, isDayStart }) => {
    const p = lookup.get(ts);
    return { label, isDayStart, delta: p?.delta ?? 0 };
  });
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!payload?.length) return null;
  const val = payload[0].value;
  return (
    <ChartTooltipCard active={active} label={label}>
      <div className="flex items-baseline gap-1.5">
        <p className={`text-base font-bold ${val >= 0 ? "text-success" : "text-danger"}`}>
          {val > 0 ? `+${val}` : val}
        </p>
        <p className="text-[10px] text-muted">workers {val >= 0 ? "surplus" : "deficit"}</p>
      </div>
    </ChartTooltipCard>
  );
};

export const CoverageDeltaChart = ({ data }: Props) => {
  const chartData = useMemo(() => buildFullGrid(data), [data]);
  const dayStarts = chartData.filter((d) => d.isDayStart);
  const deficitCount = chartData.filter((d) => d.delta < 0).length;
  const coverageRate = chartData.length > 0
    ? Math.round(((chartData.length - deficitCount) / chartData.length) * 100)
    : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Coverage Gap</h3>
          <p className="mt-1 text-xs text-muted">
            Surplus vs. deficit per hour ·{" "}
            <span className={coverageRate >= 80 ? "text-success" : "text-warning"}>{coverageRate}% coverage</span>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm bg-success/70" />
            <span className="text-[9px] text-muted">Over</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm bg-danger/70" />
            <span className="text-[9px] text-muted">Under</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260} className="mt-4">
        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
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
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
          <Bar dataKey="delta" radius={[3, 3, 0, 0]} maxBarSize={10}>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.delta >= 0 ? "#34d399" : "#fb7185"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
