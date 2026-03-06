"""Clean Specialist agent.

Entry point: run(config, instructions) -> CleanOutput

The agent loads the input file, sends it (or its schema) to Claude Sonnet
along with the Orchestrator's instructions, and runs a tool-use loop until
Claude calls finish_cleaning. All transformations are logged via CleanState.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
import pandas as pd
from dotenv import load_dotenv

from src.clean.tools import TOOL_SCHEMAS, CleanState, dispatch_tool
from src.context_schema import CleanOutput, Instructions, RunConfig

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 8096

# File extensions that can be loaded directly into a DataFrame
_TABULAR_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json", ".parquet"}
# Image extensions passed as image content blocks
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
_IMAGE_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}
# All supported extensions (unsupported → status: "failed")
_SUPPORTED_EXTENSIONS = _TABULAR_EXTENSIONS | _IMAGE_EXTENSIONS | {".pdf"}

_SYSTEM_PROMPT = """You are the Clean Specialist agent on an analytics team. Your job is to clean \
and standardise data files so they are ready for downstream analysis.

You have a set of tools to inspect, transform, and finalise data. Work methodically:
1. Call inspect_dataframe to understand the current state of the data.
2. Follow the instructions provided. Apply all necessary cleaning steps.
3. Log every transformation via the appropriate tool — never make silent changes.
4. Flag quality issues honestly using report_quality_issue.
5. When all cleaning is done, call finish_cleaning with any relevant notes.

Rules:
- Never drop rows without logging why.
- Never impute values without providing a clear reason.
- Flag outliers but do NOT drop them unless the instructions specifically say to.
- If the input is a PDF or image, extract the tabular data and call \
create_dataframe_from_records before applying any other tools.
"""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_tabular(file_path: Path) -> tuple[pd.DataFrame, int]:
    """Load a tabular file into a DataFrame. Returns (df, row_count_before)."""
    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(file_path)
    elif suffix in {".xlsx", ".xls"}:
        df = pd.read_excel(file_path)
    elif suffix == ".json":
        df = pd.read_json(file_path)
    elif suffix == ".parquet":
        df = pd.read_parquet(file_path)
    else:
        raise ValueError(f"Unsupported tabular extension: {suffix}")
    return df, len(df)


def _build_initial_content(
    config: RunConfig,
    instructions: Instructions,
    file_path: Path,
    state: CleanState,
) -> list[dict[str, Any]]:
    """Build the list of content blocks for the first user message."""
    suffix = file_path.suffix.lower()
    task_text = (
        f"Dataset: {config.dataset_name}\n"
        f"File: {file_path.name}\n\n"
        f"Task from Orchestrator:\n{instructions.task}\n\n"
        f"Output requirements:\n"
        + "\n".join(f"- {r}" for r in instructions.output_requirements)
        + "\n\nConstraints:\n"
        + "\n".join(f"- {c}" for c in instructions.constraints)
    )

    if suffix in _TABULAR_EXTENSIONS:
        # DataFrame already loaded into state; show the schema as context
        from src.clean.tools import inspect_dataframe  # local import to avoid circularity

        schema_info = inspect_dataframe(state)
        schema_json = json.dumps(schema_info, indent=2, default=str)
        return [
            {
                "type": "text",
                "text": (
                    f"{task_text}\n\n"
                    f"Current schema:\n{schema_json}\n\n"
                    "Use the tools to clean the data."
                ),
            }
        ]

    if suffix == ".pdf":
        raw = base64.standard_b64encode(file_path.read_bytes()).decode()
        return [
            {
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": raw},
            },
            {
                "type": "text",
                "text": (
                    f"{task_text}\n\n"
                    "This is a PDF. Extract all tabular data and call "
                    "create_dataframe_from_records with the extracted rows. "
                    "Then clean the resulting DataFrame per the instructions."
                ),
            },
        ]

    if suffix in _IMAGE_EXTENSIONS:
        media_type = _IMAGE_MEDIA_TYPES[suffix]
        raw = base64.standard_b64encode(file_path.read_bytes()).decode()
        return [
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": raw},
            },
            {
                "type": "text",
                "text": (
                    f"{task_text}\n\n"
                    "This is an image. Extract all tabular data visible in the image and call "
                    "create_dataframe_from_records with the extracted rows. "
                    "Then clean the resulting DataFrame per the instructions."
                ),
            },
        ]

    # Should never reach here — caller checks _SUPPORTED_EXTENSIONS first
    raise ValueError(f"Cannot build content for extension: {suffix}")


def _run_agent_loop(
    client: anthropic.Anthropic,
    initial_content: list[dict[str, Any]],
    state: CleanState,
) -> None:
    """Run the Claude tool-use loop until Claude calls finish_cleaning or stops."""
    messages: list[dict[str, Any]] = [{"role": "user", "content": initial_content}]

    while not state.finished:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=_SYSTEM_PROMPT,
            tools=TOOL_SCHEMAS,  # type: ignore[arg-type]
            messages=messages,
        )

        # Append the full assistant turn to the conversation
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            # Claude finished without calling finish_cleaning — treat as done
            break

        if response.stop_reason == "tool_use":
            tool_results: list[dict[str, Any]] = []
            for block in response.content:
                if block.type == "tool_use":
                    result = dispatch_tool(block.name, block.input, state)
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, default=str),
                        }
                    )
            messages.append({"role": "user", "content": tool_results})

            if state.finished:
                break


def _failed_output(source_file: str, loaded_at: str, notes: str) -> CleanOutput:
    """Return a minimal CleanOutput with status='failed'."""
    return CleanOutput(
        status="failed",
        source_file=source_file,
        loaded_at=loaded_at,
        row_count_before=0,
        row_count_after=0,
        column_count=0,
        columns=[],
        clean_data_path="",
        transformations=[],
        quality_issues=[],
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def run(
    config: RunConfig,
    instructions: Instructions,
    base_dir: Path | None = None,
) -> CleanOutput:
    """Run the Clean Specialist agent.

    Args:
        config: Parsed run_config.md.
        instructions: Parsed instructions_clean.md written by the Orchestrator.
        base_dir: Project root directory. Defaults to CWD.

    Returns:
        CleanOutput with status 'success' or 'failed'.
    """
    load_dotenv()
    base_dir = base_dir or Path.cwd()
    loaded_at = datetime.now(timezone.utc).isoformat()

    file_path = base_dir / config.input_file
    suffix = file_path.suffix.lower()

    # ------------------------------------------------------------------ #
    # Guard: unsupported file type                                         #
    # ------------------------------------------------------------------ #
    if suffix not in _SUPPORTED_EXTENSIONS:
        return _failed_output(
            source_file=str(file_path),
            loaded_at=loaded_at,
            notes=f"Unsupported file type '{suffix}'. Supported: {sorted(_SUPPORTED_EXTENSIONS)}",
        )

    # ------------------------------------------------------------------ #
    # Initialise state                                                     #
    # ------------------------------------------------------------------ #
    state = CleanState()

    # Load tabular files eagerly so Claude sees the schema in the first message
    if suffix in _TABULAR_EXTENSIONS:
        try:
            state.df, state.row_count_before = _load_tabular(file_path)
        except Exception as exc:
            return _failed_output(
                source_file=str(file_path),
                loaded_at=loaded_at,
                notes=f"Failed to load file: {exc}",
            )

    # ------------------------------------------------------------------ #
    # Build initial message and run agent loop                             #
    # ------------------------------------------------------------------ #
    try:
        initial_content = _build_initial_content(config, instructions, file_path, state)
    except Exception as exc:
        return _failed_output(
            source_file=str(file_path),
            loaded_at=loaded_at,
            notes=f"Failed to build initial message: {exc}",
        )

    client = anthropic.Anthropic()
    _run_agent_loop(client, initial_content, state)

    # ------------------------------------------------------------------ #
    # Save cleaned data                                                    #
    # ------------------------------------------------------------------ #
    if state.df is None:
        return _failed_output(
            source_file=str(file_path),
            loaded_at=loaded_at,
            notes="Agent finished without producing a DataFrame",
        )

    cleaned_data_dir = base_dir / "cleaned_data"
    cleaned_data_dir.mkdir(parents=True, exist_ok=True)
    parquet_path = cleaned_data_dir / f"cleaned_{config.run_id}.parquet"

    try:
        state.df.to_parquet(parquet_path, index=False)
    except Exception as exc:
        return _failed_output(
            source_file=str(file_path),
            loaded_at=loaded_at,
            notes=f"Failed to save parquet: {exc}",
        )

    # ------------------------------------------------------------------ #
    # Assemble and write CleanOutput                                       #
    # ------------------------------------------------------------------ #
    output = CleanOutput(
        status="success",
        source_file=str(file_path),
        loaded_at=loaded_at,
        row_count_before=state.row_count_before,
        row_count_after=len(state.df),
        column_count=len(state.df.columns),
        columns=state.schema,
        clean_data_path=str(parquet_path.relative_to(base_dir)),
        transformations=state.transformations,
        quality_issues=state.quality_issues,
        notes=state.notes,
    )

    context_dir = base_dir / "context"
    context_dir.mkdir(parents=True, exist_ok=True)
    output.to_md(context_dir / "CLEAN_OUTPUT.md")

    return output
