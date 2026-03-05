"use client";

import { useState, useEffect, useCallback } from "react";
import type { Employee, Plan, PublishResult, ValidationResult } from "@/types";

type Workspace = { id: string; name: string };
type Props = { plan: Plan; employees?: Employee[] };

export const PublishPanel = ({ plan, employees = [] }: Props) => {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ deleted: number; failed: number } | null>(null);
  const [results, setResults] = useState<PublishResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);

  useEffect(() => {
    const errors: string[] = [];
    plan.shifts.forEach((shift, idx) => {
      const start = new Date(shift.start).getTime();
      const end = new Date(shift.end).getTime();
      if (end <= start) errors.push(`Shift ${idx}: invalid duration`);
      if (!shift.employeeId) errors.push(`Shift ${idx}: missing employeeId`);
    });

    const byEmp = new Map<string, typeof plan.shifts>();
    plan.shifts.forEach((s) => {
      const list = byEmp.get(s.employeeId) ?? [];
      list.push(s);
      byEmp.set(s.employeeId, list);
    });
    for (const [empId, shifts] of byEmp) {
      const sorted = [...shifts].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      for (let i = 1; i < sorted.length; i++) {
        if (new Date(sorted[i].start).getTime() < new Date(sorted[i - 1].end).getTime()) {
          errors.push(`${empId}: overlapping shifts`);
        }
      }
    }
    setValidation({ valid: errors.length === 0, errors });
  }, [plan]);

  const loadWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    setError(null);
    try {
      const res = await fetch("/api/clockify");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkspaces(data.workspaces ?? []);
      if (data.workspaces?.length > 0) setSelectedWorkspace(data.workspaces[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspaces");
    } finally { setLoadingWorkspaces(false); }
  }, []);

  const handlePublish = useCallback(async () => {
    if (!selectedWorkspace || !validation?.valid) return;
    setPublishing(true);
    setError(null);
    setResults([]);
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

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold text-foreground">Publish to Clockify</h2>
      <p className="mt-0.5 mb-5 text-xs text-muted">Push the approved schedule to Clockify as time entries.</p>

      {/* Validation */}
      {validation && (
        <div className={`mb-5 rounded-xl px-4 py-3 text-xs ${
          validation.valid
            ? "border border-success/20 bg-success-light text-success"
            : "border border-danger/20 bg-danger-light text-danger"
        }`}>
          {validation.valid ? (
            <p className="font-medium">Plan valid &mdash; {plan.shifts.length} shifts ready</p>
          ) : (
            <div>
              <p className="mb-1 font-semibold">Validation errors:</p>
              <ul className="ml-4 list-disc space-y-0.5">{validation.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* Workspace */}
      <div className="mb-5 flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-foreground">Clockify Workspace</label>
          {workspaces.length > 0 ? (
            <select
              value={selectedWorkspace}
              onChange={(e) => setSelectedWorkspace(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs"
            >
              {workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
            </select>
          ) : (
            <p className="text-xs text-muted">Click &ldquo;Connect&rdquo; to load workspaces.</p>
          )}
        </div>
        <button
          onClick={loadWorkspaces}
          disabled={loadingWorkspaces}
          className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-40 transition-colors"
        >
          {loadingWorkspaces ? "Loading..." : "Connect"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePublish}
          disabled={publishing || clearing || !validation?.valid || !selectedWorkspace}
          className="rounded-lg bg-primary px-6 py-2.5 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-40 transition-colors"
        >
          {publishing ? "Publishing..." : "Send Plan"}
        </button>
        <button
          onClick={handleClear}
          disabled={clearing || publishing || !selectedWorkspace}
          className="rounded-lg border border-danger/30 bg-danger-light px-6 py-2.5 text-xs font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-40 transition-colors"
        >
          {clearing ? "Clearing..." : "Clear Shifts"}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      {/* Clear result */}
      {clearResult && (
        <div className="mt-4 rounded-xl border border-border px-4 py-3 text-xs">
          <span className="text-success font-medium">{clearResult.deleted} entries deleted</span>
          {clearResult.failed > 0 && (
            <span className="ml-2 text-danger font-medium">{clearResult.failed} failed</span>
          )}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold text-foreground">
            Results &mdash; <span className="text-success">{successCount} ok</span>{failCount > 0 && <>, <span className="text-danger">{failCount} failed</span></>}
          </h3>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Clockify ID</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.shiftIndex} className="border-b border-border/40">
                    <td className="px-3 py-1.5 tabular-nums">{r.shiftIndex + 1}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        r.success ? "bg-success-light text-success" : "bg-danger-light text-danger"
                      }`}>
                        {r.success ? "ok" : "fail"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-muted">{r.clockifyId ?? "—"}</td>
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
