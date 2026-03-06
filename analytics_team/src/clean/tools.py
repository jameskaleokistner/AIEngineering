"""Tool implementations for the Clean Specialist agent.

CleanState holds the in-memory DataFrame and all logged transformations.
Each tool function mutates state and returns a JSON-serialisable dict that
is sent back to Claude as the tool result.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from src.context_schema import ColumnInfo, QualityIssue, Transformation


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


@dataclass
class CleanState:
    df: pd.DataFrame | None = None
    transformations: list[Transformation] = field(default_factory=list)
    quality_issues: list[QualityIssue] = field(default_factory=list)
    row_count_before: int = 0
    finished: bool = False
    notes: str = ""
    _step: int = 0

    def _next_step(self) -> int:
        self._step += 1
        return self._step

    def log(self, column: str, action: str, reason: str) -> None:
        self.transformations.append(
            Transformation(step=self._next_step(), column=column, action=action, reason=reason)
        )

    def add_issue(self, issue: str, severity: str) -> None:
        self.quality_issues.append(QualityIssue(issue=issue, severity=severity))

    @property
    def schema(self) -> list[ColumnInfo]:
        if self.df is None:
            return []
        return [
            ColumnInfo(name=col, type=str(self.df[col].dtype), nulls=int(self.df[col].isna().sum()))
            for col in self.df.columns
        ]


# ---------------------------------------------------------------------------
# Tool functions
# ---------------------------------------------------------------------------


def inspect_dataframe(state: CleanState) -> dict[str, Any]:
    """Return current schema and sample rows. Read-only — nothing is logged."""
    if state.df is None:
        return {"error": "No dataframe loaded yet"}
    df = state.df
    columns = []
    for col in df.columns:
        sample = df[col].dropna().head(3).tolist()
        # Make sure sample values are JSON-serialisable
        sample = [v.isoformat() if hasattr(v, "isoformat") else v for v in sample]
        columns.append(
            {
                "name": col,
                "type": str(df[col].dtype),
                "nulls": int(df[col].isna().sum()),
                "sample_values": sample,
            }
        )
    return {"row_count": len(df), "column_count": len(df.columns), "columns": columns}


def parse_date_column(state: CleanState, column: str, format: str | None = None) -> dict[str, Any]:
    """Parse a column as datetime."""
    if state.df is None:
        return {"error": "No dataframe loaded"}
    if column not in state.df.columns:
        return {"error": f"Column '{column}' not found"}
    try:
        before_nulls = int(state.df[column].isna().sum())
        state.df[column] = pd.to_datetime(state.df[column], format=format, errors="coerce")
        after_nulls = int(state.df[column].isna().sum())
        new_nulls = after_nulls - before_nulls
        action = f"parsed to datetime{f' (format={format})' if format else ''}"
        if new_nulls > 0:
            action += f"; {new_nulls} unparseable values became NaT"
        state.log(column, action, f"standardise date column for analysis")
        return {"ok": True, "dtype": str(state.df[column].dtype), "new_nulls": new_nulls}
    except Exception as exc:
        return {"error": str(exc)}


def coerce_numeric_column(state: CleanState, column: str) -> dict[str, Any]:
    """Coerce a column to float64, setting non-numeric values to NaN."""
    if state.df is None:
        return {"error": "No dataframe loaded"}
    if column not in state.df.columns:
        return {"error": f"Column '{column}' not found"}
    before_nulls = int(state.df[column].isna().sum())
    state.df[column] = pd.to_numeric(state.df[column], errors="coerce")
    after_nulls = int(state.df[column].isna().sum())
    new_nulls = after_nulls - before_nulls
    action = f"coerced to float64"
    if new_nulls > 0:
        action += f"; {new_nulls} non-numeric values became NaN"
    state.log(column, action, "standardise numeric column for computation")
    return {"ok": True, "dtype": str(state.df[column].dtype), "new_nulls": new_nulls}


def rename_column(state: CleanState, old_name: str, new_name: str, reason: str) -> dict[str, Any]:
    """Rename a column."""
    if state.df is None:
        return {"error": "No dataframe loaded"}
    if old_name not in state.df.columns:
        return {"error": f"Column '{old_name}' not found"}
    state.df.rename(columns={old_name: new_name}, inplace=True)
    state.log(old_name, f"renamed to '{new_name}'", reason)
    return {"ok": True}


def drop_column(state: CleanState, column: str, reason: str) -> dict[str, Any]:
    """Drop a column entirely."""
    if state.df is None:
        return {"error": "No dataframe loaded"}
    if column not in state.df.columns:
        return {"error": f"Column '{column}' not found"}
    state.df.drop(columns=[column], inplace=True)
    state.log(column, "column dropped", reason)
    return {"ok": True}


def impute_missing(
    state: CleanState, column: str, strategy: str, reason: str, constant: Any = None
) -> dict[str, Any]:
    """Impute missing values. strategy: 'median' | 'mode' | 'constant'."""
    if state.df is None:
        return {"error": "No dataframe loaded"}
    if column not in state.df.columns:
        return {"error": f"Column '{column}' not found"}
    n_missing = int(state.df[column].isna().sum())
    if n_missing == 0:
        return {"ok": True, "imputed": 0, "message": "No missing values to impute"}

    if strategy == "median":
        fill_value = state.df[column].median()
        state.df[column] = state.df[column].fillna(fill_value)
        action = f"imputed {n_missing} nulls with column median ({fill_value:.4g})"
    elif strategy == "mode":
        fill_value = state.df[column].mode().iloc[0]
        state.df[column] = state.df[column].fillna(fill_value)
        action = f"imputed {n_missing} nulls with column mode ({fill_value!r})"
    elif strategy == "constant":
        state.df[column] = state.df[column].fillna(constant)
        action = f"imputed {n_missing} nulls with constant ({constant!r})"
    else:
        return {"error": f"Unknown strategy '{strategy}'. Use 'median', 'mode', or 'constant'"}

    state.log(column, action, reason)
    return {"ok": True, "imputed": n_missing, "strategy": strategy}


def drop_duplicates(state: CleanState, reason: str) -> dict[str, Any]:
    """Drop exact duplicate rows."""
    if state.df is None:
        return {"error": "No dataframe loaded"}
    before = len(state.df)
    state.df.drop_duplicates(inplace=True)
    state.df.reset_index(drop=True, inplace=True)
    dropped = before - len(state.df)
    if dropped > 0:
        state.log("*", f"dropped {dropped} duplicate rows", reason)
        state.add_issue(f"{dropped} duplicate rows removed", "medium")
    return {"ok": True, "dropped": dropped, "rows_remaining": len(state.df)}


def flag_outliers(
    state: CleanState, column: str, std_threshold: float = 3.0
) -> dict[str, Any]:
    """Add a boolean '<column>_outlier' column for rows beyond std_threshold std devs."""
    if state.df is None:
        return {"error": "No dataframe loaded"}
    if column not in state.df.columns:
        return {"error": f"Column '{column}' not found"}
    try:
        series = pd.to_numeric(state.df[column], errors="coerce")
        mean = series.mean()
        std = series.std()
        if std == 0 or pd.isna(std):
            return {"ok": True, "flagged": 0, "message": "Zero std dev — no outliers flagged"}
        flag_col = f"{column}_outlier"
        state.df[flag_col] = ((series - mean).abs() > std_threshold * std)
        n_flagged = int(state.df[flag_col].sum())
        state.log(
            column,
            f"flagged {n_flagged} outliers (>{std_threshold}σ) in new column '{flag_col}'",
            f"outliers noted for analyst review; rows retained",
        )
        if n_flagged > 0:
            state.add_issue(
                f"{n_flagged} outliers in '{column}' (>{std_threshold}σ from mean)", "low"
            )
        return {"ok": True, "flagged": n_flagged, "flag_column": flag_col}
    except Exception as exc:
        return {"error": str(exc)}


def create_dataframe_from_records(
    state: CleanState, records: list[dict[str, Any]]
) -> dict[str, Any]:
    """Create a DataFrame from a list of row dicts extracted from a PDF or image."""
    if not records:
        return {"error": "records list is empty"}
    try:
        state.df = pd.DataFrame(records)
        state.row_count_before = len(state.df)
        state.log(
            "*",
            f"created DataFrame from {len(records)} extracted records ({len(state.df.columns)} columns)",
            "data extracted from PDF/image content",
        )
        return {
            "ok": True,
            "row_count": len(state.df),
            "columns": list(state.df.columns),
        }
    except Exception as exc:
        return {"error": str(exc)}


def report_quality_issue(state: CleanState, issue: str, severity: str) -> dict[str, Any]:
    """Log a quality issue without performing any transformation."""
    valid = {"low", "medium", "high", "critical"}
    if severity not in valid:
        return {"error": f"severity must be one of {valid}"}
    state.add_issue(issue, severity)
    return {"ok": True}


def finish_cleaning(state: CleanState, notes: str = "") -> dict[str, Any]:
    """Signal that cleaning is complete. Sets state.finished = True."""
    state.finished = True
    state.notes = notes
    return {"ok": True, "message": "Cleaning marked as complete"}


# ---------------------------------------------------------------------------
# Tool schemas (passed to Claude)
# ---------------------------------------------------------------------------

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "inspect_dataframe",
        "description": (
            "Return the current schema (column names, dtypes, null counts) and up to 3 sample "
            "values per column. Use this to understand the data before deciding what to clean. "
            "Read-only — nothing is logged."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "parse_date_column",
        "description": "Parse a column as datetime. Unparseable values become NaT.",
        "input_schema": {
            "type": "object",
            "properties": {
                "column": {"type": "string", "description": "Column name to parse"},
                "format": {
                    "type": "string",
                    "description": "Optional strptime format string (e.g. '%Y-%m-%d'). Omit to auto-detect.",
                },
            },
            "required": ["column"],
        },
    },
    {
        "name": "coerce_numeric_column",
        "description": "Coerce a column to float64. Non-numeric values become NaN.",
        "input_schema": {
            "type": "object",
            "properties": {
                "column": {"type": "string", "description": "Column name to coerce"},
            },
            "required": ["column"],
        },
    },
    {
        "name": "rename_column",
        "description": "Rename a column.",
        "input_schema": {
            "type": "object",
            "properties": {
                "old_name": {"type": "string"},
                "new_name": {"type": "string"},
                "reason": {"type": "string", "description": "Why the column is being renamed"},
            },
            "required": ["old_name", "new_name", "reason"],
        },
    },
    {
        "name": "drop_column",
        "description": "Drop a column entirely. Must provide a reason.",
        "input_schema": {
            "type": "object",
            "properties": {
                "column": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["column", "reason"],
        },
    },
    {
        "name": "impute_missing",
        "description": (
            "Impute missing values in a column. strategy must be 'median', 'mode', or 'constant'. "
            "For 'constant', also provide the constant value."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "column": {"type": "string"},
                "strategy": {
                    "type": "string",
                    "enum": ["median", "mode", "constant"],
                },
                "reason": {"type": "string", "description": "Why this imputation is appropriate"},
                "constant": {
                    "description": "Fill value when strategy='constant'",
                },
            },
            "required": ["column", "strategy", "reason"],
        },
    },
    {
        "name": "drop_duplicates",
        "description": "Drop exact duplicate rows. Must provide a reason.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reason": {"type": "string"},
            },
            "required": ["reason"],
        },
    },
    {
        "name": "flag_outliers",
        "description": (
            "Add a boolean '<column>_outlier' flag column for rows more than std_threshold "
            "standard deviations from the mean. Rows are NOT dropped."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "column": {"type": "string"},
                "std_threshold": {
                    "type": "number",
                    "description": "Number of std devs beyond which a value is an outlier (default 3.0)",
                },
            },
            "required": ["column"],
        },
    },
    {
        "name": "create_dataframe_from_records",
        "description": (
            "Create the working DataFrame from a list of row dicts. Use this when the input "
            "file was a PDF or image — extract the tabular data yourself and pass it here."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "records": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "List of row dicts, one per data row. Keys are column names.",
                },
            },
            "required": ["records"],
        },
    },
    {
        "name": "report_quality_issue",
        "description": "Log a data quality issue without performing any transformation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "issue": {"type": "string", "description": "Description of the quality issue"},
                "severity": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                },
            },
            "required": ["issue", "severity"],
        },
    },
    {
        "name": "finish_cleaning",
        "description": (
            "Call this when all cleaning is complete. Pass any final notes about the dataset."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "notes": {
                    "type": "string",
                    "description": "Optional notes about the dataset or cleaning decisions",
                },
            },
            "required": [],
        },
    },
]


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

_TOOL_FN_MAP = {
    "inspect_dataframe": lambda state, args: inspect_dataframe(state),
    "parse_date_column": lambda state, args: parse_date_column(state, **args),
    "coerce_numeric_column": lambda state, args: coerce_numeric_column(state, **args),
    "rename_column": lambda state, args: rename_column(state, **args),
    "drop_column": lambda state, args: drop_column(state, **args),
    "impute_missing": lambda state, args: impute_missing(state, **args),
    "drop_duplicates": lambda state, args: drop_duplicates(state, **args),
    "flag_outliers": lambda state, args: flag_outliers(state, **args),
    "create_dataframe_from_records": lambda state, args: create_dataframe_from_records(
        state, **args
    ),
    "report_quality_issue": lambda state, args: report_quality_issue(state, **args),
    "finish_cleaning": lambda state, args: finish_cleaning(state, **args),
}


def dispatch_tool(name: str, args: dict[str, Any], state: CleanState) -> dict[str, Any]:
    """Dispatch a tool call from Claude to the appropriate function."""
    fn = _TOOL_FN_MAP.get(name)
    if fn is None:
        return {"error": f"Unknown tool '{name}'"}
    return fn(state, args)
