import { parseISO, isBefore } from "date-fns";
import type { Plan, Shift, PublishResult, ValidationResult, Employee, AvailabilityWindow } from "@/types";

const CLOCKIFY_BASE = "https://api.clockify.me/api/v1";

type ClockifyWorkspace = { id: string; name: string };
type ClockifyUser = { id: string; name: string; email: string };
type ClockifyProject = { id: string; name: string; color: string };
type ClockifyTimeEntry = { id: string; description: string; timeInterval: { start: string; end: string } };

const EMPLOYEE_COLORS = [
  "#4f46e5", "#7c3aed", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#db2777", "#2563eb", "#0d9488", "#ca8a04",
];

export class ClockifyClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.CLOCKIFY_API_KEY;
    if (!key) throw new Error("CLOCKIFY_API_KEY is not configured");
    this.apiKey = key.trim();
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${CLOCKIFY_BASE}${path}`;
    console.log(`[Clockify] ${options.method ?? "GET"} ${url}`);
    if (options.body) {
      console.log(`[Clockify] Payload: ${options.body}`);
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const text = await res.text();
    console.log(`[Clockify] Response ${res.status}: ${text.slice(0, 500)}`);

    if (!res.ok) {
      throw new Error(`Clockify API ${res.status}: ${text}`);
    }

    return text ? JSON.parse(text) : ({} as T);
  }

  async getWorkspaces(): Promise<ClockifyWorkspace[]> {
    return this.request<ClockifyWorkspace[]>("/workspaces");
  }

  async getUsers(workspaceId: string): Promise<ClockifyUser[]> {
    return this.request<ClockifyUser[]>(`/workspaces/${workspaceId}/users`);
  }

  async getProjects(workspaceId: string): Promise<ClockifyProject[]> {
    return this.request<ClockifyProject[]>(`/workspaces/${workspaceId}/projects`);
  }

  /** Create a project with a specific color. Returns existing project if name matches.
   *  Pass `existing` to avoid an extra GET /projects round-trip when batching. */
  async ensureProject(
    workspaceId: string,
    name: string,
    color: string,
    existing?: ClockifyProject[],
  ): Promise<ClockifyProject> {
    const projects = existing ?? await this.getProjects(workspaceId);
    const found = projects.find((p) => p.name === name);
    if (found) return found;

    return this.request<ClockifyProject>(
      `/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        body: JSON.stringify({ name, color, isPublic: true }),
      },
    );
  }

  async createTimeEntry(
    workspaceId: string,
    entry: { start: string; end: string; description?: string; projectId?: string },
  ): Promise<ClockifyTimeEntry> {
    return this.request<ClockifyTimeEntry>(
      `/workspaces/${workspaceId}/time-entries`,
      {
        method: "POST",
        body: JSON.stringify({
          start: entry.start,
          end: entry.end,
          description: entry.description ?? "Scheduled shift",
          ...(entry.projectId ? { projectId: entry.projectId } : {}),
        }),
      },
    );
  }

  async getTimeEntries(
    workspaceId: string,
    userId: string,
    params?: { description?: string; pageSize?: number; page?: number },
  ): Promise<ClockifyTimeEntry[]> {
    const qs = new URLSearchParams();
    if (params?.description) qs.set("description", params.description);
    qs.set("page-size", String(params?.pageSize ?? 200));
    qs.set("page", String(params?.page ?? 1));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<ClockifyTimeEntry[]>(
      `/workspaces/${workspaceId}/user/${userId}/time-entries${query}`,
    );
  }

  async deleteTimeEntry(workspaceId: string, entryId: string): Promise<void> {
    await this.request<void>(
      `/workspaces/${workspaceId}/time-entries/${entryId}`,
      { method: "DELETE" },
    );
  }
}

const DEFAULT_AVAILABILITY: AvailabilityWindow[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  dayOfWeek: day,
  startHour: 6,
  endHour: 22,
}));

export const clockifyUsersToEmployees = (
  users: { id: string; name: string; email: string }[],
): Employee[] =>
  users.map((u) => ({
    employeeId: u.id,
    name: (u.name || u.email).replace(/^\[SAMPLE\] /, ""),
    availability: DEFAULT_AVAILABILITY,
    maxHoursPerDay: 8,
    maxHoursPerWeek: 168,
  }));

export const validatePlan = (plan: Plan): ValidationResult => {
  const errors: string[] = [];

  plan.shifts.forEach((shift, idx) => {
    const start = parseISO(shift.start);
    const end = parseISO(shift.end);

    if (isBefore(end, start) || start.getTime() === end.getTime()) {
      errors.push(`Shift ${idx}: invalid duration (end <= start)`);
    }

    if (!shift.employeeId) {
      errors.push(`Shift ${idx}: missing employeeId`);
    }
  });

  const byEmployee = new Map<string, Shift[]>();
  plan.shifts.forEach((s) => {
    const list = byEmployee.get(s.employeeId) ?? [];
    list.push(s);
    byEmployee.set(s.employeeId, list);
  });

  for (const [empId, empShifts] of byEmployee) {
    const sorted = empShifts.sort(
      (a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (parseISO(curr.start).getTime() < parseISO(prev.end).getTime()) {
        errors.push(
          `Employee ${empId}: overlapping shifts (${prev.start} - ${prev.end}) and (${curr.start} - ${curr.end})`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Publish plan to Clockify. Uses employee names in descriptions.
 * Creates a colored project per employee so shifts appear color-coded in Clockify.
 */
export const publishPlan = async (
  plan: Plan,
  workspaceId: string,
  employeeNames?: Map<string, string>,
  apiKey?: string,
): Promise<PublishResult[]> => {
  const validation = validatePlan(plan);
  if (!validation.valid) {
    return plan.shifts.map((_, i) => ({
      shiftIndex: i,
      success: false,
      error: `Validation failed: ${validation.errors.join("; ")}`,
    }));
  }

  const client = new ClockifyClient(apiKey);
  const names = employeeNames ?? new Map<string, string>();

  // Create a colored project per unique employee for visual distinction
  const projectCache = new Map<string, string>();
  const uniqueEmployees = [...new Set(plan.shifts.map((s) => s.employeeId))];

  // Fetch existing projects once, then create/reuse in parallel
  let existingProjects: ClockifyProject[] = [];
  try { existingProjects = await client.getProjects(workspaceId); } catch { /* non-fatal */ }

  await Promise.allSettled(
    uniqueEmployees.map(async (empId, i) => {
      const empName = names.get(empId) ?? empId;
      const color = EMPLOYEE_COLORS[i % EMPLOYEE_COLORS.length];
      try {
        const project = await client.ensureProject(workspaceId, `Shift - ${empName}`, color, existingProjects);
        projectCache.set(empId, project.id);
      } catch { /* non-fatal: shifts will just lack a project/color */ }
    }),
  );

  const results: PublishResult[] = [];

  for (let i = 0; i < plan.shifts.length; i++) {
    const shift = plan.shifts[i];
    const empName = names.get(shift.employeeId) ?? shift.employeeId;
    try {
      const entry = await client.createTimeEntry(workspaceId, {
        start: shift.start,
        end: shift.end,
        description: `Scheduled shift for ${empName}`,
        projectId: projectCache.get(shift.employeeId),
      });
      results.push({ shiftIndex: i, success: true, clockifyId: entry.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ shiftIndex: i, success: false, error: message });
    }
  }

  return results;
};

/**
 * Delete all "Scheduled shift" time entries across every user in the workspace.
 * Returns the count of successfully deleted entries.
 */
export const clearShifts = async (
  workspaceId: string,
  apiKey?: string,
): Promise<{ deleted: number; failed: number }> => {
  const client = new ClockifyClient(apiKey);
  const users = await client.getUsers(workspaceId);

  let deleted = 0;
  let failed = 0;

  for (const user of users) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const entries = await client.getTimeEntries(workspaceId, user.id, {
        description: "Scheduled shift",
        pageSize: 200,
        page,
      });

      const settled = await Promise.allSettled(
        entries.map((entry) => client.deleteTimeEntry(workspaceId, entry.id)),
      );
      for (const r of settled) {
        if (r.status === "fulfilled") deleted++;
        else failed++;
      }

      hasMore = entries.length === 200;
      page++;
    }
  }

  return { deleted, failed };
};
