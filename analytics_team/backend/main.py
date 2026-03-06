"""FastAPI backend for the analytics team web app."""

import asyncio
import json
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from openai import AsyncOpenAI

load_dotenv()

app = FastAPI(title="Analytics Team API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CONTEXT_DIR = BASE_DIR / "context"
OUTPUTS_DIR = BASE_DIR / "outputs"

for _dir in (DATA_DIR, CONTEXT_DIR, OUTPUTS_DIR):
    _dir.mkdir(exist_ok=True)

_openrouter = AsyncOpenAI(
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    base_url="https://openrouter.ai/api/v1",
)


async def _parse_user_intent(message: str, filename: str) -> dict:
    """Call OpenRouter to extract dataset_name and a concise task description."""
    response = await _openrouter.chat.completions.create(
        model="openai/gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a data analyst assistant. "
                    "Extract a short dataset_name (snake_case, ≤5 words) and a concise "
                    "task description from the user's message. "
                    'Reply ONLY with valid JSON: {"dataset_name": "...", "task": "..."}'
                ),
            },
            {
                "role": "user",
                "content": f"File: {filename}\nMessage: {message}",
            },
        ],
        temperature=0,
    )
    raw = response.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"dataset_name": Path(filename).stem, "task": message}


def _write_run_config(
    run_id: str,
    input_file: str,
    dataset_name: str,
    user_prompt: str,
) -> None:
    path = CONTEXT_DIR / "run_config.md"
    path.write_text(
        f"run_id: {run_id}\n"
        f"input_file: {input_file}\n"
        f"dataset_name: {dataset_name}\n"
        f"user_prompt: {user_prompt}\n"
    )


def _append_log(run_id: str, message: str) -> None:
    log_path = CONTEXT_DIR / "orchestrator_log.md"
    with log_path.open("a") as f:
        f.write(f"[{run_id}] {message}\n")


async def _run_orchestrator(run_id: str) -> None:
    """Background task — placeholder until Step 9 wires in the real Orchestrator."""
    _append_log(run_id, "status: orchestrator_started")
    # Real orchestrator will be called here in Step 9.
    await asyncio.sleep(0)
    _append_log(run_id, "status: orchestrator_placeholder_complete")


@app.post("/chat")
async def chat(
    background_tasks: BackgroundTasks,
    message: str = Form(...),
    files: list[UploadFile] = File(default=[]),
) -> dict:
    """Accept a user message + optional file uploads, kick off the pipeline."""
    run_id = uuid.uuid4().hex[:12]

    # Save uploaded files to data/
    saved_files: list[str] = []
    for upload in files:
        dest = DATA_DIR / f"{run_id}_{upload.filename}"
        dest.write_bytes(await upload.read())
        saved_files.append(dest.name)

    primary_file = saved_files[0] if saved_files else ""
    filename = primary_file or "unknown"

    # Parse user intent via OpenRouter
    intent = await _parse_user_intent(message, filename)
    dataset_name: str = intent.get("dataset_name") or Path(filename).stem or run_id
    task: str = intent.get("task") or message

    # Write run_config.md
    _write_run_config(run_id, primary_file, dataset_name, task)

    # Spawn orchestrator in background
    background_tasks.add_task(_run_orchestrator, run_id)

    return {"run_id": run_id, "dataset_name": dataset_name}


@app.get("/status/{run_id}")
async def status(run_id: str) -> StreamingResponse:
    """SSE stream of pipeline status lines for the given run_id."""

    async def _event_stream():
        log_path = CONTEXT_DIR / "orchestrator_log.md"
        last_pos = 0
        idle_ticks = 0

        while idle_ticks < 60:  # give up after ~30 s of silence
            if log_path.exists():
                text = log_path.read_text()
                if len(text) > last_pos:
                    new_lines = text[last_pos:].splitlines()
                    last_pos = len(text)
                    idle_ticks = 0
                    for line in new_lines:
                        if run_id in line:
                            yield f"data: {line}\n\n"
                    # Signal completion to client
                    if any("complete" in ln or "halt" in ln for ln in new_lines if run_id in ln):
                        yield "data: done\n\n"
                        return
            await asyncio.sleep(0.5)
            idle_ticks += 1

        yield "data: timeout\n\n"

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/report/{run_id}")
async def report(run_id: str) -> FileResponse:
    """Serve the final PDF report for the given run_id."""
    # Look for any PDF matching the run_id in outputs/
    matches = list(OUTPUTS_DIR.glob(f"*{run_id}*.pdf"))
    if not matches:
        raise HTTPException(status_code=404, detail="Report not found or pipeline not complete.")
    return FileResponse(matches[0], media_type="application/pdf", filename=matches[0].name)
