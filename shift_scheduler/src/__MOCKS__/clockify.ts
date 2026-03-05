import { vi } from "vitest";

export const mockClockifyResponses = {
  workspaces: [
    { id: "ws-001", name: "Test Workspace" },
  ],
  users: [
    { id: "user-001", name: "Test User", email: "test@example.com" },
  ],
  timeEntry: {
    id: "te-001",
    description: "Scheduled shift",
    timeInterval: {
      start: "2025-01-06T09:00:00Z",
      end: "2025-01-06T17:00:00Z",
    },
  },
  projects: [] as { id: string; name: string; color: string }[],
  project: { id: "proj-001", name: "Shift - Test", color: "#4f46e5" },
};

/**
 * URL-aware mock that returns appropriate responses for different Clockify endpoints.
 * Handles projects (GET/POST) and time entries (POST).
 */
export const createRoutedMockFetch = () =>
  vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";
    const urlStr = String(url);

    // GET /projects → empty array (no existing projects)
    if (urlStr.includes("/projects") && method === "GET") {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockClockifyResponses.projects)),
      });
    }

    // POST /projects → newly created project
    if (urlStr.includes("/projects") && method === "POST") {
      return Promise.resolve({
        ok: true,
        status: 201,
        text: () => Promise.resolve(JSON.stringify(mockClockifyResponses.project)),
      });
    }

    // POST /time-entries → success
    if (urlStr.includes("/time-entries") && method === "POST") {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockClockifyResponses.timeEntry)),
      });
    }

    // Fallback
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({})),
    });
  });

export const createMockFetch = (overrides?: Partial<{
  status: number;
  body: unknown;
  ok: boolean;
}>) =>
  vi.fn().mockResolvedValue({
    ok: overrides?.ok ?? true,
    status: overrides?.status ?? 200,
    text: vi.fn().mockResolvedValue(JSON.stringify(overrides?.body ?? mockClockifyResponses.timeEntry)),
    json: vi.fn().mockResolvedValue(overrides?.body ?? mockClockifyResponses.timeEntry),
  });

export const createFailingFetch = (errorMessage = "Internal Server Error") =>
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: vi.fn().mockResolvedValue(errorMessage),
    json: vi.fn().mockResolvedValue({ error: errorMessage }),
  });
