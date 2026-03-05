import { describe, it, expect } from "vitest";
import { parseDemandCsv } from "./index";

describe("parseDemandCsv", () => {
  it("parses a valid CSV with all columns", () => {
    const csv = `timestamp,required_headcount,skill
2025-01-06T09:00:00Z,5,general
2025-01-06T10:00:00Z,7,technical`;

    const result = parseDemandCsv(csv);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      timestamp: "2025-01-06T09:00:00Z",
      requiredHeadcount: 5,
      skill: "general",
      queue: undefined,
    });
    expect(result[1].requiredHeadcount).toBe(7);
    expect(result[1].skill).toBe("technical");
  });

  it("handles CSV with only required columns", () => {
    const csv = `timestamp,required_headcount
2025-01-06T09:00:00Z,3`;

    const result = parseDemandCsv(csv);

    expect(result).toHaveLength(1);
    expect(result[0].skill).toBeUndefined();
    expect(result[0].queue).toBeUndefined();
  });

  it("throws on missing timestamp column", () => {
    const csv = `required_headcount,skill
5,general`;

    expect(() => parseDemandCsv(csv)).toThrow("missing 'timestamp'");
  });

  it("throws on missing required_headcount column", () => {
    const csv = `timestamp,skill
2025-01-06T09:00:00Z,general`;

    expect(() => parseDemandCsv(csv)).toThrow("missing 'required_headcount'");
  });

  it("throws on invalid headcount value", () => {
    const csv = `timestamp,required_headcount
2025-01-06T09:00:00Z,abc`;

    expect(() => parseDemandCsv(csv)).toThrow("invalid 'required_headcount'");
  });

  it("throws on negative headcount", () => {
    const csv = `timestamp,required_headcount
2025-01-06T09:00:00Z,-3`;

    expect(() => parseDemandCsv(csv)).toThrow("invalid 'required_headcount'");
  });

  it("handles empty CSV body (header only)", () => {
    const csv = `timestamp,required_headcount`;

    const result = parseDemandCsv(csv);
    expect(result).toHaveLength(0);
  });
});
