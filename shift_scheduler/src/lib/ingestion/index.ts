import Papa from "papaparse";
import type { DemandPoint, Employee, AvailabilityWindow } from "@/types";

type DemandRow = {
  timestamp?: string;
  required_headcount?: string;
  volume?: string;
  skill?: string;
  queue?: string;
};

export const parseDemandCsv = (csvText: string): DemandPoint[] => {
  const result = Papa.parse<DemandRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    const messages = result.errors.map((e) => `Row ${e.row}: ${e.message}`);
    throw new Error(`CSV parse errors: ${messages.join("; ")}`);
  }

  return result.data.reduce<DemandPoint[]>((acc, row, idx) => {
    if (!row.timestamp) {
      throw new Error(`Row ${idx + 1}: missing 'timestamp' column`);
    }
    if (!row.required_headcount) {
      throw new Error(`Row ${idx + 1}: missing 'required_headcount' column`);
    }
    const headcount = Number(row.required_headcount);
    if (Number.isNaN(headcount) || headcount < 0) {
      throw new Error(`Row ${idx + 1}: invalid 'required_headcount' value "${row.required_headcount}"`);
    }

    const volume = row.volume ? Number(row.volume) : undefined;

    acc.push({
      timestamp: row.timestamp,
      requiredHeadcount: headcount,
      volume: volume && !Number.isNaN(volume) ? volume : undefined,
      skill: row.skill || undefined,
      queue: row.queue || undefined,
    });
    return acc;
  }, []);
};

const isAvailabilityWindow = (w: unknown): w is AvailabilityWindow => {
  if (typeof w !== "object" || w === null) return false;
  const obj = w as Record<string, unknown>;
  return (
    typeof obj.dayOfWeek === "number" &&
    obj.dayOfWeek >= 0 &&
    obj.dayOfWeek <= 6 &&
    typeof obj.startHour === "number" &&
    typeof obj.endHour === "number" &&
    obj.startHour >= 0 &&
    obj.endHour <= 24 &&
    obj.startHour < obj.endHour
  );
};

export const parseRoster = (json: string): Employee[] => {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("Roster must be a JSON array");
  }

  return parsed.map((entry: unknown, idx: number) => {
    const e = entry as Record<string, unknown>;
    if (!e.employeeId || typeof e.employeeId !== "string") {
      throw new Error(`Employee ${idx}: missing or invalid 'employeeId'`);
    }
    if (!e.name || typeof e.name !== "string") {
      throw new Error(`Employee ${idx}: missing or invalid 'name'`);
    }
    if (!Array.isArray(e.availability) || !e.availability.every(isAvailabilityWindow)) {
      throw new Error(`Employee ${idx}: invalid 'availability' windows`);
    }
    if (typeof e.maxHoursPerDay !== "number" || e.maxHoursPerDay <= 0) {
      throw new Error(`Employee ${idx}: invalid 'maxHoursPerDay'`);
    }
    if (typeof e.maxHoursPerWeek !== "number" || e.maxHoursPerWeek <= 0) {
      throw new Error(`Employee ${idx}: invalid 'maxHoursPerWeek'`);
    }

    return {
      employeeId: e.employeeId,
      name: e.name,
      availability: e.availability as AvailabilityWindow[],
      maxHoursPerDay: e.maxHoursPerDay,
      maxHoursPerWeek: e.maxHoursPerWeek,
    };
  });
};
