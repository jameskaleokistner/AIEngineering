import { describe, it, expect } from "vitest";
import { checkConstraints } from "./index";
import type { Employee, Shift } from "@/types";

// Monday availability 8-17
const employee: Employee = {
  employeeId: "emp-001",
  name: "Alice",
  availability: [{ dayOfWeek: 1, startHour: 8, endHour: 17 }],
  maxHoursPerDay: 8,
  maxHoursPerWeek: 40,
};

// Monday Jan 6 2025 is a Monday (dayOfWeek=1)
const monday = (hour: number) => new Date(`2025-01-06T${String(hour).padStart(2, "0")}:00:00Z`);

describe("checkConstraints", () => {
  it("allows a valid shift within availability", () => {
    const result = checkConstraints(employee, monday(9), monday(12), []);
    expect(result.valid).toBe(true);
  });

  it("rejects a shift outside availability hours", () => {
    const result = checkConstraints(employee, monday(6), monday(9), []);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not available");
  });

  it("rejects a shift on an unavailable day", () => {
    // Tuesday Jan 7
    const tue = (h: number) => new Date(`2025-01-07T${String(h).padStart(2, "0")}:00:00Z`);
    const result = checkConstraints(employee, tue(9), tue(12), []);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not available");
  });

  it("rejects when exceeding max hours/day", () => {
    const existing: Shift[] = [
      { employeeId: "emp-001", start: monday(8).toISOString(), end: monday(14).toISOString(), assigned: true },
    ];
    // 6h existing + 3h proposed = 9h > 8h max
    const result = checkConstraints(employee, monday(14), monday(17), existing);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("max");
    expect(result.reason).toContain("day");
  });

  it("rejects when exceeding max hours/week", () => {
    // Raise daily limit so we only hit the weekly cap
    const weekEmployee: Employee = { ...employee, maxHoursPerDay: 12, maxHoursPerWeek: 10 };
    const existing: Shift[] = [
      { employeeId: "emp-001", start: monday(8).toISOString(), end: monday(16).toISOString(), assigned: true },
    ];
    // 8h existing + 1h proposed = 9h <= 10h/week, valid
    const result = checkConstraints(weekEmployee, monday(16), monday(17), existing);
    expect(result.valid).toBe(true);

    // Add a second day so total = 11h, then +1 = 12 > 10
    const existing2: Shift[] = [
      { employeeId: "emp-001", start: monday(8).toISOString(), end: monday(16).toISOString(), assigned: true },
      { employeeId: "emp-001", start: "2025-01-13T08:00:00Z", end: "2025-01-13T11:00:00Z", assigned: true },
    ];
    const result2 = checkConstraints(weekEmployee, monday(16), monday(17), existing2);
    expect(result2.valid).toBe(false);
    expect(result2.reason).toContain("week");
  });

  it("rejects overlapping shifts", () => {
    const existing: Shift[] = [
      { employeeId: "emp-001", start: monday(9).toISOString(), end: monday(12).toISOString(), assigned: true },
    ];
    const result = checkConstraints(employee, monday(11), monday(14), existing);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("overlap");
  });

  it("allows adjacent non-overlapping shifts", () => {
    const existing: Shift[] = [
      { employeeId: "emp-001", start: monday(8).toISOString(), end: monday(12).toISOString(), assigned: true },
    ];
    const result = checkConstraints(employee, monday(12), monday(16), existing);
    expect(result.valid).toBe(true);
  });
});
