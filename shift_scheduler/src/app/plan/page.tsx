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

  // Day-level stats
  const dayShifts = useMemo(() => {
    if (!plan) return [];
    const dayMs = dayStart.getTime();
    const nextDayMs = addDays(dayStart, 1).getTime();
    return plan.shifts.filter((s) => {
      const t = parseISO(s.start).getTime();
      return t >= dayMs && t < nextDayMs;
    });
  }, [plan, dayStart]);

  const coveragePct = useMemo(() => {
    if (dayCoverage.length === 0) return 0;
    const met = dayCoverage.filter((c) => c.delta >= 0).length;
    return Math.round((met / dayCoverage.length) * 100);
  }, [dayCoverage]);

  const totalDayHours = useMemo(
    () => dayShifts.reduce((acc, s) => acc + differenceInHours(parseISO(s.end), parseISO(s.start)), 0),
    [dayShifts],
  );

  if (!plan) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-5">
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
          <div className="absolute top-1/3 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-3xl" />
        </div>
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-surface border border-border animate-float">
          <span className="text-3xl">📋</span>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">No plan loaded</p>
          <p className="text-xs text-muted mt-1.5">Generate a schedule from the dashboard first</p>
        </div>
        <Link href="/" className="rounded-xl border border-primary/30 bg-primary-light px-5 py-2.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-16 left-1/4 h-80 w-80 rounded-full bg-primary/7 blur-[90px]" />
        <div className="absolute bottom-1/3 right-1/4 h-56 w-56 rounded-full bg-indigo-700/5 blur-[70px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border glass">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-primary/30">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground">Planning Workspace</span>
              <span className="text-[10px] text-muted">{plan.shifts.length} shifts total · {employees.length} employees</span>
            </div>
          </div>
          <nav className="flex gap-1">
            <Link href="/" className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface transition-colors">
              Dashboard
            </Link>
            <Link href="/plan" className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary-light">
              Planning
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 py-8 space-y-6">

        {/* Day selector + day stats */}
        <div className="animate-slide-up flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {days.map((d, i) => {
              const isSelected = i === selectedDay;
              // Count warnings for this day
              const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
              const dd2 = String(d.getUTCDate()).padStart(2, "0");
              const warnCount = plan.warnings.filter((w) => w.includes(`${mm}/${dd2}`)).length;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(i)}
                  className={`relative flex flex-col items-center rounded-xl px-4 py-2.5 text-center transition-all duration-200 ${
                    isSelected
                      ? "bg-gradient-to-b from-violet-600 to-indigo-700 text-white shadow-lg shadow-primary/30"
                      : "border border-border bg-card text-foreground hover:bg-surface hover:border-primary/25"
                  }`}
                >
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${isSelected ? "opacity-75" : "text-muted"}`}>
                    {format(d, "EEE")}
                  </span>
                  <span className="text-xs font-bold mt-0.5">{format(d, "MMM d")}</span>
                  {warnCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[8px] font-bold text-black">
                      {warnCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Day quick stats */}
          <div className="flex items-center gap-3">
            <MiniStat
              label="Shifts"
              value={dayShifts.length}
              color={dayShifts.length > 0 ? "primary" : "muted"}
            />
            <MiniStat
              label="Hours"
              value={totalDayHours}
              color="muted"
            />
            <MiniStat
              label="Coverage"
              value={`${coveragePct}%`}
              color={coveragePct >= 80 ? "success" : coveragePct >= 60 ? "warning" : "danger"}
            />
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
          {/* Timeline */}
          <div className="xl:col-span-3 space-y-2 animate-slide-up-delay-1">
            <ShiftTimeline
              shifts={plan.shifts}
              employees={employees}
              dayStart={dayStart}
              hoursInView={24}
              onDeleteShift={handleDeleteShift}
              onAddShift={handleAddShift}
              onResizeShift={handleResizeShift}
            />
            <p className="text-[10px] text-muted/70 px-1 leading-relaxed">
              Click empty cell to add · Right-click shift to delete · Drag right edge to resize
            </p>
          </div>

          {/* Sidebar */}
          <div className="space-y-5 animate-slide-up-delay-2">
            <CoverageSidebar coverage={dayCoverage} />
            {dayWarnings.length > 0 && <WarningsPanel warnings={dayWarnings} compact />}
          </div>
        </div>

        <div className="animate-slide-up-delay-3">
          <PublishPanel plan={plan} employees={employees} />
        </div>
      </main>
    </div>
  );
}

/* ─── Mini stat for day header ─────────────────────────────────────── */
const MiniStat = ({ label, value, color }: { label: string; value: string | number; color: string }) => {
  const cls =
    color === "success" ? "text-success" :
    color === "warning" ? "text-warning" :
    color === "danger"  ? "text-danger" :
    color === "primary" ? "text-primary" :
    "text-muted";

  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-center">
      <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
      <p className="text-[9px] font-medium text-muted uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
};
