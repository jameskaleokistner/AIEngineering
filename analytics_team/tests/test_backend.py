"""Tests for the FastAPI backend."""

import io
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# POST /chat
# ---------------------------------------------------------------------------

def test_chat_file_saved_to_data(tmp_path, monkeypatch):
    """Uploaded file is written to data/ with run_id prefix."""
    monkeypatch.setattr("backend.main.DATA_DIR", tmp_path / "data")
    monkeypatch.setattr("backend.main.CONTEXT_DIR", tmp_path / "context")
    (tmp_path / "data").mkdir()
    (tmp_path / "context").mkdir()

    mock_intent = AsyncMock(return_value={"dataset_name": "sales_data", "task": "analyze sales"})
    with patch("backend.main._parse_user_intent", mock_intent):
        response = client.post(
            "/chat",
            data={"message": "analyze my sales data"},
            files={"files": ("sales.csv", io.BytesIO(b"a,b\n1,2"), "text/csv")},
        )

    assert response.status_code == 200
    body = response.json()
    run_id = body["run_id"]

    saved = list((tmp_path / "data").glob(f"{run_id}_*.csv"))
    assert len(saved) == 1, "Uploaded file should be saved to data/"


def test_chat_run_config_written(tmp_path, monkeypatch):
    """run_config.md is written with correct fields after POST /chat."""
    monkeypatch.setattr("backend.main.DATA_DIR", tmp_path / "data")
    monkeypatch.setattr("backend.main.CONTEXT_DIR", tmp_path / "context")
    (tmp_path / "data").mkdir()
    (tmp_path / "context").mkdir()

    mock_intent = AsyncMock(return_value={"dataset_name": "test_ds", "task": "do analysis"})
    with patch("backend.main._parse_user_intent", mock_intent):
        response = client.post(
            "/chat",
            data={"message": "do analysis"},
            files={"files": ("test.csv", io.BytesIO(b"x\n1"), "text/csv")},
        )

    run_id = response.json()["run_id"]
    config_path = tmp_path / "context" / "run_config.md"
    assert config_path.exists(), "run_config.md should be written"

    content = config_path.read_text()
    assert f"run_id: {run_id}" in content
    assert "dataset_name: test_ds" in content
    assert "user_prompt: do analysis" in content


def test_chat_no_files(tmp_path, monkeypatch):
    """POST /chat without files still succeeds and writes run_config."""
    monkeypatch.setattr("backend.main.DATA_DIR", tmp_path / "data")
    monkeypatch.setattr("backend.main.CONTEXT_DIR", tmp_path / "context")
    (tmp_path / "data").mkdir()
    (tmp_path / "context").mkdir()

    mock_intent = AsyncMock(return_value={"dataset_name": "", "task": "explore"})
    with patch("backend.main._parse_user_intent", mock_intent):
        response = client.post("/chat", data={"message": "explore"})

    assert response.status_code == 200
    assert "run_id" in response.json()


# ---------------------------------------------------------------------------
# GET /report/{run_id}
# ---------------------------------------------------------------------------

def test_report_404_before_pipeline(tmp_path, monkeypatch):
    """GET /report returns 404 when no PDF exists for the run_id."""
    monkeypatch.setattr("backend.main.OUTPUTS_DIR", tmp_path / "outputs")
    (tmp_path / "outputs").mkdir()

    response = client.get("/report/nonexistent_run_id")
    assert response.status_code == 404


def test_report_returns_pdf_when_present(tmp_path, monkeypatch):
    """GET /report serves the PDF once it exists in outputs/."""
    outputs = tmp_path / "outputs"
    outputs.mkdir()
    monkeypatch.setattr("backend.main.OUTPUTS_DIR", outputs)

    run_id = "abc123"
    pdf_path = outputs / f"report_20260101_{run_id}.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake content")

    response = client.get(f"/report/{run_id}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
