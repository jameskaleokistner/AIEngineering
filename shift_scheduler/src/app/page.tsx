"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { DemandChart } from "@/components/charts/DemandChart";
import { LaborChart } from "@/components/charts/LaborChart";
import { CoverageDeltaChart } from "@/components/charts/CoverageDeltaChart";
import { WarningsPanel } from "@/components/warnings/WarningsPanel";
import type { DemandPoint, Employee, Plan } from "@/types";

export default function Dashboard() {
  const [demandFile, setDemandFile] = useState<File | null>(null);
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [demand, setDemand] = useState<DemandPoint[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [pullingClockify, setPullingClockify] = useState(false);
  const [rosterSource, setRosterSource] = useState<"file" | "clockify" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePullClockify = useCallback(async () => {
    setPullingClockify(true);
    setError(null);
    try {
      const res = await fetch("/api/clockify/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmployees(data.employees ?? []);
      setRosterSource("clockify");
      setRosterFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pull from Clockify");
    } finally {
      setPullingClockify(false);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!demandFile) { setError("Upload a demand CSV first."); return; }
    if (!rosterFile && employees.length === 0) { setError("Upload a roster or pull from Clockify."); return; }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("demand", demandFile);
      if (rosterFile) formData.append("roster", rosterFile);
      const res = await fetch("/api/demand", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDemand(data.demand ?? []);
      if (data.roster) { setEmployees(data.roster); setRosterSource("file"); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally { setLoading(false); }
  }, [demandFile, rosterFile, employees.length]);

  const handleGenerate = useCallback(async () => {
    if (!demandFile || (!rosterFile && employees.length === 0)) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("demand", demandFile);
      if (rosterFile) {
        formData.append("roster", rosterFile);
      } else {
        const blob = new Blob([JSON.stringify(employees)], { type: "application/json" });
        formData.append("roster", blob, "roster.json");
      }
      const res = await fetch("/api/plan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPlan(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan generation failed");
    } finally { setLoading(false); }
  }, [demandFile, rosterFile, employees]);

  const hasRoster = rosterFile !== null || employees.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">S</div>
            <span className="text-sm font-semibold tracking-tight text-foreground">Shift Scheduler</span>
          </div>
          <nav className="flex gap-1">
            <Link href="/" className="rounded-md px-3 py-1.5 text-xs font-medium text-primary bg-primary-light">Dashboard</Link>
            {plan && (
              <Link href="/plan" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface">Planning</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Upload card */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground">Data Sources</h2>
          <p className="mt-0.5 mb-5 text-xs text-muted">Upload a demand forecast and employee roster to generate a schedule.</p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Demand */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Demand Forecast (CSV)</label>
              <div className="relative">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setDemandFile(e.target.files?.[0] ?? null)}
                  className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-white file:cursor-pointer hover:file:bg-primary-hover"
                />
              </div>
              {demandFile && <p className="mt-1.5 text-xs text-success">{demandFile.name}</p>}
            </div>

            {/* Roster */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Employee Roster</label>
              <input
                type="file"
                accept=".json"
                onChange={(e) => { setRosterFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setRosterSource("file"); }}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-white file:cursor-pointer hover:file:bg-primary-hover"
              />
              <div className="mt-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <button
                onClick={handlePullClockify}
                disabled={pullingClockify}
                className="mt-2 w-full rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
              >
                {pullingClockify ? "Connecting..." : "Import from Clockify"}
              </button>
              {rosterSource === "clockify" && employees.length > 0 && (
                <p className="mt-1.5 text-xs text-success">{employees.length} employees imported</p>
              )}
              {rosterSource === "file" && rosterFile && (
                <p className="mt-1.5 text-xs text-success">{rosterFile.name}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
            <button
              onClick={handleUpload}
              disabled={loading || !demandFile || !hasRoster}
              className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-40 transition-colors"
            >
              Preview Data
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading || !demandFile || !hasRoster}
              className="rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-40 transition-colors"
            >
              {loading ? "Generating..." : "Generate Schedule"}
            </button>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </section>

        {/* Stats */}
        {(demand.length > 0 || plan) && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Hourly Slots" value={demand.length} />
            <Stat label="Employees" value={employees.length} />
            {plan && <Stat label="Shifts" value={plan.shifts.length} />}
            {plan && (
              <Stat
                label="Warnings"
                value={plan.warnings.length}
                color={plan.warnings.length > 0 ? "warning" : "success"}
              />
            )}
          </section>
        )}

        {/* Demand chart */}
        {demand.length > 0 && <DemandChart data={demand} />}

        {/* Labor + delta */}
        {plan && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LaborChart data={plan.coverage} />
            <CoverageDeltaChart data={plan.coverage} />
          </div>
        )}

        {/* Warnings */}
        {plan && plan.warnings.length > 0 && (
          <WarningsPanel warnings={plan.warnings} />
        )}

        {/* CTA */}
        {plan && (
          <div className="flex justify-center pt-2 pb-4">
            <Link
              href="/plan"
              className="rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover transition-colors"
              onClick={() => {
                sessionStorage.setItem("shift_plan", JSON.stringify(plan));
                sessionStorage.setItem("shift_demand", JSON.stringify(demand));
                sessionStorage.setItem("shift_employees", JSON.stringify(employees));
              }}
            >
              Open Planning Workspace
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

const Stat = ({ label, value, color = "default" }: { label: string; value: number; color?: "default" | "warning" | "success" }) => {
  const cls = color === "warning" ? "text-warning" : color === "success" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${cls}`}>{value.toLocaleString()}</p>
    </div>
  );
};
