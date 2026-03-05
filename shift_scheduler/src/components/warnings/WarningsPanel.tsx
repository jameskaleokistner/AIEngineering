"use client";

import { useState, useMemo } from "react";

type WarningCategory = {
  label: string;
  icon: string;
  colorClass: string;
  items: string[];
};

const CATEGORY_DEFS: {
  key: string;
  label: string;
  icon: string;
  colorClass: string;
  match: (warning: string) => boolean;
}[] = [
  {
    key: "daily-limit",
    label: "Daily Hour Limit",
    icon: "⏱",
    colorClass: "text-danger",
    match: (w) => /h\/day/.test(w),
  },
  {
    key: "weekly-limit",
    label: "Weekly Hour Limit",
    icon: "📅",
    colorClass: "text-warning",
    match: (w) => /h\/week/.test(w),
  },
  {
    key: "availability",
    label: "Unavailable",
    icon: "🚫",
    colorClass: "text-muted",
    match: (w) => /not available/.test(w),
  },
  {
    key: "overlap",
    label: "Shift Overlap",
    icon: "🔄",
    colorClass: "text-primary",
    match: (w) => /overlap/.test(w),
  },
  {
    key: "no-employees",
    label: "No Employees",
    icon: "👤",
    colorClass: "text-danger",
    match: (w) => /no available employees/.test(w),
  },
];

const categorize = (warnings: string[]): WarningCategory[] => {
  const buckets = new Map<string, string[]>();
  const uncategorized: string[] = [];

  for (const w of warnings) {
    let matched = false;
    for (const def of CATEGORY_DEFS) {
      if (def.match(w)) {
        const list = buckets.get(def.key) ?? [];
        list.push(w);
        buckets.set(def.key, list);
        matched = true;
        break;
      }
    }
    if (!matched) uncategorized.push(w);
  }

  const result: WarningCategory[] = [];
  for (const def of CATEGORY_DEFS) {
    const items = buckets.get(def.key);
    if (items && items.length > 0) {
      result.push({ label: def.label, icon: def.icon, colorClass: def.colorClass, items });
    }
  }

  if (uncategorized.length > 0) {
    result.push({ label: "Other", icon: "ℹ️", colorClass: "text-muted", items: uncategorized });
  }

  return result;
};

type Props = { warnings: string[]; compact?: boolean };

export const WarningsPanel = ({ warnings, compact = false }: Props) => {
  const categories = useMemo(() => categorize(warnings), [warnings]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  if (warnings.length === 0) return null;

  return (
    <section className={`rounded-2xl border border-warning/20 bg-warning-light ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className={`font-semibold text-warning ${compact ? "text-xs" : "text-sm"}`}>
          {warnings.length} Warning{warnings.length !== 1 ? "s" : ""}
        </h3>
        <span className="text-[9px] uppercase tracking-wider text-warning/60 font-medium">Click to expand</span>
      </div>
      <p className="mb-4 text-[10px] text-muted">Grouped by cause</p>

      <div className="space-y-2">
        {categories.map((cat) => {
          const isOpen = expanded.has(cat.label);
          return (
            <div key={cat.label} className="rounded-xl border border-border/40 bg-card overflow-hidden">
              <button
                onClick={() => toggle(cat.label)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm">{cat.icon}</span>
                  <span className={`text-xs font-medium ${cat.colorClass}`}>{cat.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[9px] font-bold bg-warning-light text-warning`}>
                    {cat.items.length}
                  </span>
                  <svg
                    className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border/30 px-4 py-3">
                  <ul className={`space-y-1.5 ${compact ? "max-h-28" : "max-h-44"} overflow-y-auto`}>
                    {cat.items.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground/70">
                        <span className={`mt-1 shrink-0 text-[5px] ${cat.colorClass}`}>●</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
