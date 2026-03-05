"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Employee, Plan, PublishResult, ValidationResult } from "@/types";
import { validatePlan } from "@/lib/integration";

type Workspace = { id: string; name: string };
type Props = { plan: Plan; employees?: Employee[] };

export const PublishPanel = ({ plan, employees = [] }: Props) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ deleted: number; failed: number } | null>(null);
  const [results, setResults] = useState<PublishResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [workspacesStatus, setWorkspacesStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [publishedAt, setPublishedAt] = useState<Date | null>(null);

  const validation = useMemo(() => validatePlan(plan), [plan]);

  // Auto-load workspaces on mount
  const loadWorkspaces = useCallback(async () => {
    setWorkspacesStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/clockify");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkspaces(data.workspaces ?? []);
      if (data.workspaces?.length > 0) setSelectedWorkspace(data.workspaces[0].id);
      setWorkspacesStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspaces");
      setWorkspacesStatus("error");
    }
  }, []);

  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);

  const handlePublish = useCallback(async () => {
    if (!selectedWorkspace || !validation?.valid) return;
    setPublishing(true);
    setError(null);
    setResults([]);
    setPublishedAt(null);
    try {
      const nameMap: Record<string, string> = {};
      employees.forEach((emp) => { nameMap[emp.employeeId] = emp.name; });

      const res = await fetch("/api/clockify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, workspaceId: selectedWorkspace, employeeNames: nameMap }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results ?? []);
      const allOk = (data.results ?? []).every((r: PublishResult) => r.success);
      if (allOk) setPublishedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally { setPublishing(false); }
  }, [plan, selectedWorkspace, validation, employees]);

  const handleClear = useCallback(async () => {
    if (!selectedWorkspace) return;
    if (!window.confirm("This will delete all scheduled shift entries from Clockify. Continue?")) return;
    setClearing(true);
    setError(null);
    setClearResult(null);
    setPublishedAt(null);
    try {
      const res = await fetch(`/api/clockify?workspaceId=${selectedWorkspace}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setClearResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    } finally { setClearing(false); }
  }, [selectedWorkspace]);

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const wsName = workspaces.find((w) => w.id === selectedWorkspace)?.name ?? "";

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-foreground">Publish to Clockify</h2>
        <div className="flex items-center gap-2">
          {wsName && workspacesStatus === "loaded" && (
            <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10px] font-medium text-muted">
              {wsName}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${
              workspacesStatus === "loaded" ? "bg-success" :
              workspacesStatus === "loading" ? "bg-warning animate-pulse" : "bg-danger"
            }`} />
            <span className="text-[10px] text-muted">
              {workspacesStatus === "loaded" ? "Connected" : workspacesStatus === "loading" ? "Connecting…" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-0.5 mb-5 text-xs text-muted">Push the approved schedule to Clockify as time entries.</p>

      {/* Publish success banner */}
      {publishedAt && (
        <div className="mb-5 rounded-xl border border-success/30 bg-success-light px-5 py-4 animate-scale-in">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success/20 shadow-lg shadow-success/20">
              <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-success">{successCount} shifts published!</p>
              <p className="text-xs text-muted mt-0.5">
                Successfully sent to <span className="font-semibold text-foreground">{wsName}</span> at{" "}
                {publishedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Validation */}
      {validation && !publishedAt && (
        <div className={`mb-5 rounded-xl px-4 py-3 text-xs border ${
          validation.valid
            ? "border-success/20 bg-success-light text-success"
            : "border-danger/20 bg-danger-light text-danger"
        }`}>
          {validation.valid ? (
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-medium">Plan valid — {plan.shifts.length} shifts ready to publish</p>
            </div>
          ) : (
            <div>
              <p className="mb-1.5 font-semibold flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Validation errors:
              </p>
              <ul className="ml-6 list-disc space-y-0.5">{validation.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* Workspace selector */}
      <div className="mb-5 flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-foreground">Clockify Workspace</label>
          {workspacesStatus === "loading" ? (
            <div className="h-9 rounded-lg shimmer-loading" />
          ) : workspaces.length > 0 ? (
            <select
              value={selectedWorkspace}
              onChange={(e) => setSelectedWorkspace(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
            </select>
          ) : (
            <p className="text-xs text-muted">
              {workspacesStatus === "error" ? "Failed to connect to Clockify." : "No workspaces found."}
            </p>
          )}
        </div>
        <button
          onClick={loadWorkspaces}
          disabled={workspacesStatus === "loading"}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground hover:bg-card disabled:opacity-40 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePublish}
          disabled={publishing || clearing || !validation?.valid || !selectedWorkspace || workspacesStatus !== "loaded"}
          className="rounded-xl bg-gradient-to-r from-primary to-purple-600 px-6 py-2.5 text-xs font-semibold text-white hover:from-primary-hover hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-200"
        >
          {publishing ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin-custom" />
              Publishing…
            </span>
          ) : publishedAt ? "Republish" : "Send Plan"}
        </button>
        <button
          onClick={handleClear}
          disabled={clearing || publishing || !selectedWorkspace || workspacesStatus !== "loaded"}
          className="rounded-xl border border-danger/30 bg-danger-light px-6 py-2.5 text-xs font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          {clearing ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-danger/30 border-t-danger animate-spin-custom" />
              Clearing…
            </span>
          ) : "Clear Shifts"}
        </button>
        {error && <p className="text-xs text-danger bg-danger-light rounded-lg px-3 py-1.5 border border-danger/20">{error}</p>}
      </div>

      {/* Clear result */}
      {clearResult && (
        <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-xs flex items-center gap-3 animate-scale-in">
          <svg className="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="text-success font-semibold">{clearResult.deleted} entries deleted from Clockify</span>
          {clearResult.failed > 0 && (
            <span className="text-danger font-semibold">· {clearResult.failed} failed</span>
          )}
        </div>
      )}

      {/* Results table */}
      {results.length > 0 && !publishedAt && (
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-xs font-semibold text-foreground">Publish Results</h3>
            <span className="rounded-full bg-success-light px-2 py-0.5 text-[10px] font-bold text-success">{successCount} ok</span>
            {failCount > 0 && (
              <span className="rounded-full bg-danger-light px-2 py-0.5 text-[10px] font-bold text-danger">{failCount} failed</span>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-surface border-b border-border">
                <tr className="text-left text-muted">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Clockify ID</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.shiftIndex} className="border-b border-border/30 hover:bg-surface/40 transition-colors">
                    <td className="px-3 py-1.5 tabular-nums text-muted">{r.shiftIndex + 1}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        r.success ? "bg-success-light text-success" : "bg-danger-light text-danger"
                      }`}>
                        {r.success ? "ok" : "fail"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-muted truncate max-w-[140px]">{r.clockifyId ?? "—"}</td>
                    <td className="px-3 py-1.5 text-danger">{r.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
