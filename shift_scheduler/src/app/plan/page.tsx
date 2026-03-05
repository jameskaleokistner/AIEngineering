"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { parseISO, addDays, addHours, format, differenceInHours } from "date-fns";
import { ShiftTimeline } from "@/components/schedule/ShiftTimeline";
import { CoverageSidebar } from "@/components/schedule/CoverageSidebar";
import { PublishPanel } from "@/components/publish/PublishPanel";
import { WarningsPanel } from "@/components/warnings/WarningsPanel";
import type { Plan, DemandPoint, Employee, Shift, CoverageInterval } from "@/types";

export default function PlanPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [demand, setDemand] = useState<DemandPoint[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDay, setSelectedDay] = useState(0);

  useEffect(() => {
    const stored = sessionStorage.getItem("shift_plan");
    const storedDemand = sessionStorage.getItem("shift_demand");
    const storedEmployees = sessionStorage.getItem("shift_employees");
    if (stored) setPlan(JSON.parse(stored));
    if (storedDemand) setDemand(JSON.parse(storedDemand));
    if (storedEmployees) setEmployees(JSON.parse(storedEmployees));
  }, []);

  const days = useMemo(() => {
    if (demand.length === 0) return [];
    const uniqueDays = new Set(
      demand.map((d) => {
        const dt = parseISO(d.timestamp);
        return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())).toISOString();
      }),
    );
    return Array.from(uniqueDays).sort().map((d) => new Date(d));
  }, [demand]);

  const dayStart = days[selectedDay] ?? new Date();

  const recomputeCoverage = useCallback(
    (shifts: Shift[]): CoverageInterval[] =>
      demand.map((dp) => {
        const slotStart = parseISO(dp.timestamp).getTime();
        const slotEnd = addHours(parseISO(dp.timestamp), 1).getTime();
        const assigned = shifts.filter((s) => {
          const sStart = parseISO(s.start).getTime();
          const sEnd = parseISO(s.end).getTime();
          return sStart < slotEnd && sEnd > slotStart;
        }).length;
        return { timestamp: dp.timestamp, required: dp.requiredHeadcount, assigned, delta: assigned - dp.requiredHeadcount };
      }),
    [demand],
  );

  const handleDeleteShift = useCallback((index: number) => {
    if (!plan) return;
    const newShifts = plan.shifts.filter((_, i) => i !== index);
    setPlan({ ...plan, shifts: newShifts, coverage: recomputeCoverage(newShifts) });
  }, [plan, recomputeCoverage]);

  const handleAddShift = useCallback((employeeId: string, startHour: number) => {
    if (!plan) return;
    const start = addHours(dayStart, startHour);
    const end = addHours(start, 1);
    const newShift: Shift = { employeeId, start: start.toISOString(), end: end.toISOString(), assigned: true };
    const newShifts = [...plan.shifts, newShift];
    setPlan({ ...plan, shifts: newShifts, coverage: recomputeCoverage(newShifts) });
  }, [plan, dayStart, recomputeCoverage]);

  const handleResizeShift = useCallback((index: number, newEnd: string) => {
    if (!plan) return;
    const shift = plan.shifts[index];
    const duration = differenceInHours(parseISO(newEnd), parseISO(shift.start));
    if (duration < 1 || duration > 12) return;
    const newShifts = plan.shifts.map((s, i) => (i === index ? { ...s, end: newEnd } : s));
    setPlan({ ...plan, shifts: newShifts, coverage: recomputeCoverage(newShifts) });
  }, [plan, recomputeCoverage]);

  const dayCoverage = useMemo(() => {
    if (!plan) return [];
    const dayMs = dayStart.getTime();
    const nextDayMs = addDays(dayStart, 1).getTime();
    return plan.coverage.filter((c) => { const t = parseISO(c.timestamp).getTime(); return t >= dayMs && t < nextDayMs; });
  }, [plan, dayStart]);

  const dayWarnings = useMemo(() => {
    if (!plan) return [];
    const mm = String(dayStart.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dayStart.getUTCDate()).padStart(2, "0");
    const dayStr = `${mm}/${dd}`;
    return plan.warnings.filter((w) => w.includes(dayStr));
  }, [plan, dayStart]);

  if (!plan) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface">
          <span className="text-xl text-muted">&#128197;</span>
        </div>
        <p className="text-sm text-muted">No plan loaded yet.</p>
        <Link href="/" className="text-xs font-medium text-primary hover:underline">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">S</div>
            <span className="text-sm font-semibold tracking-tight text-foreground">Planning Workspace</span>
          </div>
          <nav className="flex gap-1">
            <Link href="/" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface">Dashboard</Link>
            <Link href="/plan" className="rounded-md px-3 py-1.5 text-xs font-medium text-primary bg-primary-light">Planning</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* Day pills */}
        <div className="flex flex-wrap gap-1.5">
          {days.map((d, i) => {
            const dayLabel = format(d, "EEE");
            const dateLabel = format(d, "MMM d");
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(i)}
                className={`flex flex-col items-center rounded-xl px-3.5 py-2 text-center transition-colors ${
                  i === selectedDay
                    ? "bg-primary text-white shadow-sm"
                    : "border border-border bg-card text-foreground hover:bg-surface"
                }`}
              >
                <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{dayLabel}</span>
                <span className="text-xs font-semibold">{dateLabel}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
          {/* Timeline */}
          <div className="xl:col-span-3 space-y-2">
            <ShiftTimeline
              shifts={plan.shifts}
              employees={employees}
              dayStart={dayStart}
              hoursInView={24}
              onDeleteShift={handleDeleteShift}
              onAddShift={handleAddShift}
              onResizeShift={handleResizeShift}
            />
            <p className="text-[10px] text-muted">
              Click empty cell to add shift &middot; Right-click shift to delete &middot; Drag right edge to resize
            </p>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <CoverageSidebar coverage={dayCoverage} />

            {dayWarnings.length > 0 && (
              <WarningsPanel warnings={dayWarnings} compact />
            )}
          </div>
        </div>

        <PublishPanel plan={plan} employees={employees} />
      </main>
    </div>
  );
}
