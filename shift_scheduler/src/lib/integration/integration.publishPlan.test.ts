import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { publishPlan } from "./index";
import { createMockFetch, createRoutedMockFetch, mockClockifyResponses } from "@/__MOCKS__/clockify";
import type { Plan } from "@/types";

const validPlan: Plan = {
  shifts: [
    { employeeId: "emp-001", start: "2025-01-06T09:00:00Z", end: "2025-01-06T17:00:00Z", assigned: true },
    { employeeId: "emp-002", start: "2025-01-06T09:00:00Z", end: "2025-01-06T17:00:00Z", assigned: true },
  ],
  coverage: [],
  warnings: [],
};

const invalidPlan: Plan = {
  shifts: [
    { employeeId: "", start: "2025-01-06T09:00:00Z", end: "2025-01-06T17:00:00Z", assigned: true },
  ],
  coverage: [],
  warnings: [],
};

describe("publishPlan", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("CLOCKIFY_API_KEY", "test-api-key-1234");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns validation errors without calling API if plan is invalid", async () => {
    global.fetch = createMockFetch();
    const results = await publishPlan(invalidPlan, "ws-001");

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("Validation failed");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("publishes all shifts successfully", async () => {
    global.fetch = createRoutedMockFetch();
    const results = await publishPlan(validPlan, "ws-001");

    expect(results).toHaveLength(2);
    results.forEach((r) => {
      expect(r.success).toBe(true);
      expect(r.clockifyId).toBe("te-001");
    });
  });

  it("uses employee names in descriptions", async () => {
    global.fetch = createRoutedMockFetch();
    const nameMap = new Map([
      ["emp-001", "Alice"],
      ["emp-002", "Bob"],
    ]);
    await publishPlan(validPlan, "ws-001", nameMap);

    const timeEntryCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url, opts]: [string, RequestInit | undefined]) =>
        String(url).includes("/time-entries") && opts?.method === "POST",
    );

    expect(timeEntryCalls.length).toBe(2);
    const body0 = JSON.parse(timeEntryCalls[0][1].body as string);
    const body1 = JSON.parse(timeEntryCalls[1][1].body as string);
    expect(body0.description).toContain("Alice");
    expect(body1.description).toContain("Bob");
  });

  it("handles API failures per shift", async () => {
    let timeEntryCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const method = options?.method ?? "GET";
      const urlStr = String(url);

      // Projects endpoints always succeed
      if (urlStr.includes("/projects") && method === "GET") {
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([])),
        });
      }
      if (urlStr.includes("/projects") && method === "POST") {
        return Promise.resolve({
          ok: true, status: 201,
          text: () => Promise.resolve(JSON.stringify(mockClockifyResponses.project)),
        });
      }

      // Time entries: first succeeds, second fails
      if (urlStr.includes("/time-entries") && method === "POST") {
        timeEntryCount++;
        if (timeEntryCount === 1) {
          return Promise.resolve({
            ok: true, status: 200,
            text: () => Promise.resolve(JSON.stringify(mockClockifyResponses.timeEntry)),
          });
        }
        return Promise.resolve({
          ok: false, status: 500,
          text: () => Promise.resolve("Server Error"),
        });
      }

      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      });
    });

    const results = await publishPlan(validPlan, "ws-001");

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toContain("500");
  });
});
