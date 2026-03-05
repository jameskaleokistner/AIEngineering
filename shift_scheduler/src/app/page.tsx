"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { DemandChart } from "@/components/charts/DemandChart";
import { LaborChart } from "@/components/charts/LaborChart";
import { CoverageDeltaChart } from "@/components/charts/CoverageDeltaChart";
import { WarningsPanel } from "@/components/warnings/WarningsPanel";
import type { DemandPoint, Employee, Plan } from "@/types";
import { SESSION_KEYS } from "@/lib/constants";

type LoadStatus = "loading" | "loaded" | "error" | "idle";

export default function Dashboard() {
  const [demand, setDemand] = useState<DemandPoint[]>([]);
  const [rawDemandCsv, setRawDemandCsv] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [demandStatus, setDemandStatus] = useState<LoadStatus>("loading");
  const [employeesStatus, setEmployeesStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const planRef = useRef<HTMLDivElement>(null);

  const loadDemand = useCallback(async (file?: File) => {
    setDemandStatus("loading");
    try {
      if (file) {
        const text = await file.text();
        const form = new FormData();
        form.append("demand", file);
        const res = await fetch("/api/demand", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setDemand(data.demand ?? []);
        setRawDemandCsv(text);
      } else {
        const res = await fetch("/api/demand/preload");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setDemand(data.demand ?? []);
        setRawDemandCsv(data.rawCsv ?? "");
      }
      setDemandStatus("loaded");
    } catch {
      setDemandStatus("error");
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setEmployeesStatus("loading");
    try {
      const res = await fetch("/api/clockify/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmployees(data.employees ?? []);
      setEmployeesStatus("loaded");
    } catch {
      setEmployeesStatus("error");
    }
  }, []);

  useEffect(() => {
    loadDemand();
    loadEmployees();
  }, [loadDemand, loadEmployees]);

  const handleGenerate = useCallback(async () => {
    if (!rawDemandCsv || employees.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("demand", new File([rawDemandCsv], "demand.csv", { type: "text/csv" }));
      formData.append(
        "roster",
        new File([JSON.stringify(employees)], "roster.json", { type: "application/json" }),
      );
      const res = await fetch("/api/plan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPlan(data);
      setTimeout(() => planRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan generation failed");
    } finally {
      setGenerating(false);
    }
  }, [rawDemandCsv, employees]);

  const canGenerate = demandStatus === "loaded" && employeesStatus === "loaded" && !generating;
  const bothLoading = demandStatus === "loading" || employeesStatus === "loading";

  // Step state for the workflow stepper
  const step = !canGenerate && !plan ? 1 : plan ? 3 : 2;

  // Persist plan to sessionStorage whenever it changes
  useEffect(() => {
    if (plan) {
      sessionStorage.setItem(SESSION_KEYS.PLAN, JSON.stringify(plan));
      sessionStorage.setItem(SESSION_KEYS.DEMAND, JSON.stringify(demand));
      sessionStorage.setItem(SESSION_KEYS.EMPLOYEES, JSON.stringify(employees));
    }
  }, [plan, demand, employees]);

  return (
    <div className="min-h-screen bg-background">
      {/* Deep ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/8 blur-[100px]" />
        <div className="absolute top-1/4 -right-32 h-80 w-80 rounded-full bg-indigo-700/6 blur-[80px]" />
        <div className="absolute bottom-1/3 -left-24 h-72 w-72 rounded-full bg-blue-700/5 blur-[80px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border glass">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-primary/30">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Shift Scheduler</span>
              <span className="ml-2 hidden sm:inline text-[10px] text-muted">by Kal's Kookies</span>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <Link href="/" className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary-light">
              Dashboard
            </Link>
            {plan && (
              <Link
                href="/plan"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface transition-colors"
              >
                Planning
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pt-12 pb-16 space-y-10">

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="animate-slide-up relative rounded-3xl overflow-hidden">
          {/* Dot grid background */}
          <div className="absolute inset-0 dot-grid opacity-60" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" aria-hidden />

          <div className="relative text-center py-14 px-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light px-3.5 py-1.5 mb-5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping-once" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-xs font-semibold text-primary tracking-wide">AI-Powered Scheduling</span>
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight leading-none mb-4">
              <span className="gradient-text">Intelligent Shift</span>
              <br />
              <span className="text-foreground/90">Scheduling Engine</span>
            </h1>
            <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
              Transforms demand forecasts into optimized employee schedules — constraint-based, pre-loaded, and ready to run.
            </p>
          </div>
        </section>

        {/* ── Workflow stepper ──────────────────────────────────────── */}
        <section className="animate-slide-up-delay-1">
          <div className="flex items-center justify-center gap-0">
            <StepBadge num={1} label="Load Data" active={step === 1} done={step > 1} />
            <StepConnector done={step > 1} />
            <StepBadge num={2} label="Generate" active={step === 2} done={step > 2} />
            <StepConnector done={step > 2} />
            <StepBadge num={3} label="Review & Publish" active={step === 3} done={false} />
          </div>
        </section>

        {/* ── Data Sources ──────────────────────────────────────────── */}
        <section className="animate-slide-up-delay-2 rounded-2xl border border-border bg-card p-6 gradient-border">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-foreground">Data Sources</h2>
            <span className="text-[10px] uppercase tracking-widest text-muted font-semibold">Auto-Connected</span>
          </div>
          <p className="text-xs text-muted mb-6">Pre-loaded from system defaults. Override any source below.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <SourceCard
              title="Demand Forecast"
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              subtitle="data/demand.csv"
              status={demandStatus}
              detail={demandStatus === "loaded" ? `${demand.length} hourly slots · ${Math.round(demand.length / 7)} slots/day` : undefined}
              onRetry={() => loadDemand()}
              overrideLabel="Override with CSV"
              onOverride={(file) => loadDemand(file)}
              accept=".csv"
            />

            <SourceCard
              title="Employee Roster"
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              subtitle="Clockify Workspace"
              status={employeesStatus}
              detail={
                employeesStatus === "loaded" && employees.length > 0
                  ? employees.map((e) => e.name).join(" · ")
                  : undefined
              }
              onRetry={() => loadEmployees()}
              overrideLabel="Override with JSON"
              onOverride={async (file) => {
                const text = await file.text();
                try {
                  const parsed = JSON.parse(text);
                  setEmployees(Array.isArray(parsed) ? parsed : []);
                  setEmployeesStatus("loaded");
                } catch {
                  setEmployeesStatus("error");
                }
              }}
              accept=".json"
            />
          </div>

          {/* Ready banner */}
          {canGenerate && !plan && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-success/25 bg-success-light px-4 py-3 animate-scale-in">
              <div className="relative shrink-0">
                <span className="absolute inset-0 rounded-full bg-success/40 animate-ping-once" />
                <span className="relative flex h-2.5 w-2.5 rounded-full bg-success" />
              </div>
              <p className="text-xs font-medium text-success">
                Both sources ready — generate your 7-day schedule!
              </p>
            </div>
          )}

          <div className="flex items-center gap-4 pt-5 border-t border-border">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={`relative rounded-xl px-7 py-2.5 text-sm font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed ${
                canGenerate
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] animate-glow-pulse"
                  : "bg-surface opacity-40"
              }`}
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin-custom" />
                  Generating…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Schedule
                </span>
              )}
            </button>

            {bothLoading && !generating && (
              <span className="flex items-center gap-2 text-xs text-muted">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-muted/30 border-t-muted animate-spin-custom" />
                Loading data sources…
              </span>
            )}

            {error && (
              <p className="text-xs text-danger bg-danger-light rounded-lg px-3 py-1.5 border border-danger/20">
                {error}
              </p>
            )}
          </div>
        </section>

        {/* ── Generating skeleton ───────────────────────────────────── */}
        {generating && (
          <section className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-2xl border border-border bg-card px-4 py-4 h-24 shimmer-loading" />
              ))}
            </div>
            <div className="rounded-2xl border border-border bg-card h-80 shimmer-loading" />
          </section>
        )}

        {/* ── Stats ─────────────────────────────────────────────────── */}
        {!generating && (demand.length > 0 || plan) && (
          <section ref={planRef} className="grid grid-cols-2 gap-3 sm:grid-cols-4 animate-slide-up-delay-2">
            <StatCard label="Hourly Slots" value={demand.length} color="default" icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            } />
            <StatCard label="Employees" value={employees.length} color="default" icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            } />
            {plan && (
              <StatCard label="Total Shifts" value={plan.shifts.length} color="primary" icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              } />
            )}
            {plan && (
              <StatCard
                label="Warnings"
                value={plan.warnings.length}
                color={plan.warnings.length > 0 ? "warning" : "success"}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                }
              />
            )}
          </section>
        )}

        {/* ── Demand Chart ──────────────────────────────────────────── */}
        {demand.length > 0 && (
          <div className="animate-slide-up-delay-3">
            <DemandChart data={demand} />
          </div>
        )}

        {/* ── Plan Charts ───────────────────────────────────────────── */}
        {plan && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-slide-up">
            <LaborChart data={plan.coverage} />
            <CoverageDeltaChart data={plan.coverage} />
          </div>
        )}

        {/* ── Warnings ─────────────────────────────────────────────── */}
        {plan && plan.warnings.length > 0 && (
          <div className="animate-slide-up">
            <WarningsPanel warnings={plan.warnings} />
          </div>
        )}

        {/* ── CTA ───────────────────────────────────────────────────── */}
        {plan && (
          <div className="flex flex-col items-center gap-4 pt-2 pb-4 animate-slide-up">
            <Link
              href="/plan"
              className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-10 py-4 text-sm font-bold text-white shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:scale-105 hover:brightness-110"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Open Planning Workspace
              <span className="group-hover:translate-x-1.5 transition-transform duration-200 font-light">→</span>
            </Link>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted">Edit shifts, review coverage, then publish to Clockify</p>
              <button
                onClick={() => { setPlan(null); handleGenerate(); }}
                disabled={generating}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground border border-border hover:border-border-bright rounded-lg px-3 py-1.5 transition-all duration-200 disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── Step Badge ────────────────────────────────────────────────────── */
const StepBadge = ({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }) => (
  <div className="flex flex-col items-center gap-1.5">
    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
      done
        ? "bg-success text-white shadow-md shadow-success/30"
        : active
        ? "bg-primary text-white shadow-md shadow-primary/30"
        : "bg-surface text-muted border border-border"
    }`}>
      {done ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : num}
    </div>
    <span className={`text-[10px] font-medium whitespace-nowrap ${active ? "text-foreground" : done ? "text-success" : "text-muted"}`}>
      {label}
    </span>
  </div>
);

const StepConnector = ({ done }: { done: boolean }) => (
  <div className={`mb-4 mx-2 h-px w-12 sm:w-20 transition-all duration-500 ${done ? "bg-success/60" : "bg-border"}`} />
);

/* ─── Source Card ────────────────────────────────────────────────────── */
type SourceCardProps = {
  title: string;
  icon: React.ReactNode;
  subtitle: string;
  status: LoadStatus;
  detail?: string;
  onRetry: () => void;
  overrideLabel: string;
  onOverride: (file: File) => void;
  accept: string;
};

const SourceCard = ({ title, icon, subtitle, status, detail, onRetry, overrideLabel, onOverride, accept }: SourceCardProps) => {
  const isLoaded = status === "loaded";
  const isLoading = status === "loading";
  const isError = status === "error";

  return (
    <div className={`relative rounded-xl border bg-surface p-4 transition-all duration-500 ${
      isLoaded ? "border-success/25" : isError ? "border-danger/25" : "border-border"
    }`}>
      {/* Success glow overlay */}
      {isLoaded && (
        <div className="absolute inset-0 rounded-xl bg-success/3 pointer-events-none" />
      )}

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors duration-300 ${
            isLoaded ? "bg-success/15 text-success" : isError ? "bg-danger/15 text-danger" : "bg-primary-light text-primary"
          }`}>
            {isLoaded ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : icon}
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">{title}</p>
            <p className="text-[10px] text-muted font-mono mt-0.5">{subtitle}</p>
          </div>
        </div>

        {/* Status dot */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            isLoaded ? "bg-success" : isLoading ? "bg-warning animate-pulse" : "bg-danger"
          }`} />
          <span className={`text-[10px] font-medium ${
            isLoaded ? "text-success" : isLoading ? "text-warning" : "text-danger"
          }`}>
            {isLoaded ? "Ready" : isLoading ? "Loading" : "Error"}
          </span>
        </div>
      </div>

      {/* Detail text */}
      {isLoaded && detail && (
        <p className="text-[10px] text-muted/80 mb-3 leading-relaxed truncate">{detail}</p>
      )}

      {/* Loading shimmer bar */}
      {isLoading && (
        <div className="h-1 w-full rounded-full overflow-hidden bg-border mb-3">
          <div className="h-full shimmer-loading rounded-full" style={{ width: "60%" }} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        {isError ? (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary-hover font-medium transition-colors"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry connection
          </button>
        ) : <span />}

        {!isLoading && (
          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-muted hover:text-foreground transition-colors">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {overrideLabel}
            <input type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && onOverride(e.target.files[0])} />
          </label>
        )}
      </div>
    </div>
  );
};

/* ─── Count-up hook ──────────────────────────────────────────────────── */
function useCountUp(to: number, duration = 750): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (to === 0) { setVal(0); return; }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(to * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return val;
}

/* ─── Stat Card ──────────────────────────────────────────────────────── */
const StatCard = ({
  label, value, color = "default", icon,
}: {
  label: string; value: number; color?: "default" | "warning" | "success" | "primary"; icon: React.ReactNode;
}) => {
  const displayValue = useCountUp(value);
  const valueColor = color === "warning" ? "text-warning" : color === "success" ? "text-success" : color === "primary" ? "text-primary" : "text-foreground";
  const iconBg = color === "warning" ? "bg-warning-light text-warning" : color === "success" ? "bg-success-light text-success" : color === "primary" ? "bg-primary-light text-primary" : "bg-surface text-muted";

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4 animate-count-up hover:border-border-bright transition-colors duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      </div>
      <p className={`text-3xl font-extrabold tabular-nums ${valueColor}`}>{displayValue.toLocaleString()}</p>
    </div>
  );
};
