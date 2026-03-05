import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseDemandCsv, parseRoster } from "@/lib/ingestion";
import { generatePlan } from "./index";

describe("end-to-end: CSV -> Plan", () => {
  it("loads sample data files and generates a valid plan", () => {
    const dataDir = path.resolve(__dirname, "../../../data");
    const csvText = fs.readFileSync(path.join(dataDir, "demand.csv"), "utf-8");
    const rosterJson = fs.readFileSync(path.join(dataDir, "roster.json"), "utf-8");

    const demand = parseDemandCsv(csvText);
    const employees = parseRoster(rosterJson);

    expect(demand.length).toBeGreaterThan(0);
    expect(employees.length).toBeGreaterThan(0);

    const plan = generatePlan(demand, employees);

    expect(plan.shifts.length).toBeGreaterThan(0);
    expect(plan.coverage).toHaveLength(demand.length);

    // Every coverage entry should have correct delta math
    plan.coverage.forEach((c) => {
      expect(c.delta).toBe(c.assigned - c.required);
    });

    // No shift should have end <= start
    plan.shifts.forEach((s) => {
      expect(new Date(s.end).getTime()).toBeGreaterThan(new Date(s.start).getTime());
    });

    // No per-employee overlaps in the generated plan
    const byEmployee = new Map<string, typeof plan.shifts>();
    plan.shifts.forEach((s) => {
      const list = byEmployee.get(s.employeeId) ?? [];
      list.push(s);
      byEmployee.set(s.employeeId, list);
    });

    for (const [, empShifts] of byEmployee) {
      const sorted = [...empShifts].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
      for (let i = 1; i < sorted.length; i++) {
        expect(new Date(sorted[i].start).getTime()).toBeGreaterThanOrEqual(
          new Date(sorted[i - 1].end).getTime(),
        );
      }
    }
  });
});
