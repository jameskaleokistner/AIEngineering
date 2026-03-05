import {
  parseISO,
  addHours,
  isBefore,
  isEqual,
  differenceInHours,
} from "date-fns";
import type {
  DemandPoint,
  Employee,
  Shift,
  Plan,
  PlanConfig,
  CoverageInterval,
} from "@/types";
import { UTC_DAYS } from "@/lib/constants";

const DEFAULT_CONFIG: PlanConfig = {
  minShiftHours: 4,
  maxShiftHours: 10,
  intervalMinutes: 60,
};

type ConstraintResult = { valid: boolean; reason?: string };

const utcDayOfWeek = (d: Date) => d.getUTCDay();
const utcHour = (d: Date) => d.getUTCHours();

const utcStartOfDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const formatUTC = (d: Date) => {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${UTC_DAYS[d.getUTCDay()]} ${hh}:${mm}`;
};

const formatUTCDate = (d: Date) => {
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${UTC_DAYS[d.getUTCDay()]} ${mo}/${dd} ${hh}:${mm}`;
};

/** Check whether an employee is available at a specific hour on a given date */
const isAvailableAt = (employee: Employee, date: Date): boolean => {
  const dow = utcDayOfWeek(date);
  const hour = utcHour(date);
  return employee.availability.some(
    (w) => w.dayOfWeek === dow && hour >= w.startHour && hour < w.endHour,
  );
};

/** Total assigned hours for an employee on a specific UTC calendar day */
const hoursOnDay = (shifts: Shift[], employeeId: string, date: Date): number => {
  const dayStart = utcStartOfDay(date).getTime();
  const dayEnd = dayStart + 24 * 3_600_000;
  return shifts
    .filter((s) => s.employeeId === employeeId)
    .reduce((total, s) => {
      const sStart = Math.max(parseISO(s.start).getTime(), dayStart);
      const sEnd = Math.min(parseISO(s.end).getTime(), dayEnd);
      return sEnd > sStart ? total + (sEnd - sStart) / 3_600_000 : total;
    }, 0);
};

/** Total assigned hours for an employee in the entire plan */
const hoursInWeek = (shifts: Shift[], employeeId: string): number =>
  shifts
    .filter((s) => s.employeeId === employeeId)
    .reduce((total, s) => total + differenceInHours(parseISO(s.end), parseISO(s.start)), 0);

/** Check if employee already covers a time slot */
const coversSlot = (shifts: Shift[], employeeId: string, slotStart: Date): boolean =>
  shifts.some((s) => {
    if (s.employeeId !== employeeId) return false;
    const sStart = parseISO(s.start).getTime();
    const sEnd = parseISO(s.end).getTime();
    return slotStart.getTime() >= sStart && slotStart.getTime() < sEnd;
  });

export const checkConstraints = (
  employee: Employee,
  proposedStart: Date,
  proposedEnd: Date,
  existingShifts: Shift[],
): ConstraintResult => {
  // Availability check for every hour in the proposed range
  let cursor = new Date(proposedStart);
  while (isBefore(cursor, proposedEnd)) {
    if (!isAvailableAt(employee, cursor)) {
      return { valid: false, reason: `not available at ${formatUTC(cursor)}` };
    }
    cursor = addHours(cursor, 1);
  }

  // Max hours/day
  const proposedHours = differenceInHours(proposedEnd, proposedStart);
  const existingDayHours = hoursOnDay(existingShifts, employee.employeeId, proposedStart);
  if (existingDayHours + proposedHours > employee.maxHoursPerDay) {
    return { valid: false, reason: `exceeds max ${employee.maxHoursPerDay}h/day (already ${existingDayHours}h)` };
  }

  // Max hours/week
  const existingWeekHours = hoursInWeek(existingShifts, employee.employeeId);
  if (existingWeekHours + proposedHours > employee.maxHoursPerWeek) {
    return { valid: false, reason: `exceeds max ${employee.maxHoursPerWeek}h/week (already ${existingWeekHours}h)` };
  }

  // Overlap check
  const pStart = proposedStart.getTime();
  const pEnd = proposedEnd.getTime();
  const overlapping = existingShifts.find((s) => {
    if (s.employeeId !== employee.employeeId) return false;
    const sStart = parseISO(s.start).getTime();
    const sEnd = parseISO(s.end).getTime();
    return pStart < sEnd && pEnd > sStart;
  });
  if (overlapping) {
    return { valid: false, reason: "overlaps existing shift" };
  }

  return { valid: true };
};

/**
 * Try to extend an existing shift for this employee to cover the slot,
 * returns the updated shift or null if extension isn't possible.
 */
const tryExtendShift = (
  employee: Employee,
  slotStart: Date,
  existingShifts: Shift[],
  maxShiftHours: number,
): Shift | null => {
  const slotEnd = addHours(slotStart, 1);

  for (const shift of existingShifts) {
    if (shift.employeeId !== employee.employeeId) continue;
    const shiftEnd = parseISO(shift.end);
    const shiftStart = parseISO(shift.start);
    const currentLength = differenceInHours(shiftEnd, shiftStart);

    if (isEqual(shiftEnd, slotStart) && currentLength < maxShiftHours) {
      const check = checkConstraints(employee, shiftStart, slotEnd, existingShifts.filter((s) => s !== shift));
      if (check.valid) {
        return { ...shift, end: slotEnd.toISOString() };
      }
    }
  }
  return null;
};

export const generatePlan = (
  demand: DemandPoint[],
  employees: Employee[],
  config: Partial<PlanConfig> = {},
): Plan => {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const shifts: Shift[] = [];
  const warnings: string[] = [];

  const sorted = [...demand].sort(
    (a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime(),
  );

  for (const dp of sorted) {
    const slotStart = parseISO(dp.timestamp);
    let assigned = 0;

    for (const emp of employees) {
      if (coversSlot(shifts, emp.employeeId, slotStart)) {
        assigned++;
      }
    }

    const needed = dp.requiredHeadcount - assigned;
    if (needed <= 0) continue;

    const rejectionReasons: string[] = [];
    let filled = 0;

    for (const emp of employees) {
      if (filled >= needed) break;
      if (coversSlot(shifts, emp.employeeId, slotStart)) continue;

      // Try extending an existing adjacent shift first (contiguous preference)
      const extended = tryExtendShift(emp, slotStart, shifts, cfg.maxShiftHours);
      if (extended) {
        const idx = shifts.findIndex(
          (s) => s.employeeId === emp.employeeId && s.end === slotStart.toISOString(),
        );
        if (idx !== -1) {
          shifts[idx] = extended;
          filled++;
          continue;
        }
      }

      // Create a new 1-hour shift
      const slotEnd = addHours(slotStart, 1);
      const result = checkConstraints(emp, slotStart, slotEnd, shifts);
      if (result.valid) {
        shifts.push({
          employeeId: emp.employeeId,
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          assigned: true,
        });
        filled++;
      } else if (result.reason) {
        rejectionReasons.push(`${emp.name}: ${result.reason}`);
      }
    }

    if (filled < needed) {
      warnings.push(
        `${formatUTCDate(slotStart)} under by ${needed - filled} — ${rejectionReasons.join(", ") || "no available employees"}`,
      );
    }
  }

  const mergedShifts = mergeFragments(shifts, cfg);
  const coverage = computeCoverage(sorted, mergedShifts);

  return { shifts: mergedShifts, coverage, warnings };
};

/** Merge adjacent 1-hour fragments into longer contiguous shifts */
const mergeFragments = (shifts: Shift[], cfg: PlanConfig): Shift[] => {
  const byEmployee = new Map<string, Shift[]>();
  for (const s of shifts) {
    const list = byEmployee.get(s.employeeId) ?? [];
    list.push(s);
    byEmployee.set(s.employeeId, list);
  }

  const merged: Shift[] = [];
  for (const [, empShifts] of byEmployee) {
    const sorted = empShifts.sort(
      (a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime(),
    );

    let current = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const currentEnd = parseISO(current.end).getTime();
      const nextStart = parseISO(next.start).getTime();
      const mergedLength = differenceInHours(parseISO(next.end), parseISO(current.start));

      if (currentEnd === nextStart && mergedLength <= cfg.maxShiftHours) {
        current.end = next.end;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  }

  return merged.sort(
    (a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime(),
  );
};

/** Compute per-interval coverage stats */
const computeCoverage = (demand: DemandPoint[], shifts: Shift[]): CoverageInterval[] =>
  demand.map((dp) => {
    const slotStart = parseISO(dp.timestamp).getTime();
    const slotEnd = addHours(parseISO(dp.timestamp), 1).getTime();
    const assigned = shifts.filter((s) => {
      const sStart = parseISO(s.start).getTime();
      const sEnd = parseISO(s.end).getTime();
      return sStart < slotEnd && sEnd > slotStart;
    }).length;

    return {
      timestamp: dp.timestamp,
      required: dp.requiredHeadcount,
      assigned,
      delta: assigned - dp.requiredHeadcount,
    };
  });
