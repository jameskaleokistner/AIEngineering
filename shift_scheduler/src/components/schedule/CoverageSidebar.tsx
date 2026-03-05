"use client";

import type { CoverageInterval } from "@/types";

type Props = { coverage: CoverageInterval[] };

const formatHour = (ts: string) => {
  const d = new Date(ts);
  const h = d.getUTCHours();
  return h >= 12 ? (h === 12 ? "12 PM" : `${h - 12} PM`) : (h === 0 ? "12 AM" : `${h} AM`);
};

export const CoverageSidebar = ({ coverage }: Props) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <h3 className="text-xs font-semibold text-foreground">Coverage Details</h3>
    <p className="mt-0.5 mb-3 text-[10px] text-muted">Need vs. scheduled per hour</p>
    <div className="max-h-[440px] overflow-y-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card border-b border-border">
          <tr className="text-left text-muted">
            <th className="pb-2 pr-3 font-medium">Time</th>
            <th className="pb-2 pr-2 font-medium text-center">Need</th>
            <th className="pb-2 pr-2 font-medium text-center">Have</th>
            <th className="pb-2 font-medium text-right">Gap</th>
          </tr>
        </thead>
        <tbody>
          {coverage.map((c, i) => (
            <tr key={i} className="border-b border-border/30 hover:bg-surface/40 transition-colors">
              <td className="py-1.5 pr-3 font-mono text-muted text-[10px]">{formatHour(c.timestamp)}</td>
              <td className="py-1.5 pr-2 text-center text-foreground">{c.required}</td>
              <td className="py-1.5 pr-2 text-center text-foreground">{c.assigned}</td>
              <td className={`py-1.5 text-right font-bold tabular-nums text-xs ${
                c.delta > 0 ? "text-success" : c.delta < 0 ? "text-danger" : "text-muted"
              }`}>
                {c.delta > 0 ? `+${c.delta}` : c.delta === 0 ? "—" : c.delta}
              </td>
            </tr>
          ))}
          {coverage.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-muted text-[10px]">No coverage data</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);
