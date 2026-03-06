# Implementation Plan

## Architecture Overview

```
[User] — chat + file upload
    ↓
[Web App Backend (FastAPI + OpenRouter)]
    ↓ saves files to data/, writes run_config.md
[Orchestrator]
    ├─ instructions_clean.md ──► Clean Specialist (Claude)
    │                                   ↓ CLEAN_OUTPUT.md + cleaned_data/
    │                            QA Validator (Codex) ◄── instructions_clean.md
    │                                   ↓ pass / fail+feedback
    ├─ instructions_analyze.md ─► Analyze Specialist (Claude)
    │                                   ↓ ANALYZE_OUTPUT.md
    │                            QA Validator (Codex) ◄── instructions_analyze.md
    │                                   ↓ pass / fail+feedback
    └─ instructions_report.md ──► Report Specialist (Claude)
                                        ↓ report_YYYYMMDD_<name>.pdf
                                 QA Validator (Codex) ◄── instructions_report.md
                                        ↓ pass
[Web App] — displays PDF to user ✓
```

The Orchestrator writes `instructions_<stage>.md` before each specialist runs. The QA Validator reads both the instructions and the output — it checks whether the specialist did what it was asked, not just whether the output is well-formed. On `verdict: fail`, the Orchestrator sends the feedback + original instructions back to the specialist to revise (max 3 attempts). After 3 failures the pipeline halts and the backend notifies the user.

---

## Steps

### 1. Scaffold
Create the full directory structure, `pyproject.toml`, and CLI stub.

**Dirs:** `frontend/`, `backend/`, `src/{orchestrator,clean,analyze,report,validate}/`, `context/`, `data/`, `cleaned_data/`, `outputs/`, `tests/`

**Python deps:** `fastapi`, `uvicorn`, `pandas`, `pyarrow`, `matplotlib`, `weasyprint`, `pydantic`, `anthropic`, `openai`, `python-multipart`, `python-dotenv`, `pytest`, `ruff`

**Frontend deps:** Next.js, TypeScript, Tailwind CSS, `react-pdf` (or iframe for PDF display)

**CLI stub:** `src/main.py --input --run-id` (for running pipeline directly without web app)

**Verify:** `uv sync`, `uv run ruff check .`, and `cd frontend && npm install` all pass

---

### 2. Web App — Backend (FastAPI + OpenRouter)
`backend/main.py`

1. `POST /chat` — accepts user message + file upload(s)
   - Saves uploaded files to `data/`
   - Calls OpenRouter to parse user intent into structured form
   - Writes `context/run_config.md` (run_id, input_file, dataset_name, user_prompt)
   - Spawns Orchestrator in background task
   - Returns `run_id` to frontend
2. `GET /status/{run_id}` — SSE stream of pipeline status updates from `orchestrator_log.md`
3. `GET /report/{run_id}` — serves the final PDF once pipeline is complete

**Tests:** file upload saves to `data/`; run_config written correctly; PDF endpoint returns 404 before pipeline completes

---

### 3. Web App — Frontend (Next.js)
`frontend/app/page.tsx`

1. Chat interface: text input + file drop zone
2. On submit: `POST /chat`, receive `run_id`
3. Subscribe to `GET /status/{run_id}` SSE — display live stage updates (e.g. "Cleaning data...", "Analyzing...")
4. On pipeline complete: fetch and render PDF inline (iframe or `react-pdf`)

**Tests:** chat sends correct payload; status updates render; PDF renders on completion

---

### 4. Context File Schemas
`src/context_schema.py`

Define Pydantic models for every handoff file:
- `RunConfig` — run_id, input_file, dataset_name, user_prompt
- `Instructions` — stage, run_id, task, inputs, output_requirements, constraints
- `CleanOutput` — status, source_file, loaded_at, row_count_before, row_count_after, column_count, columns, clean_data_path, transformations, quality_issues, notes
- `AnalyzeOutput` — status, kpis, trends, segments, anomalies, insights, notes
- `ValidationOutput` — verdict, stage, revision_attempt, instructions_followed, checks_passed, issues, feedback

Each model: `to_md(path)` + `from_md(path)`.

**Tests:** round-trip each schema (write → read → assert equal)

---

### 5. Clean Specialist _(Claude)_
`src/clean/agent.py` · `run(config: RunConfig, instructions: Instructions) -> CleanOutput`

1. Follow `instructions.task` — what to load and what cleaning is required
2. Load file from `data/` (CSV, Excel, JSON, parquet)
3. Capture schema: row count, column names, dtypes, null counts
4. Standardize types; parse dates; coerce numerics
5. Impute missing (median/mode) — log each decision
6. Drop duplicates — log count
7. Flag outliers (>3 std dev) — log, do not drop
8. Save cleaned data to `cleaned_data/cleaned_<run_id>.parquet`
9. Write `context/CLEAN_OUTPUT.md`

**Tests:** schema fields present; every instructed transformation appears in log; row loss explained; parquet is valid; `status: failed` on unsupported file type

---

### 6. Analyze Specialist _(Claude)_
`src/analyze/agent.py` · `run(clean: CleanOutput, instructions: Instructions) -> AnalyzeOutput`

1. Follow `instructions.task` — which KPIs and analyses were requested
2. Compute requested KPIs (mean/median/std/min/max per numeric column by default)
3. Trends: period-over-period delta if date column exists
4. Segments: group by categorical columns, compare KPIs
5. Anomalies: outliers from clean step + new statistical outliers
6. Derive actionable insights with concrete recommendations
7. Write `context/ANALYZE_OUTPUT.md`

**Tests:** KPIs match requested metrics; insights section non-empty; no causal language; trends have direction set; all columns referenced exist in CleanOutput

---

### 7. Report Specialist _(Claude)_
`src/report/agent.py` · `run(clean: CleanOutput, analyze: AnalyzeOutput, instructions: Instructions, run_id: str) -> str`

1. Follow `instructions.output_requirements` — required sections and chart types
2. Generate charts (KPI bar, trend line, segment comparison) as embedded images
3. Assemble executive summary PDF with all required sections
4. Write `outputs/report_YYYYMMDD_<name>.pdf`

**Required sections:** Executive Summary · Data Overview · Key Metrics · Visualizations · Detailed Analysis · Action Items

**Tests:** all instructed sections present in PDF; KPI values match `ANALYZE_OUTPUT.md`; PDF file is valid and non-empty

---

### 8. QA Validator _(Codex)_
`src/validate/agent.py` · `run(stage: str, instructions: Instructions, output_path: str) -> ValidationOutput`

1. Read `instructions_<stage>.md` — what the specialist was asked to do
2. Read the specialist's output (`.md` or PDF for report stage)
3. Check: did the specialist follow the instructions? Are all `output_requirements` met?
4. Run stage-specific checks (see CLAUDE.md table)
5. Write `context/validation_<stage>.md`
6. Return `verdict: pass` or `verdict: fail` with `feedback`

**Tests:**
- Pass: output satisfies instructions → `verdict: pass`
- Fail: output missing a required field from instructions → `verdict: fail` with specific feedback
- `instructions_followed: partial` when some but not all requirements met

---

### 9. Orchestrator
`src/orchestrator/orchestrator.py` · `run(input_file: str, run_id: str)`

For each stage (Clean → Analyze → Report):
1. Write `context/instructions_<stage>.md` with task-specific instructions for this dataset
2. Run specialist with those instructions
3. Run QA Validator with same instructions + specialist's output
4. If `verdict: fail`: pass feedback + original instructions back to specialist, increment `revision_attempt`, retry
5. Halt after 3 failed attempts, log reason, signal backend to notify user

On completion: archive `context/` → `outputs/context_<run_id>/`, write `orchestrator_log.md`

**Tests:**
- Full run produces PDF; all verdicts pass
- Instructions file exists before each specialist runs
- Validator receives and uses instructions in its checks
- Retry loop: specialist gets feedback + instructions, revises, re-validates
- Halts after 3 failures with clear log entry

---

### 10. End-to-End Check

```bash
# Via CLI
uv run python src/main.py --input data/sample.csv --run-id test_001

# Via web app
uv run uvicorn backend.main:app --reload &
cd frontend && npm run dev
# Upload sample.csv through the chat UI
```

Verify:
- `context/` has: `run_config`, `orchestrator_log`, 3× `instructions_<stage>`, 3× `<STAGE>_OUTPUT`, 3× `validation_<stage>`
- All `status: success`, all `verdict: pass`, all `instructions_followed: true`
- `outputs/report_YYYYMMDD_sample.pdf` opens with all 6 sections and charts
- PDF is served by `GET /report/test_001` and renders in the browser
- `uv run pytest tests/` — all pass
- `uv run ruff check .` — no errors
