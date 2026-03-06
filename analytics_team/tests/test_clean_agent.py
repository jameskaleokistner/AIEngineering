"""Tests for the Clean Specialist: tool unit tests + integration tests."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from src.clean.tools import (
    CleanState,
    coerce_numeric_column,
    create_dataframe_from_records,
    dispatch_tool,
    drop_column,
    drop_duplicates,
    finish_cleaning,
    flag_outliers,
    impute_missing,
    inspect_dataframe,
    parse_date_column,
    rename_column,
    report_quality_issue,
)
from src.context_schema import Instructions, RunConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_state(data: dict | None = None) -> CleanState:
    """Return a CleanState optionally pre-loaded with a DataFrame."""
    state = CleanState()
    if data is not None:
        state.df = pd.DataFrame(data)
        state.row_count_before = len(state.df)
    return state


def _sample_df() -> dict:
    return {
        "date": ["2026-01-01", "2026-01-02", "2026-01-03"],
        "revenue": [100.0, None, 300.0],
        "category": ["A", "B", None],
        "score": [10, 200, 15],  # 200 is an outlier
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def state() -> CleanState:
    return _make_state(_sample_df())


@pytest.fixture()
def run_config(tmp_path: Path) -> RunConfig:
    csv_path = tmp_path / "data" / "run1_sales.csv"
    csv_path.parent.mkdir(parents=True)
    pd.DataFrame(_sample_df()).to_csv(csv_path, index=False)
    return RunConfig(
        run_id="run1",
        input_file=f"data/run1_sales.csv",
        dataset_name="sales",
        user_prompt="Clean the sales data",
    )


@pytest.fixture()
def instructions() -> Instructions:
    return Instructions(
        stage="clean",
        run_id="run1",
        task="Clean the sales dataset: parse dates, coerce numeric columns, impute missing values.",
        inputs=["data/run1_sales.csv"],
        output_requirements=["CLEAN_OUTPUT.md", "cleaned_data/cleaned_run1.parquet"],
        constraints=["Log every transformation with a reason", "Do not drop rows without logging"],
    )


# ---------------------------------------------------------------------------
# Unit tests: inspect_dataframe
# ---------------------------------------------------------------------------


def test_inspect_dataframe_returns_schema(state: CleanState) -> None:
    result = inspect_dataframe(state)
    assert result["row_count"] == 3
    assert result["column_count"] == 4
    col_names = [c["name"] for c in result["columns"]]
    assert "date" in col_names
    assert "revenue" in col_names


def test_inspect_dataframe_no_df() -> None:
    result = inspect_dataframe(CleanState())
    assert "error" in result


def test_inspect_dataframe_reports_nulls(state: CleanState) -> None:
    result = inspect_dataframe(state)
    revenue_col = next(c for c in result["columns"] if c["name"] == "revenue")
    assert revenue_col["nulls"] == 1


# ---------------------------------------------------------------------------
# Unit tests: parse_date_column
# ---------------------------------------------------------------------------


def test_parse_date_column_ok(state: CleanState) -> None:
    result = parse_date_column(state, "date")
    assert result["ok"] is True
    assert str(state.df["date"].dtype).startswith("datetime64")
    assert len(state.transformations) == 1
    assert "datetime" in state.transformations[0].action


def test_parse_date_column_missing_col(state: CleanState) -> None:
    result = parse_date_column(state, "nonexistent")
    assert "error" in result


# ---------------------------------------------------------------------------
# Unit tests: coerce_numeric_column
# ---------------------------------------------------------------------------


def test_coerce_numeric_column_ok() -> None:
    s = _make_state({"price": ["1.5", "bad", "3.0"]})
    result = coerce_numeric_column(s, "price")
    assert result["ok"] is True
    assert result["new_nulls"] == 1
    assert s.df["price"].dtype == "float64"
    assert len(s.transformations) == 1


def test_coerce_numeric_column_missing_col(state: CleanState) -> None:
    result = coerce_numeric_column(state, "bogus")
    assert "error" in result


# ---------------------------------------------------------------------------
# Unit tests: rename_column
# ---------------------------------------------------------------------------


def test_rename_column(state: CleanState) -> None:
    result = rename_column(state, "revenue", "sales_revenue", "normalise column name")
    assert result["ok"] is True
    assert "sales_revenue" in state.df.columns
    assert "revenue" not in state.df.columns
    assert state.transformations[0].action == "renamed to 'sales_revenue'"


# ---------------------------------------------------------------------------
# Unit tests: drop_column
# ---------------------------------------------------------------------------


def test_drop_column(state: CleanState) -> None:
    result = drop_column(state, "category", "not needed for analysis")
    assert result["ok"] is True
    assert "category" not in state.df.columns
    assert len(state.transformations) == 1


# ---------------------------------------------------------------------------
# Unit tests: impute_missing
# ---------------------------------------------------------------------------


def test_impute_missing_median(state: CleanState) -> None:
    result = impute_missing(state, "revenue", "median", "required for KPI computation")
    assert result["ok"] is True
    assert result["imputed"] == 1
    assert state.df["revenue"].isna().sum() == 0
    assert "median" in state.transformations[0].action


def test_impute_missing_mode(state: CleanState) -> None:
    result = impute_missing(state, "category", "mode", "categorical column")
    assert result["ok"] is True
    assert state.df["category"].isna().sum() == 0
    assert "mode" in state.transformations[0].action


def test_impute_missing_constant(state: CleanState) -> None:
    result = impute_missing(state, "category", "constant", "fill with unknown", constant="Unknown")
    assert result["ok"] is True
    assert (state.df["category"] == "Unknown").any()


def test_impute_missing_no_nulls() -> None:
    s = _make_state({"x": [1, 2, 3]})
    result = impute_missing(s, "x", "median", "just in case")
    assert result["imputed"] == 0
    assert len(s.transformations) == 0  # nothing to log when no nulls


def test_impute_missing_bad_strategy(state: CleanState) -> None:
    result = impute_missing(state, "revenue", "mean", "bad strategy")
    assert "error" in result


# ---------------------------------------------------------------------------
# Unit tests: drop_duplicates
# ---------------------------------------------------------------------------


def test_drop_duplicates_removes_dupes() -> None:
    s = _make_state({"a": [1, 1, 2], "b": [10, 10, 20]})
    result = drop_duplicates(s, "remove duplicate rows")
    assert result["dropped"] == 1
    assert result["rows_remaining"] == 2
    assert len(s.transformations) == 1
    assert len(s.quality_issues) == 1


def test_drop_duplicates_no_dupes(state: CleanState) -> None:
    result = drop_duplicates(state, "standard dedup")
    assert result["dropped"] == 0
    assert len(state.transformations) == 0  # no log when nothing dropped


# ---------------------------------------------------------------------------
# Unit tests: flag_outliers
# ---------------------------------------------------------------------------


def test_flag_outliers_creates_column(state: CleanState) -> None:
    # With only 3 data points [10, 200, 15] the sample std is ~108, so 200 is
    # ~1.2σ above the mean (75). Use threshold=1.0 so the outlier is detected.
    result = flag_outliers(state, "score", std_threshold=1.0)
    assert result["ok"] is True
    assert "score_outlier" in state.df.columns
    assert result["flagged"] == 1  # 200 is >1σ above mean
    assert state.df.loc[state.df["score"] == 200, "score_outlier"].all()
    assert len(state.transformations) == 1
    assert len(state.quality_issues) == 1


def test_flag_outliers_missing_col(state: CleanState) -> None:
    result = flag_outliers(state, "nonexistent")
    assert "error" in result


def test_flag_outliers_zero_std() -> None:
    s = _make_state({"x": [5, 5, 5]})
    result = flag_outliers(s, "x")
    assert result["ok"] is True
    assert result["flagged"] == 0


# ---------------------------------------------------------------------------
# Unit tests: create_dataframe_from_records
# ---------------------------------------------------------------------------


def test_create_dataframe_from_records() -> None:
    state = CleanState()
    records = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
    result = create_dataframe_from_records(state, records)
    assert result["ok"] is True
    assert state.df is not None
    assert len(state.df) == 2
    assert list(state.df.columns) == ["name", "age"]
    assert state.row_count_before == 2
    assert len(state.transformations) == 1


def test_create_dataframe_from_records_empty() -> None:
    state = CleanState()
    result = create_dataframe_from_records(state, [])
    assert "error" in result


# ---------------------------------------------------------------------------
# Unit tests: report_quality_issue
# ---------------------------------------------------------------------------


def test_report_quality_issue(state: CleanState) -> None:
    result = report_quality_issue(state, "3 negative revenue values", "high")
    assert result["ok"] is True
    assert len(state.quality_issues) == 1
    assert state.quality_issues[0].severity == "high"


def test_report_quality_issue_bad_severity(state: CleanState) -> None:
    result = report_quality_issue(state, "something", "extreme")
    assert "error" in result


# ---------------------------------------------------------------------------
# Unit tests: finish_cleaning
# ---------------------------------------------------------------------------


def test_finish_cleaning(state: CleanState) -> None:
    result = finish_cleaning(state, notes="Dataset spans Q1 2026")
    assert result["ok"] is True
    assert state.finished is True
    assert state.notes == "Dataset spans Q1 2026"


# ---------------------------------------------------------------------------
# Unit tests: dispatch_tool
# ---------------------------------------------------------------------------


def test_dispatch_tool_unknown(state: CleanState) -> None:
    result = dispatch_tool("nonexistent_tool", {}, state)
    assert "error" in result


def test_dispatch_tool_finish_cleaning(state: CleanState) -> None:
    result = dispatch_tool("finish_cleaning", {"notes": "done"}, state)
    assert result["ok"] is True
    assert state.finished is True


# ---------------------------------------------------------------------------
# Integration tests: run() with mocked Anthropic client
# ---------------------------------------------------------------------------


def _fake_block(type: str, **kwargs: Any) -> SimpleNamespace:
    return SimpleNamespace(type=type, **kwargs)


def _fake_response(stop_reason: str, *content_blocks: Any) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=list(content_blocks))


def _make_mock_client(response_sequence: list[Any]) -> MagicMock:
    """Build a mock anthropic.Anthropic() whose messages.create() returns responses in order."""
    call_count = [0]

    def fake_create(**kwargs: Any) -> Any:
        idx = call_count[0]
        call_count[0] += 1
        return response_sequence[idx]

    mock_client = MagicMock()
    mock_client.messages.create.side_effect = fake_create
    return mock_client


def test_run_full_pipeline_csv(tmp_path: Path, run_config: RunConfig, instructions: Instructions) -> None:
    """Happy-path integration test: clean a CSV, produce valid CleanOutput + parquet."""
    # Simulate Claude: inspect → drop_dupes → flag_outliers → finish
    responses = [
        # 1st call: Claude calls inspect_dataframe
        _fake_response(
            "tool_use",
            _fake_block("tool_use", id="t1", name="inspect_dataframe", input={}),
        ),
        # 2nd call: Claude calls drop_duplicates
        _fake_response(
            "tool_use",
            _fake_block(
                "tool_use",
                id="t2",
                name="drop_duplicates",
                input={"reason": "remove exact duplicate rows"},
            ),
        ),
        # 3rd call: Claude calls flag_outliers on score
        _fake_response(
            "tool_use",
            _fake_block(
                "tool_use",
                id="t3",
                name="flag_outliers",
                input={"column": "score", "std_threshold": 3.0},
            ),
        ),
        # 4th call: Claude calls finish_cleaning
        _fake_response(
            "tool_use",
            _fake_block(
                "tool_use",
                id="t4",
                name="finish_cleaning",
                input={"notes": "Dataset looks clean."},
            ),
        ),
    ]
    mock_client = _make_mock_client(responses)

    from src.clean.agent import run

    with patch("src.clean.agent.anthropic.Anthropic", return_value=mock_client):
        output = run(run_config, instructions, base_dir=tmp_path)

    # --- Status ---
    assert output.status == "success"

    # --- Schema fields present ---
    assert output.source_file != ""
    assert output.loaded_at != ""
    assert output.row_count_before > 0
    assert output.column_count > 0
    assert len(output.columns) > 0

    # --- Transformations logged ---
    assert len(output.transformations) > 0

    # --- Row loss is explainable ---
    # No rows should be dropped here (no dupes in sample data, flag_outliers doesn't drop)
    assert output.row_count_after <= output.row_count_before

    # --- Parquet file is valid ---
    parquet_path = tmp_path / output.clean_data_path
    assert parquet_path.exists(), f"Parquet not found at {parquet_path}"
    df = pd.read_parquet(parquet_path)
    assert len(df) == output.row_count_after

    # --- CLEAN_OUTPUT.md written and round-trips ---
    context_file = tmp_path / "context" / "CLEAN_OUTPUT.md"
    assert context_file.exists()
    from src.context_schema import CleanOutput
    loaded = CleanOutput.from_md(context_file)
    assert loaded == output


def test_run_unsupported_file_type(tmp_path: Path) -> None:
    """run() returns status='failed' for an unsupported file extension."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    bad_file = data_dir / "run99_data.xyz"
    bad_file.write_text("not real data")

    config = RunConfig(
        run_id="run99",
        input_file="data/run99_data.xyz",
        dataset_name="bad",
        user_prompt="analyse",
    )
    instructions = Instructions(
        stage="clean",
        run_id="run99",
        task="clean it",
        inputs=["data/run99_data.xyz"],
        output_requirements=[],
        constraints=[],
    )

    from src.clean.agent import run

    output = run(config, instructions, base_dir=tmp_path)
    assert output.status == "failed"
    assert "Unsupported file type" in output.notes


def test_run_with_duplicates_row_loss_logged(tmp_path: Path) -> None:
    """Row loss from duplicate removal must be reflected in row_count_before vs row_count_after."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    # CSV with 2 exact duplicate rows
    csv_path = data_dir / "rundup_sales.csv"
    df = pd.DataFrame({"a": [1, 1, 2], "b": [10, 10, 20]})
    df.to_csv(csv_path, index=False)

    config = RunConfig(
        run_id="rundup",
        input_file="data/rundup_sales.csv",
        dataset_name="dup_data",
        user_prompt="clean",
    )
    instr = Instructions(
        stage="clean",
        run_id="rundup",
        task="drop duplicates",
        inputs=["data/rundup_sales.csv"],
        output_requirements=["CLEAN_OUTPUT.md"],
        constraints=["Log all row removals"],
    )

    responses = [
        _fake_response(
            "tool_use",
            _fake_block(
                "tool_use",
                id="t1",
                name="drop_duplicates",
                input={"reason": "remove duplicate rows"},
            ),
        ),
        _fake_response(
            "tool_use",
            _fake_block("tool_use", id="t2", name="finish_cleaning", input={"notes": ""}),
        ),
    ]
    mock_client = _make_mock_client(responses)

    from src.clean.agent import run

    with patch("src.clean.agent.anthropic.Anthropic", return_value=mock_client):
        output = run(config, instr, base_dir=tmp_path)

    assert output.status == "success"
    assert output.row_count_before == 3
    assert output.row_count_after == 2

    # Drop must be logged
    drop_logs = [t for t in output.transformations if "duplicate" in t.action.lower()]
    assert len(drop_logs) >= 1
