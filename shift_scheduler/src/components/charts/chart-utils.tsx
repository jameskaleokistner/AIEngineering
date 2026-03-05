"use client";

import React from "react";
import { STORE_OPEN, STORE_CLOSE, UTC_DAYS } from "@/lib/constants";

export const hourLabel = (h: number): string =>
  h >= 12 ? (h === 12 ? "12p" : `${h - 12}p`) : `${h}a`;

export type HourSlot = { ts: string; label: string; hour: number; isDayStart: boolean };

export const buildHourSlots = (
  anchorTimestamp: string,
  open = STORE_OPEN,
  close = STORE_CLOSE,
): HourSlot[] => {
  const first = new Date(anchorTimestamp);
  const startDate = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
  const slots: HourSlot[] = [];

  for (let d = 0; d < 7; d++) {
    const date = new Date(startDate.getTime() + d * 86_400_000);
    const dayName = UTC_DAYS[date.getUTCDay()];
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");

    for (let h = open; h < close; h++) {
      const hh = String(h).padStart(2, "0");
      const ts = `${date.getUTCFullYear()}-${mm}-${dd}T${hh}:00:00Z`;
      slots.push({ ts, label: `${dayName} ${hourLabel(h)}`, hour: h, isDayStart: h === open });
    }
  }

  return slots;
};

export const ChartTooltipCard = ({
  active,
  label,
  children,
}: {
  active?: boolean;
  label?: string;
  children: React.ReactNode;
}) => {
  if (!active) return null;
  return (
    <div className="rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-2xl shadow-black/50 backdrop-blur-sm">
      <p className="text-[10px] font-medium text-muted mb-1">{label}</p>
      {children}
    </div>
  );
};
