# Analytics Team

## What This Is

An AI agent team that turns raw business data into executive-ready PDF reports. Users interact through a web app (Next.js frontend + Python backend) where they describe their data and upload files via a chatbot. The chatbot — powered by OpenRouter — routes the request to an Orchestrator that coordinates specialist agents. Each agent is a peer with a defined role, communicating through structured `.md` handoff files.

**Worker agents run on Claude. Validator agents run on Codex.**

## Team Members

| Component | Model / Stack | Role |
|-----------|--------------|------|
| Web App (Frontend) | Next.js | Chat interface for user input and file upload; displays final PDF |
| Web App (Backend) | Python + OpenRouter | Receives user messages, saves uploaded files to `data/`, forwards instructions to Orchestrator |
| Orchestrator | — | Coordinates the team, routes work, manages retries |
| Clean Specialist | Claude | Loads raw data from `data/`, standardizes and audits it, outputs cleaned data |
| Analyze Specialist | Claude | Computes metrics, trends, and anomalies; provides actionable insights |
| Report Specialist | Claude | Generates the executive PDF report |
| QA Validator | Codex | Reviews each specialist's work against their instructions |

## How the Team Works

The user sends a prompt describing what they want to analyze, along with any CSV/Excel/PDF/image files, via the web chat. The backend saves the files to `data/` and passes the user's instructions to the Orchestrator.

The Orchestrator runs each specialist in sequence. Before handing off to the next specialist, the QA Validator reviews the work. The Validator receives two things:
1. **The instructions** the Orchestrator gave to the specialist (`context/instructions_<stage>.md`)
2. **The output** the specialist produced (`context/<STAGE>_OUTPUT.md`)

This lets the Validator check not just whether the output is well-formed, but whether it actually does what was asked.

If the Validator finds issues, it writes feedback and the Orchestrator sends the specialist back to revise (max 3 attempts). Only after a `verdict: pass` does the team move forward.

Once the report is approved, the Orchestrator signals the backend, which streams the PDF back to the user's browser.

## Team Flow

```
[User] — chat message + file upload
    ↓
[Web App Backend] — saves files to data/, extracts user intent
    ↓
[Orchestrator] — writes instructions_<stage>.md before each handoff
    ↓
[Clean Specialist · Claude]
    ↓ CLEAN_OUTPUT.md + cleaned_data/
[QA Validator · Codex] ← reads: instructions_clean.md + CLEAN_OUTPUT.md
    ↓ pass / fail+feedback (max 3 retries)
[Analyze Specialist · Claude]
    ↓ ANALYZE_OUTPUT.md
[QA Validator · Codex] ← reads: instructions_analyze.md + ANALYZE_OUTPUT.md
    ↓ pass / fail+feedback (max 3 retries)
[Report Specialist · Claude]
    ↓ report_YYYYMMDD_<name>.pdf
[QA Validator · Codex] ← reads: instructions_report.md + report PDF
    ↓ pass / fail+feedback (max 3 retries)
[Web App] — displays PDF to user ✓
```

## Agent Definitions

### Web App (Frontend — Next.js)
- Chat UI where user types a prompt and optionally uploads files
- Displays streaming status updates as the pipeline runs
- Renders the final PDF inline once the report is approved

### Web App (Backend — Python + OpenRouter)
- Receives user message and uploaded files
- Saves files to `data/`
- Parses user intent into a structured `run_config.md`
- Launches the Orchestrator and streams status back to the frontend
- Serves the final PDF to the frontend on pipeline completion

### Orchestrator
- Reads `context/run_config.md`
- Writes `context/instructions_<stage>.md` before each specialist runs — these are the task-specific instructions for that specialist on this dataset
- Writes `context/orchestrator_log.md` — all decisions, retries, halts
- On Validator `verdict: fail`: sends feedback + original instructions back to specialist, increments `revision_attempt`
- Halts pipeline after 3 failed attempts at any stage; notifies the user via the backend

### Clean Specialist _(Claude)_
- Reads `context/run_config.md` + `context/instructions_clean.md` + raw file(s) from `data/`
- Loads the file (CSV, Excel, PDF, image), detects schema, and maps columns/types/null counts
- Standardizes types, handles missing values, removes duplicates, flags outliers
- Saves cleaned data to `cleaned_data/cleaned_<run_id>.parquet`
- Writes `context/CLEAN_OUTPUT.md`
- Every transformation logged with reason; no silent data loss

### Analyze Specialist _(Claude)_
- Reads `context/CLEAN_OUTPUT.md` + `context/instructions_analyze.md` + `cleaned_data/cleaned_<run_id>.parquet`
- Computes KPIs, trends, segments, anomalies — all traceable to source columns
- Provides actionable insights in addition to statistical analysis
- No causal claims beyond available evidence
- Writes `context/ANALYZE_OUTPUT.md`

### Report Specialist _(Claude)_
- Reads `context/ANALYZE_OUTPUT.md` + `context/CLEAN_OUTPUT.md` + `context/instructions_report.md`
- Generates concise, visually compelling charts
- Assembles all required sections into an executive summary PDF
- Every claim traces to `ANALYZE_OUTPUT.md`
- Writes `outputs/report_YYYYMMDD_<name>.pdf`

### QA Validator _(Codex)_
- Reads `context/instructions_<stage>.md` + `context/<STAGE>_OUTPUT.md` (or PDF for report stage)
- Writes `context/validation_<stage>.md`
- Checks: did the specialist follow the instructions? Is the output complete and correct?
- Sets `verdict: pass` or `verdict: fail` with `feedback` for the specialist to act on

**Stage-specific checks:**
| Stage | Key Checks |
|-------|-----------|
| clean | Instructions followed, schema fields present, all transformations logged with reasons, no unexplained row loss, no unaddressed critical issues |
| analyze | KPIs match requested metrics, all reference valid columns, actionable insights present, no causal language |
| report | All instructed sections present, KPI values match `ANALYZE_OUTPUT.md`, PDF renders correctly |

## Handoff File Schemas

### `context/run_config.md`
```
run_id, input_file, dataset_name, user_prompt
```

### `context/instructions_<stage>.md`  _(written by Orchestrator)_
```
stage, run_id
task: <what the specialist is being asked to do on this specific dataset>
inputs: <list of files/context to read>
output_requirements: <what the output must contain>
constraints: <any rules to follow>
```

### `context/CLEAN_OUTPUT.md`
```
status, source_file, loaded_at, row_count_before, row_count_after, column_count
columns: [{name, type, nulls}]
clean_data_path
transformations: [{step, column, action, reason}]
quality_issues: [{issue, severity}]
notes
```

### `context/ANALYZE_OUTPUT.md`
```
status
kpis: [{name, value, source_columns, method}]
trends: [{description, evidence, direction}]
segments: [{name, size, key_difference}]
anomalies: [{description, affected_rows, severity}]
insights: [{finding, recommendation}]
notes
```

### `context/validation_<stage>.md`  _(written by QA Validator)_
```
verdict, stage, revision_attempt
instructions_followed: true | false | partial
checks_passed: [...]
issues: [{check, finding, severity}]
feedback: <plain-language summary for the specialist to act on>
```

## Repository Layout

```
analytics_team/
├── frontend/          # Next.js web app
│   ├── app/
│   └── components/
├── backend/           # Python API server (FastAPI)
│   └── main.py
├── data/              # Raw inputs (never modified)
├── cleaned_data/      # Cleaned parquet files output by Clean Specialist
├── context/           # Handoff files for current run
├── outputs/           # Final PDF reports + archived context per run
├── src/
│   ├── orchestrator/
│   ├── clean/
│   ├── analyze/
│   ├── report/
│   └── validate/
└── tests/
```

## Report Sections (required)

Executive Summary · Data Overview · Key Metrics · Visualizations · Detailed Analysis · Action Items

## Engineering Standards

- Python 3.12+, `uv` + `pyproject.toml`
- Backend: FastAPI
- Frontend: Next.js (TypeScript)
- OpenRouter for the chatbot (model selection TBD at runtime)
- PDF generation: WeasyPrint or ReportLab
- Lint: `uv run ruff check .` · Format: `uv run ruff format .` · Tests: `uv run pytest tests/`
- Type hints on all public functions
- `ANTHROPIC_API_KEY` (Claude specialists), `CODEX_API_KEY` (QA Validator), `OPENROUTER_API_KEY` (chatbot) in `.env`

## Implementation Progress

| Step | Description | Status |
|------|-------------|--------|
| 1 | Scaffold — dirs, `pyproject.toml`, CLI stub, Next.js frontend | ✅ Done |
| 2 | Web App Backend (FastAPI + OpenRouter) | ✅ Done |
| 3 | Web App Frontend (Next.js chat UI + SSE + PDF render) | ✅ Done |
| 4 | Context File Schemas (Pydantic models + round-trip serialization) | ⬜ Pending |
| 5 | Clean Specialist (Claude) | ⬜ Pending |
| 6 | Analyze Specialist (Claude) | ⬜ Pending |
| 7 | Report Specialist (Claude) | ⬜ Pending |
| 8 | QA Validator (Codex) | ⬜ Pending |
| 9 | Orchestrator | ⬜ Pending |
| 10 | End-to-End Check | ⬜ Pending |

## Runbook

```bash
# Install deps
uv sync
cd frontend && npm install

# Start backend
uv run uvicorn backend.main:app --reload

# Start frontend
cd frontend && npm run dev

# Or run the pipeline directly (without web app)
uv run python src/main.py --input data/<file> --run-id <id>
# outputs/report_YYYYMMDD_<name>.pdf
```
