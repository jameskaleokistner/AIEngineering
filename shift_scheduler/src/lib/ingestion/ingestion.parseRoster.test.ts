import { describe, it, expect } from "vitest";
import { parseRoster } from "./index";

const validEmployee = {
  employeeId: "emp-001",
  name: "Alice",
  availability: [{ dayOfWeek: 1, startHour: 8, endHour: 17 }],
  maxHoursPerDay: 8,
  maxHoursPerWeek: 40,
};

describe("parseRoster", () => {
  it("parses a valid roster array", () => {
    const json = JSON.stringify([validEmployee]);
    const result = parseRoster(json);

    expect(result).toHaveLength(1);
    expect(result[0].employeeId).toBe("emp-001");
    expect(result[0].name).toBe("Alice");
    expect(result[0].availability).toHaveLength(1);
  });

  it("throws if input is not an array", () => {
    expect(() => parseRoster(JSON.stringify({}))).toThrow("must be a JSON array");
  });

  it("throws on missing employeeId", () => {
    const bad = { ...validEmployee, employeeId: undefined };
    expect(() => parseRoster(JSON.stringify([bad]))).toThrow("employeeId");
  });

  it("throws on missing name", () => {
    const bad = { ...validEmployee, name: undefined };
    expect(() => parseRoster(JSON.stringify([bad]))).toThrow("name");
  });

  it("throws on invalid availability window (startHour >= endHour)", () => {
    const bad = {
      ...validEmployee,
      availability: [{ dayOfWeek: 1, startHour: 17, endHour: 8 }],
    };
    expect(() => parseRoster(JSON.stringify([bad]))).toThrow("availability");
  });

  it("throws on invalid maxHoursPerDay", () => {
    const bad = { ...validEmployee, maxHoursPerDay: -1 };
    expect(() => parseRoster(JSON.stringify([bad]))).toThrow("maxHoursPerDay");
  });

  it("throws on invalid maxHoursPerWeek", () => {
    const bad = { ...validEmployee, maxHoursPerWeek: 0 };
    expect(() => parseRoster(JSON.stringify([bad]))).toThrow("maxHoursPerWeek");
  });

  it("parses multiple employees", () => {
    const roster = [
      validEmployee,
      { ...validEmployee, employeeId: "emp-002", name: "Bob" },
    ];
    const result = parseRoster(JSON.stringify(roster));
    expect(result).toHaveLength(2);
    expect(result[1].employeeId).toBe("emp-002");
  });
});
