"use client";

import { useMemo, useState } from "react";
import { parseISO, format, differenceInHours, addHours } from "date-fns";
import type { Shift, Employee } from "@/types";

type Props = {
  shifts: Shift[];
  employees: Employee[];
  dayStart: Date;
  hoursInView: number;
  onDeleteShift: (index: number) => void;
  onAddShift: (employeeId: string, startHour: number) => void;
  onResizeShift: (index: number, newEnd: string) => void;
};

const HOUR_WIDTH = 52;
const ROW_HEIGHT = 48;
const STORE_OPEN = 6;
const STORE_CLOSE = 22;

const COLORS = [
  "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#6366f1",
  "#14b8a6", "#f97316",
];

type TooltipInfo = {
  shiftIndex: number;
  x: number;
  y: number;
  empName: string;
  start: string;
  end: string;
  hours: number;
  color: string;
};

export const ShiftTimeline = ({
  shifts, employees, dayStart, hoursInView,
  onDeleteShift, onAddShift, onResizeShift,
}: Props) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; shiftIndex: number } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  const dayStartMs = dayStart.getTime();
  const hours = Array.from({ length: hoursInView }, (_, i) => i);

  const employeeColor = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e, i) => map.set(e.employeeId, COLORS[i % COLORS.length]));
    return map;
  }, [employees]);

  // Per-employee hours on this day
  const empHours = useMemo(() => {
    const map = new Map<string, number>();
    employees.forEach((e) => {
      const dayMs = dayStart.getTime();
      const nextDayMs = dayMs + 86_400_000;
      const total = shifts
        .filter((s) => s.employeeId === e.employeeId && parseISO(s.start).getTime() >= dayMs && parseISO(s.start).getTime() < nextDayMs)
        .reduce((acc, s) => acc + differenceInHours(parseISO(s.end), parseISO(s.start)), 0);
      map.set(e.employeeId, total);
    });
    return map;
  }, [shifts, employees, dayStart]);

  const handleCellClick = (employeeId: string, hour: number) => {
    const slotStart = addHours(dayStart, hour);
    const alreadyCovered = shifts.some((s) => {
      if (s.employeeId !== employeeId) return false;
      const sStart = parseISO(s.start).getTime();
      const sEnd = parseISO(s.end).getTime();
      return slotStart.getTime() >= sStart && slotStart.getTime() < sEnd;
    });
    if (!alreadyCovered) onAddShift(employeeId, hour);
  };

  const handleContextMenu = (e: React.MouseEvent, shiftIndex: number) => {
    e.preventDefault();
    setTooltip(null);
    setContextMenu({ x: e.clientX, y: e.clientY, shiftIndex });
  };

  const handleResizeStart = (e: React.MouseEvent, shiftIndex: number) => {
    e.stopPropagation();

    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - e.clientX;
      const hoursDelta = Math.round(dx / HOUR_WIDTH);
      if (hoursDelta !== 0) {
        const newEnd = addHours(parseISO(shifts[shiftIndex].end), hoursDelta);
        onResizeShift(shiftIndex, newEnd.toISOString());
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const isOffHour = (h: number) => h < STORE_OPEN || h >= STORE_CLOSE;

  return (
    <div className="relative overflow-x-auto rounded-2xl border border-border bg-card shadow-xl shadow-black/30">
      {contextMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
      )}

      {/* Shift hover tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl border border-border bg-card/95 backdrop-blur-sm px-3.5 py-2.5 shadow-2xl shadow-black/50 text-xs"
          style={{ left: tooltip.x + 12, top: tooltip.y - 50 }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tooltip.color }} />
            <span className="font-semibold text-foreground">{tooltip.empName}</span>
          </div>
          <p className="text-muted tabular-nums">
            {format(parseISO(tooltip.start), "h:mm a")} – {format(parseISO(tooltip.end), "h:mm a")}
          </p>
          <p className="text-primary font-medium mt-0.5">{tooltip.hours}h shift</p>
        </div>
      )}

      <div className="min-w-max">
        {/* Header row */}
        <div className="flex border-b border-border bg-surface/40 sticky top-0 z-10">
          <div className="flex w-44 shrink-0 items-center px-4 text-[10px] font-bold uppercase tracking-widest text-muted" style={{ height: 34 }}>
            Employee
          </div>
          {hours.map((h) => {
            const label = format(addHours(dayStart, h), "HH:mm");
            const isMajor = h % 6 === 0;
            const offHour = isOffHour(h);
            return (
              <div
                key={h}
                className={`flex items-center justify-center border-l text-[9px] transition-colors ${
                  offHour ? "border-border/20 text-muted/30" : "border-border/50 text-muted"
                } ${isMajor && !offHour ? "font-semibold" : ""}`}
                style={{ width: HOUR_WIDTH, height: 34 }}
              >
                {(isMajor || h === STORE_OPEN) ? label : ""}
              </div>
            );
          })}
        </div>

        {/* Employee rows */}
        {employees.map((emp, empIdx) => {
          const empShifts = shifts
            .map((s, i) => ({ ...s, globalIndex: i }))
            .filter((s) => s.employeeId === emp.employeeId);
          const color = employeeColor.get(emp.employeeId) ?? COLORS[0];
          const hours_today = empHours.get(emp.employeeId) ?? 0;
          const initials = emp.name.replace(/^\[SAMPLE\] /, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

          return (
            <div
              key={emp.employeeId}
              className={`relative flex border-b border-border/30 ${empIdx % 2 === 0 ? "bg-card" : "bg-surface/15"}`}
            >
              {/* Employee label */}
              <div
                className="flex w-44 shrink-0 items-center gap-2.5 px-3 border-r border-border/30"
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                  style={{ backgroundColor: color, boxShadow: `0 2px 8px ${color}50` }}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground truncate leading-tight">
                    {emp.name.replace(/^\[SAMPLE\] /, "")}
                  </p>
                  {hours_today > 0 && (
                    <p className="text-[9px] text-muted mt-0.5">{hours_today}h today</p>
                  )}
                </div>
              </div>

              <div className="relative" style={{ width: hoursInView * HOUR_WIDTH, height: ROW_HEIGHT }}>
                {/* Grid cells */}
                {Array.from({ length: hoursInView }, (_, h) => h).map((h) => {
                  const off = isOffHour(h);
                  return (
                    <div
                      key={h}
                      className={`absolute top-0 bottom-0 border-l cursor-pointer group ${
                        off ? "border-border/15" : "border-border/25"
                      }`}
                      style={{ left: h * HOUR_WIDTH, width: HOUR_WIDTH, backgroundColor: off ? "rgba(0,0,0,0.12)" : undefined }}
                      onClick={() => !off && handleCellClick(emp.employeeId, h)}
                    >
                      {!off && (
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          style={{ backgroundColor: `${color}18` }}
                        />
                      )}
                    </div>
                  );
                })}

                {/* Shift bars */}
                {empShifts.map((shift) => {
                  const sStart = parseISO(shift.start).getTime();
                  const sEnd = parseISO(shift.end).getTime();
                  const offsetHours = (sStart - dayStartMs) / 3_600_000;
                  const durationHours = (sEnd - sStart) / 3_600_000;

                  if (offsetHours < 0 || offsetHours >= hoursInView) return null;

                  const barWidth = Math.max(durationHours * HOUR_WIDTH - 4, 16);
                  const h = durationHours;

                  return (
                    <div
                      key={shift.globalIndex}
                      className="absolute top-2 flex items-center rounded-lg select-none cursor-pointer transition-all duration-150 hover:brightness-115 hover:scale-y-105"
                      style={{
                        left: offsetHours * HOUR_WIDTH + 2,
                        width: barWidth,
                        height: ROW_HEIGHT - 16,
                        backgroundColor: color,
                        boxShadow: `0 2px 14px ${color}55`,
                      }}
                      onContextMenu={(e) => handleContextMenu(e, shift.globalIndex)}
                      onMouseEnter={(e) => setTooltip({
                        shiftIndex: shift.globalIndex,
                        x: e.clientX,
                        y: e.clientY,
                        empName: emp.name.replace(/^\[SAMPLE\] /, ""),
                        start: shift.start,
                        end: shift.end,
                        hours: h,
                        color,
                      })}
                      onMouseMove={(e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <span className="truncate px-2 text-[10px] font-bold text-white/90 leading-none">
                        {barWidth > 50 ? `${h}h` : ""}
                      </span>
                      {/* Resize handle — always visible on the right */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize rounded-r-lg flex items-center justify-center opacity-40 hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                        onMouseDown={(e) => handleResizeStart(e, shift.globalIndex)}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="h-px w-1 bg-white/80 block" />
                          <span className="h-px w-1 bg-white/80 block" />
                          <span className="h-px w-1 bg-white/80 block" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {employees.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
            <div className="h-12 w-12 rounded-xl bg-surface flex items-center justify-center text-2xl">👥</div>
            <p className="text-xs text-muted">No employees to display</p>
          </div>
        )}

        {/* Store hours legend row */}
        <div className="flex border-t border-border/20 bg-surface/20" style={{ minHeight: 20 }}>
          <div className="w-44 shrink-0" />
          {Array.from({ length: hoursInView }, (_, h) => h).map((h) => (
            <div
              key={h}
              className="border-l border-border/15"
              style={{
                width: HOUR_WIDTH,
                backgroundColor: isOffHour(h) ? "rgba(0,0,0,0.15)" : undefined,
                height: 4,
              }}
            />
          ))}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-xl border border-border bg-card/95 backdrop-blur-sm py-1.5 shadow-2xl shadow-black/50 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex items-center gap-2.5 w-full px-4 py-2 text-left text-xs font-medium text-danger hover:bg-danger-light rounded-lg mx-1 transition-colors"
            style={{ width: "calc(100% - 8px)" }}
            onClick={() => {
              onDeleteShift(contextMenu.shiftIndex);
              setContextMenu(null);
            }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Shift
          </button>
        </div>
      )}
    </div>
  );
};
