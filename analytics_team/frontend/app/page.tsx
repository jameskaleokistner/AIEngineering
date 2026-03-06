"use client";

import { useCallback, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Stage = "idle" | "submitting" | "running" | "done" | "error";

export default function Home() {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const appendLog = (line: string) => {
    setStatusLog((prev) => [...prev, line]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const handleFiles = (incoming: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setStage("submitting");
    setStatusLog([]);
    setPdfUrl(null);

    const form = new FormData();
    form.append("message", message);
    files.forEach((f) => form.append("files", f));

    try {
      const res = await fetch(`${API_BASE}/chat`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`POST /chat failed: ${res.status}`);
      const { run_id } = await res.json();
      setRunId(run_id);
      setStage("running");
      appendLog("Pipeline started…");
      subscribeToStatus(run_id);
    } catch (err) {
      appendLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setStage("error");
    }
  };

  const subscribeToStatus = (id: string) => {
    const es = new EventSource(`${API_BASE}/status/${id}`);

    es.onmessage = async (event) => {
      const line: string = event.data;

      if (line === "done" || line === "timeout") {
        es.close();
        if (line === "done") {
          appendLog("Pipeline complete. Fetching report…");
          try {
            const pdfRes = await fetch(`${API_BASE}/report/${id}`);
            if (!pdfRes.ok) throw new Error("Report not ready.");
            const blob = await pdfRes.blob();
            setPdfUrl(URL.createObjectURL(blob));
            setStage("done");
            appendLog("Report ready.");
          } catch (err) {
            appendLog(`Could not load report: ${err instanceof Error ? err.message : String(err)}`);
            setStage("error");
          }
        } else {
          appendLog("Pipeline timed out.");
          setStage("error");
        }
        return;
      }

      // Map internal log tokens to friendly messages
      const friendly = line
        .replace(/.*status:\s*/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      appendLog(friendly);
    };

    es.onerror = () => {
      es.close();
      setStage("error");
      appendLog("Lost connection to server.");
    };
  };

  const reset = () => {
    setMessage("");
    setFiles([]);
    setStage("idle");
    setStatusLog([]);
    setRunId(null);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  };

  const busy = stage === "submitting" || stage === "running";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Analytics Team</h1>
        {stage !== "idle" && (
          <button
            onClick={reset}
            className="text-sm text-zinc-500 hover:text-foreground transition-colors"
          >
            New analysis
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 gap-8 max-w-2xl mx-auto w-full">
        {/* Intro */}
        {stage === "idle" && (
          <p className="text-center text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
            Describe your data and what you want to learn. Upload a CSV, Excel, or
            PDF and get an executive-ready report.
          </p>
        )}

        {/* Chat form */}
        {(stage === "idle" || stage === "submitting") && (
          <form
            onSubmit={handleSubmit}
            data-testid="chat-form"
            className="w-full flex flex-col gap-4"
          >
            <textarea
              data-testid="message-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Analyze Q3 sales by region and flag anomalies…"
              rows={4}
              disabled={busy}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50"
            />

            {/* Drop zone */}
            <div
              data-testid="dropzone"
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm cursor-pointer transition-colors ${
                dragging
                  ? "border-zinc-500 bg-zinc-100 dark:bg-zinc-800"
                  : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
              } ${busy ? "pointer-events-none opacity-50" : ""}`}
            >
              <span className="text-zinc-500 dark:text-zinc-400">
                Drop files here or <span className="underline">browse</span>
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                accept=".csv,.xlsx,.xls,.json,.parquet,.pdf"
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <ul className="flex flex-col gap-1" data-testid="file-list">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-xs bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2"
                  >
                    <span className="truncate max-w-xs text-zinc-700 dark:text-zinc-300">
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="ml-2 text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="submit"
              disabled={busy || !message.trim()}
              className="w-full rounded-xl bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 py-3 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Running…" : "Analyze"}
            </button>
          </form>
        )}

        {/* Status log */}
        {statusLog.length > 0 && (
          <div
            data-testid="status-log"
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 max-h-48 overflow-y-auto font-mono text-xs flex flex-col gap-1"
          >
            {statusLog.map((line, i) => (
              <div
                key={i}
                className={
                  line.toLowerCase().includes("error") || line.toLowerCase().includes("fail")
                    ? "text-red-500"
                    : line.toLowerCase().includes("ready") || line.toLowerCase().includes("complete")
                    ? "text-green-600 dark:text-green-400"
                    : "text-zinc-600 dark:text-zinc-400"
                }
              >
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {/* PDF viewer */}
        {pdfUrl && (
          <div className="w-full flex flex-col gap-3" data-testid="pdf-section">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Report ready
              </span>
              <a
                href={pdfUrl}
                download={`report_${runId}.pdf`}
                className="text-xs text-zinc-500 hover:text-foreground underline transition-colors"
              >
                Download
              </a>
            </div>
            <iframe
              data-testid="pdf-iframe"
              src={pdfUrl}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
              style={{ height: "70vh" }}
              title="Analytics Report"
            />
          </div>
        )}
      </main>
    </div>
  );
}
