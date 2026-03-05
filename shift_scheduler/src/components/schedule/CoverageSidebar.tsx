"use client";

import type { CoverageInterval } from "@/types";

type Props = { coverage: CoverageInterval[] };

const formatHour = (ts: string) => {
  const d = new Date(ts);
  const h = d.getUTCHours();
  return h >= 12 ? (h === 12 ? "12:00 PM" : `${h - 12}:00 PM`) : (h === 0 ? "12:00 AM" : `${h}:00 AM`);
};

export const CoverageSidebar = ({ coverage }: Props) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <h3 className="text-xs font-semibold text-foreground">Coverage Details</h3>
    <p className="mt-0.5 mb-3 text-[10px] text-muted">Need vs. have for each hour</p>
    <div className="max-h-[420px] overflow-y-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-left text-muted">
            <th className="pb-1.5 pr-2 font-medium">Time</th>
            <th className="pb-1.5 pr-2 font-medium text-center">Need</th>
            <th className="pb-1.5 pr-2 font-medium text-center">Have</th>
            <th className="pb-1.5 font-medium text-right">Gap</th>
          </tr>
        </thead>
        <tbody>
          {coverage.map((c, i) => (
            <tr key={i} className="border-b border-border/40">
              <td className="py-1.5 pr-2 font-mono text-muted">{formatHour(c.timestamp)}</td>
              <td className="py-1.5 pr-2 text-center">{c.required}</td>
              <td className="py-1.5 pr-2 text-center">{c.assigned}</td>
              <td className={`py-1.5 text-right font-semibold tabular-nums ${
                c.delta > 0 ? "text-success" : c.delta < 0 ? "text-danger" : "text-muted"
              }`}>
                {c.delta > 0 ? `+${c.delta}` : c.delta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
