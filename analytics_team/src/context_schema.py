"""Pydantic models for all handoff files in the analytics pipeline.

Each model provides:
  to_md(path)   — write the model to a .md file
  from_md(path) — load the model from a .md file

RunConfig uses key: value text format (compatible with backend/main.py's writer).
All other models use JSON serialization for reliable round-trips with nested data.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------


class ColumnInfo(BaseModel):
    name: str
    type: str
    nulls: int


class Transformation(BaseModel):
    step: int
    column: str
    action: str
    reason: str


class QualityIssue(BaseModel):
    issue: str
    severity: str  # "low" | "medium" | "high" | "critical"


class KPI(BaseModel):
    name: str
    value: float | str
    source_columns: list[str]
    method: str


class Trend(BaseModel):
    description: str
    evidence: str
    direction: str  # "up" | "down" | "stable"


class Segment(BaseModel):
    name: str
    size: int
    key_difference: str


class Anomaly(BaseModel):
    description: str
    affected_rows: int
    severity: str


class Insight(BaseModel):
    finding: str
    recommendation: str


class ValidationIssue(BaseModel):
    check: str
    finding: str
    severity: str


# ---------------------------------------------------------------------------
# Top-level handoff models
# ---------------------------------------------------------------------------


class RunConfig(BaseModel):
    """Written by the backend; read by the Orchestrator."""

    run_id: str
    input_file: str
    dataset_name: str
    user_prompt: str

    def to_md(self, path: Path) -> None:
        """Write in key: value format for backend compatibility."""
        path.write_text(
            f"run_id: {self.run_id}\n"
            f"input_file: {self.input_file}\n"
            f"dataset_name: {self.dataset_name}\n"
            f"user_prompt: {self.user_prompt}\n"
        )

    @classmethod
    def from_md(cls, path: Path) -> RunConfig:
        """Parse key: value format (also accepts JSON for round-trip tests)."""
        text = path.read_text()
        # Try JSON first (produced by to_md in tests or future callers)
        stripped = text.strip()
        if stripped.startswith("{"):
            return cls.model_validate_json(stripped)
        # Legacy key: value format written by backend/main.py
        data: dict[str, str] = {}
        for line in text.splitlines():
            if ": " in line:
                key, _, value = line.partition(": ")
                data[key.strip()] = value.strip()
        return cls.model_validate(data)


class Instructions(BaseModel):
    """Written by the Orchestrator before each specialist runs."""

    stage: str
    run_id: str
    task: str
    inputs: list[str]
    output_requirements: list[str]
    constraints: list[str]

    def to_md(self, path: Path) -> None:
        path.write_text(self.model_dump_json(indent=2))

    @classmethod
    def from_md(cls, path: Path) -> Instructions:
        return cls.model_validate_json(path.read_text())


class CleanOutput(BaseModel):
    """Written by the Clean Specialist."""

    status: str
    source_file: str
    loaded_at: str
    row_count_before: int
    row_count_after: int
    column_count: int
    columns: list[ColumnInfo]
    clean_data_path: str
    transformations: list[Transformation]
    quality_issues: list[QualityIssue]
    notes: str = ""

    def to_md(self, path: Path) -> None:
        path.write_text(self.model_dump_json(indent=2))

    @classmethod
    def from_md(cls, path: Path) -> CleanOutput:
        return cls.model_validate_json(path.read_text())


class AnalyzeOutput(BaseModel):
    """Written by the Analyze Specialist."""

    status: str
    kpis: list[KPI]
    trends: list[Trend]
    segments: list[Segment]
    anomalies: list[Anomaly]
    insights: list[Insight]
    notes: str = ""

    def to_md(self, path: Path) -> None:
        path.write_text(self.model_dump_json(indent=2))

    @classmethod
    def from_md(cls, path: Path) -> AnalyzeOutput:
        return cls.model_validate_json(path.read_text())


class ValidationOutput(BaseModel):
    """Written by the QA Validator."""

    verdict: str  # "pass" | "fail"
    stage: str
    revision_attempt: int
    instructions_followed: str  # "true" | "false" | "partial"
    checks_passed: list[str]
    issues: list[ValidationIssue]
    feedback: str

    def to_md(self, path: Path) -> None:
        path.write_text(self.model_dump_json(indent=2))

    @classmethod
    def from_md(cls, path: Path) -> ValidationOutput:
        return cls.model_validate_json(path.read_text())
