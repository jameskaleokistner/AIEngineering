/**
 * Tests for the main chat page.
 *
 * Tests verify:
 * - Chat form renders and sends the correct payload to POST /chat
 * - SSE status updates are displayed in the log
 * - PDF iframe renders once the pipeline completes
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "../app/page";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal mock EventSource that fires messages synchronously. */
class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  /** Simulate an SSE message from the test. */
  emit(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  close() {}
}

beforeEach(() => {
  MockEventSource.instances = [];
  (global as unknown as Record<string, unknown>).EventSource = MockEventSource;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Chat form", () => {
  it("renders the message textarea and submit button", () => {
    render(<Home />);
    expect(screen.getByTestId("message-input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze/i })).toBeInTheDocument();
  });

  it("submit button is disabled when message is empty", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /analyze/i })).toBeDisabled();
  });

  it("sends message and files as FormData to POST /chat", async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ run_id: "abc123", dataset_name: "test" }),
    });
    global.fetch = mockFetch;

    render(<Home />);
    const textarea = screen.getByTestId("message-input");
    await userEvent.type(textarea, "analyze my sales");

    const file = new File(["a,b\n1,2"], "sales.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    fireEvent.submit(screen.getByTestId("chat-form"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/chat");
    expect(options.method).toBe("POST");

    const body = options.body as FormData;
    expect(body.get("message")).toBe("analyze my sales");
    expect((body.get("files") as File).name).toBe("sales.csv");
  });
});

describe("SSE status log", () => {
  it("displays status updates received from the SSE stream", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ run_id: "run1", dataset_name: "ds" }),
    });

    render(<Home />);
    await userEvent.type(screen.getByTestId("message-input"), "go");
    fireEvent.submit(screen.getByTestId("chat-form"));

    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));

    const es = MockEventSource.instances[0];
    act(() => {
      es.emit("[run1] status: cleaning_data");
      es.emit("[run1] status: analyzing_data");
    });

    await waitFor(() => {
      const log = screen.getByTestId("status-log");
      expect(log).toHaveTextContent("Cleaning Data");
      expect(log).toHaveTextContent("Analyzing Data");
    });
  });
});

describe("PDF display", () => {
  it("shows the PDF iframe once the pipeline sends 'done'", async () => {
    const pdfBlob = new Blob(["%PDF-1.4 fake"], { type: "application/pdf" });

    global.fetch = jest
      .fn()
      // First call: POST /chat
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run_id: "run2", dataset_name: "ds" }),
      })
      // Second call: GET /report/run2
      .mockResolvedValueOnce({ ok: true, blob: async () => pdfBlob });

    global.URL.createObjectURL = jest.fn(() => "blob:mock-url");

    render(<Home />);
    await userEvent.type(screen.getByTestId("message-input"), "make report");
    fireEvent.submit(screen.getByTestId("chat-form"));

    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    act(() => { MockEventSource.instances[0].emit("done"); });

    await waitFor(() => {
      expect(screen.getByTestId("pdf-iframe")).toBeInTheDocument();
      expect(screen.getByTestId("pdf-iframe")).toHaveAttribute("src", "blob:mock-url");
    });
  });
});
