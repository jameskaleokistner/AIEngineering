import { describe, it, expect } from "vitest";
import { generatePlan } from "./index";
import type { DemandPoint, Employee } from "@/types";

// Monday Jan 6 2025 (dayOfWeek=1)
const makeDemand = (hours: number[], headcount: number): DemandPoint[] =>
  hours.map((h) => ({
    timestamp: `2025-01-06T${String(h).padStart(2, "0")}:00:00Z`,
    requiredHeadcount: headcount,
  }));

const employees: Employee[] = [
  {
    employeeId: "emp-001",
    name: "Alice",
    availability: [{ dayOfWeek: 1, startHour: 6, endHour: 18 }],
    maxHoursPerDay: 8,
    maxHoursPerWeek: 40,
  },
  {
    employeeId: "emp-002",
    name: "Bob",
    availability: [{ dayOfWeek: 1, startHour: 8, endHour: 20 }],
    maxHoursPerDay: 10,
    maxHoursPerWeek: 40,
  },
];

describe("generatePlan", () => {
  it("generates shifts that cover demand", () => {
    const demand = makeDemand([9, 10, 11], 1);
    const plan = generatePlan(demand, employees);

    expect(plan.shifts.length).toBeGreaterThan(0);
    plan.coverage.forEach((c) => {
      expect(c.assigned).toBeGreaterThanOrEqual(c.required);
    });
  });

  it("reports no warnings when demand is fully covered", () => {
    const demand = makeDemand([9, 10], 1);
    const plan = generatePlan(demand, employees);

    expect(plan.warnings).toHaveLength(0);
  });

  it("generates warnings for under-covered slots", () => {
    // Require 20 people but only 2 employees available
    const demand = makeDemand([9], 20);
    const plan = generatePlan(demand, employees);

    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings[0]).toContain("under by");
  });

  it("respects maxHoursPerDay constraint", () => {
    const demand = makeDemand([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], 1);
    const plan = generatePlan(demand, [employees[0]]); // Alice: max 8h/day

    const aliceShifts = plan.shifts.filter((s) => s.employeeId === "emp-001");
    const totalHours = aliceShifts.reduce((sum, s) => {
      const start = new Date(s.start).getTime();
      const end = new Date(s.end).getTime();
      return sum + (end - start) / 3_600_000;
    }, 0);

    expect(totalHours).toBeLessThanOrEqual(8);
  });

  it("prefers contiguous shifts (merge fragments)", () => {
    const demand = makeDemand([9, 10, 11, 12], 1);
    const plan = generatePlan(demand, [employees[0]]);

    const aliceShifts = plan.shifts.filter((s) => s.employeeId === "emp-001");
    // Should be merged into 1 contiguous shift, not 4 separate ones
    expect(aliceShifts.length).toBe(1);
    const start = new Date(aliceShifts[0].start).getTime();
    const end = new Date(aliceShifts[0].end).getTime();
    expect((end - start) / 3_600_000).toBe(4);
  });

  it("computes coverage deltas correctly", () => {
    const demand = makeDemand([9, 10], 2);
    const plan = generatePlan(demand, employees);

    expect(plan.coverage).toHaveLength(2);
    plan.coverage.forEach((c) => {
      expect(c.delta).toBe(c.assigned - c.required);
    });
  });
});
