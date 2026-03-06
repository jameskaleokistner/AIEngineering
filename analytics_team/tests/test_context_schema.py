"""Round-trip tests for all context handoff schemas."""

from pathlib import Path

from src.context_schema import (
    KPI,
    AnalyzeOutput,
    Anomaly,
    CleanOutput,
    ColumnInfo,
    Insight,
    Instructions,
    QualityIssue,
    RunConfig,
    Segment,
    Transformation,
    Trend,
    ValidationIssue,
    ValidationOutput,
)


def test_run_config_round_trip(tmp_path: Path) -> None:
    config = RunConfig(
        run_id="abc123",
        input_file="data/abc123_sales.csv",
        dataset_name="sales_data",
        user_prompt="Analyze Q3 revenue by region",
    )
    path = tmp_path / "run_config.md"
    config.to_md(path)
    loaded = RunConfig.from_md(path)
    assert loaded == config


def test_run_config_from_legacy_key_value(tmp_path: Path) -> None:
    """from_md must parse the key: value format written by backend/main.py."""
    path = tmp_path / "run_config.md"
    path.write_text(
        "run_id: abc123\n"
        "input_file: data/abc123_sales.csv\n"
        "dataset_name: sales_data\n"
        "user_prompt: Analyze Q3 revenue by region\n"
    )
    loaded = RunConfig.from_md(path)
    assert loaded.run_id == "abc123"
    assert loaded.input_file == "data/abc123_sales.csv"
    assert loaded.dataset_name == "sales_data"
    assert loaded.user_prompt == "Analyze Q3 revenue by region"


def test_instructions_round_trip(tmp_path: Path) -> None:
    instructions = Instructions(
        stage="clean",
        run_id="abc123",
        task="Load and clean the Q3 sales CSV, standardize dates and numeric columns.",
        inputs=["data/abc123_sales.csv", "context/run_config.md"],
        output_requirements=["CLEAN_OUTPUT.md", "cleaned_data/cleaned_abc123.parquet"],
        constraints=["Log every transformation with a reason", "Do not drop rows without logging"],
    )
    path = tmp_path / "instructions_clean.md"
    instructions.to_md(path)
    loaded = Instructions.from_md(path)
    assert loaded == instructions


def test_clean_output_round_trip(tmp_path: Path) -> None:
    output = CleanOutput(
        status="success",
        source_file="data/abc123_sales.csv",
        loaded_at="2026-03-06T10:00:00",
        row_count_before=1000,
        row_count_after=985,
        column_count=8,
        columns=[
            ColumnInfo(name="date", type="datetime64[ns]", nulls=0),
            ColumnInfo(name="revenue", type="float64", nulls=3),
        ],
        clean_data_path="cleaned_data/cleaned_abc123.parquet",
        transformations=[
            Transformation(
                step=1,
                column="date",
                action="parsed to datetime",
                reason="column contained mixed date string formats",
            ),
            Transformation(
                step=2,
                column="revenue",
                action="imputed 3 nulls with column median",
                reason="revenue is required for KPI computation",
            ),
        ],
        quality_issues=[
            QualityIssue(issue="15 duplicate rows removed", severity="medium"),
        ],
        notes="Dataset spans 2026-Q1 through 2026-Q3.",
    )
    path = tmp_path / "CLEAN_OUTPUT.md"
    output.to_md(path)
    loaded = CleanOutput.from_md(path)
    assert loaded == output


def test_analyze_output_round_trip(tmp_path: Path) -> None:
    output = AnalyzeOutput(
        status="success",
        kpis=[
            KPI(
                name="total_revenue",
                value=1_250_000.50,
                source_columns=["revenue"],
                method="sum",
            ),
            KPI(
                name="avg_order_value",
                value=127.5,
                source_columns=["revenue", "order_count"],
                method="mean(revenue) / mean(order_count)",
            ),
        ],
        trends=[
            Trend(
                description="Revenue increased 12% month-over-month in Q3",
                evidence="monthly_revenue: Jun=380k, Jul=410k, Aug=460k",
                direction="up",
            )
        ],
        segments=[
            Segment(name="West Region", size=312, key_difference="38% higher AOV than average"),
        ],
        anomalies=[
            Anomaly(
                description="Single order with revenue > 4 std dev above mean",
                affected_rows=1,
                severity="low",
            )
        ],
        insights=[
            Insight(
                finding="West Region drives outsized revenue per order",
                recommendation="Increase marketing spend in West Region for Q4",
            )
        ],
        notes="",
    )
    path = tmp_path / "ANALYZE_OUTPUT.md"
    output.to_md(path)
    loaded = AnalyzeOutput.from_md(path)
    assert loaded == output


def test_validation_output_round_trip(tmp_path: Path) -> None:
    output = ValidationOutput(
        verdict="pass",
        stage="clean",
        revision_attempt=0,
        instructions_followed="true",
        checks_passed=[
            "schema fields present",
            "all transformations logged with reasons",
            "no unexplained row loss",
            "parquet file path present",
        ],
        issues=[],
        feedback="All requirements met. Clean output is complete and well-formed.",
    )
    path = tmp_path / "validation_clean.md"
    output.to_md(path)
    loaded = ValidationOutput.from_md(path)
    assert loaded == output


def test_validation_output_fail_with_issues(tmp_path: Path) -> None:
    output = ValidationOutput(
        verdict="fail",
        stage="analyze",
        revision_attempt=1,
        instructions_followed="partial",
        checks_passed=["KPIs present", "no causal language"],
        issues=[
            ValidationIssue(
                check="insights non-empty",
                finding="insights list is empty — no actionable recommendations provided",
                severity="high",
            )
        ],
        feedback="Add at least one actionable insight with a concrete recommendation.",
    )
    path = tmp_path / "validation_analyze.md"
    output.to_md(path)
    loaded = ValidationOutput.from_md(path)
    assert loaded == output
    assert loaded.verdict == "fail"
    assert len(loaded.issues) == 1
