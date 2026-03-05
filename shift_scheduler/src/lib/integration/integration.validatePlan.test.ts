import { describe, it, expect } from "vitest";
import { validatePlan } from "./index";
import type { Plan } from "@/types";

const basePlan: Plan = {
  shifts: [
    { employeeId: "emp-001", start: "2025-01-06T09:00:00Z", end: "2025-01-06T17:00:00Z", assigned: true },
  ],
  coverage: [],
  warnings: [],
};

describe("validatePlan", () => {
  it("passes for a valid plan", () => {
    const result = validatePlan(basePlan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects negative/zero duration shifts", () => {
    const plan: Plan = {
      ...basePlan,
      shifts: [
        { employeeId: "emp-001", start: "2025-01-06T17:00:00Z", end: "2025-01-06T09:00:00Z", assigned: true },
      ],
    };
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("invalid duration");
  });

  it("detects missing employeeId", () => {
    const plan: Plan = {
      ...basePlan,
      shifts: [
        { employeeId: "", start: "2025-01-06T09:00:00Z", end: "2025-01-06T17:00:00Z", assigned: true },
      ],
    };
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("missing employeeId");
  });

  it("detects overlapping shifts for the same employee", () => {
    const plan: Plan = {
      ...basePlan,
      shifts: [
        { employeeId: "emp-001", start: "2025-01-06T09:00:00Z", end: "2025-01-06T13:00:00Z", assigned: true },
        { employeeId: "emp-001", start: "2025-01-06T12:00:00Z", end: "2025-01-06T17:00:00Z", assigned: true },
      ],
    };
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("overlapping"))).toBe(true);
  });

  it("allows non-overlapping shifts for the same employee", () => {
    const plan: Plan = {
      ...basePlan,
      shifts: [
        { employeeId: "emp-001", start: "2025-01-06T09:00:00Z", end: "2025-01-06T13:00:00Z", assigned: true },
        { employeeId: "emp-001", start: "2025-01-06T13:00:00Z", end: "2025-01-06T17:00:00Z", assigned: true },
      ],
    };
    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
  });

  it("allows overlapping shifts for different employees", () => {
    const plan: Plan = {
      ...basePlan,
      shifts: [
        { employeeId: "emp-001", start: "2025-01-06T09:00:00Z", end: "2025-01-06T17:00:00Z", assigned: true },
        { employeeId: "emp-002", start: "2025-01-06T09:00:00Z", end: "2025-01-06T17:00:00Z", assigned: true },
      ],
    };
    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
  });
});
