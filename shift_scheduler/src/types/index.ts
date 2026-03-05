export type AvailabilityWindow = {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  startHour: number;
  endHour: number;
};

export type DemandPoint = {
  timestamp: string; // ISO 8601
  requiredHeadcount: number;
  volume?: number; // raw demand volume (e.g. cookie count); headcount = ceil(volume / COOKIES_PER_WORKER)
  skill?: string;
  queue?: string;
};

export type Employee = {
  employeeId: string;
  name: string;
  availability: AvailabilityWindow[];
  maxHoursPerDay: number;
  maxHoursPerWeek: number;
};

export type Shift = {
  employeeId: string;
  start: string; // ISO 8601 for serialization
  end: string;
  assigned: boolean;
};

export type CoverageInterval = {
  timestamp: string;
  required: number;
  assigned: number;
  delta: number; // assigned - required (positive = over, negative = under)
};

export type Plan = {
  shifts: Shift[];
  coverage: CoverageInterval[];
  warnings: string[];
};

export type PlanConfig = {
  minShiftHours: number;
  maxShiftHours: number;
  intervalMinutes: number; // granularity of demand intervals (default 60)
};

export type PublishResult = {
  shiftIndex: number;
  success: boolean;
  clockifyId?: string;
  error?: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};
