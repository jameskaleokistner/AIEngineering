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

const HOUR_WIDTH = 48; // px per hour column
const ROW_HEIGHT = 40;

const COLORS = [
  "#2563eb", "#7c3aed", "#0891b2", "#059669",
  "#d97706", "#dc2626", "#db2777", "#4f46e5",
  "#0d9488", "#ca8a04",
];

export const ShiftTimeline = ({
  shifts,
  employees,
  dayStart,
  hoursInView,
  onDeleteShift,
  onAddShift,
  onResizeShift,
}: Props) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    shiftIndex: number;
  } | null>(null);

  const [resizing, setResizing] = useState<{
    shiftIndex: number;
    startX: number;
    originalEnd: string;
  } | null>(null);

  const dayStartMs = dayStart.getTime();
  const hours = Array.from({ length: hoursInView }, (_, i) => i);

  const employeeColor = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e, i) => map.set(e.employeeId, COLORS[i % COLORS.length]));
    return map;
  }, [employees]);

  const handleCellClick = (employeeId: string, hour: number) => {
    const slotStart = addHours(dayStart, hour);
    const alreadyCovered = shifts.some((s) => {
      if (s.employeeId !== employeeId) return false;
      const sStart = parseISO(s.start).getTime();
      const sEnd = parseISO(s.end).getTime();
      return slotStart.getTime() >= sStart && slotStart.getTime() < sEnd;
    });
    if (!alreadyCovered) {
      onAddShift(employeeId, hour);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, shiftIndex: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, shiftIndex });
  };

  const handleResizeStart = (e: React.MouseEvent, shiftIndex: number) => {
    e.stopPropagation();
    setResizing({ shiftIndex, startX: e.clientX, originalEnd: shifts[shiftIndex].end });

    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - e.clientX;
      const hoursDelta = Math.round(dx / HOUR_WIDTH);
      if (hoursDelta !== 0) {
        const newEnd = addHours(parseISO(shifts[shiftIndex].end), hoursDelta);
        onResizeShift(shiftIndex, newEnd.toISOString());
      }
    };

    const onUp = () => {
      setResizing(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="relative overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      {/* Close context menu on click anywhere */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
        />
      )}

      <div className="min-w-max">
        {/* Header row with hours */}
        <div className="flex border-b border-border bg-background/50">
          <div className="flex w-36 shrink-0 items-center px-3 text-xs font-semibold text-muted">
            Employee
          </div>
          {hours.map((h) => (
            <div
              key={h}
              className="flex items-center justify-center border-l border-border text-xs text-muted"
              style={{ width: HOUR_WIDTH, height: 32 }}
            >
              {format(addHours(dayStart, h), "HH:mm")}
            </div>
          ))}
        </div>

        {/* Employee rows */}
        {employees.map((emp) => {
          const empShifts = shifts
            .map((s, i) => ({ ...s, globalIndex: i }))
            .filter((s) => s.employeeId === emp.employeeId);

          return (
            <div key={emp.employeeId} className="relative flex border-b border-border">
              <div
                className="flex w-36 shrink-0 items-center px-3 text-xs font-medium text-foreground"
                style={{ height: ROW_HEIGHT }}
              >
                {emp.name}
              </div>
              <div className="relative" style={{ width: hoursInView * HOUR_WIDTH, height: ROW_HEIGHT }}>
                {/* Grid lines */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-l border-border/50 cursor-pointer hover:bg-primary/5"
                    style={{ left: h * HOUR_WIDTH, width: HOUR_WIDTH }}
                    onClick={() => handleCellClick(emp.employeeId, h)}
                  />
                ))}

                {/* Shift bars */}
                {empShifts.map((shift) => {
                  const sStart = parseISO(shift.start).getTime();
                  const sEnd = parseISO(shift.end).getTime();
                  const offsetHours = (sStart - dayStartMs) / 3_600_000;
                  const durationHours = (sEnd - sStart) / 3_600_000;

                  if (offsetHours < 0 || offsetHours >= hoursInView) return null;

                  return (
                    <div
                      key={shift.globalIndex}
                      className="absolute top-1 flex items-center rounded-md px-1 text-[10px] font-medium text-white shadow-sm cursor-pointer select-none"
                      style={{
                        left: offsetHours * HOUR_WIDTH + 1,
                        width: Math.max(durationHours * HOUR_WIDTH - 2, 16),
                        height: ROW_HEIGHT - 8,
                        backgroundColor: employeeColor.get(emp.employeeId) ?? "#2563eb",
                      }}
                      onContextMenu={(e) => handleContextMenu(e, shift.globalIndex)}
                    >
                      <span className="truncate">
                        {differenceInHours(parseISO(shift.end), parseISO(shift.start))}h
                      </span>
                      {/* Resize handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 rounded-r-md"
                        onMouseDown={(e) => handleResizeStart(e, shift.globalIndex)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg border border-border bg-card py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-danger/10"
            onClick={() => {
              onDeleteShift(contextMenu.shiftIndex);
              setContextMenu(null);
            }}
          >
            Delete Shift
          </button>
        </div>
      )}
    </div>
  );
};
