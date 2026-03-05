"use client";

import { useState, useMemo } from "react";

type WarningCategory = {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  items: string[];
};

const CATEGORY_DEFS: {
  key: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  match: (warning: string) => boolean;
}[] = [
  {
    key: "daily-limit",
    label: "Daily Hour Limit Exceeded",
    icon: "⏱",
    color: "text-danger",
    bgColor: "bg-danger-light",
    match: (w) => /h\/day/.test(w),
  },
  {
    key: "weekly-limit",
    label: "Weekly Hour Limit Exceeded",
    icon: "📅",
    color: "text-warning",
    bgColor: "bg-warning-light",
    match: (w) => /h\/week/.test(w),
  },
  {
    key: "availability",
    label: "Employee Unavailable",
    icon: "🚫",
    color: "text-muted",
    bgColor: "bg-surface",
    match: (w) => /not available/.test(w),
  },
  {
    key: "overlap",
    label: "Shift Overlap",
    icon: "🔄",
    color: "text-primary",
    bgColor: "bg-primary-light",
    match: (w) => /overlap/.test(w),
  },
  {
    key: "no-employees",
    label: "No Available Employees",
    icon: "👤",
    color: "text-danger",
    bgColor: "bg-danger-light",
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
      result.push({ label: def.label, icon: def.icon, color: def.color, bgColor: def.bgColor, items });
    }
  }

  if (uncategorized.length > 0) {
    result.push({
      label: "Other",
      icon: "ℹ️",
      color: "text-muted",
      bgColor: "bg-surface",
      items: uncategorized,
    });
  }

  return result;
};

type Props = {
  warnings: string[];
  compact?: boolean;
};

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
      <h3 className={`font-semibold text-warning ${compact ? "text-xs" : "text-sm"}`}>
        Warnings ({warnings.length})
      </h3>
      <p className="mt-0.5 mb-3 text-[10px] text-muted">
        Grouped by cause &mdash; click a category to expand
      </p>

      <div className="space-y-2">
        {categories.map((cat) => {
          const isOpen = expanded.has(cat.label);
          return (
            <div key={cat.label} className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <button
                onClick={() => toggle(cat.label)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-surface/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{cat.icon}</span>
                  <span className={`text-xs font-medium ${cat.color}`}>{cat.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${cat.bgColor} ${cat.color}`}>
                    {cat.items.length}
                  </span>
                  <span className="text-muted text-[10px]">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border/40 px-3.5 py-2.5">
                  <ul className={`space-y-1.5 ${compact ? "max-h-32" : "max-h-48"} overflow-y-auto`}>
                    {cat.items.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground/80">
                        <span className={`mt-0.5 shrink-0 text-[6px] ${cat.color}`}>●</span>
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
