"""E2E tests for the inference CLI through the typer entry (dry-run, zero spend)."""

from __future__ import annotations

from pathlib import Path

import pytest
from ai.inference.__main__ import app
from PIL import Image
from typer.testing import CliRunner

runner = CliRunner()


def _write_image(path: Path, width: int = 256, height: int = 320) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (width, height), (110, 120, 130)).save(path)


def test_cli_dry_run_writes_result_copy(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    person = tmp_path / "person.jpg"
    garment = tmp_path / "shirt.jpg"
    _write_image(person)
    _write_image(garment)
    out = tmp_path / "out" / "result.jpg"
    monkeypatch.setenv("TRYON_OUTPUT_DIR", str(tmp_path / "tryon"))
    monkeypatch.setenv("RESIZE_CACHE_DIR", str(tmp_path / "cache"))

    result = runner.invoke(
        app,
        [
            "--person", str(person),
            "--garment", str(garment),
            "--dry-run",
            "--out", str(out),
        ],
    )

    assert result.exit_code == 0
    assert out.is_file()
    assert "adapter:   fashn_v1_6" in result.stdout


def test_cli_missing_image_exits_1_with_clear_message(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    missing = tmp_path / "missing.jpg"
    monkeypatch.setenv("TRYON_OUTPUT_DIR", str(tmp_path / "tryon"))
    monkeypatch.setenv("RESIZE_CACHE_DIR", str(tmp_path / "cache"))

    result = runner.invoke(
        app,
        ["--person", str(missing), "--garment", str(missing), "--dry-run"],
    )

    assert result.exit_code == 1
    assert "missing.jpg" in result.stdout
    assert "Traceback" not in result.stdout


def test_cli_unknown_adapter_lists_valid_ids(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    person = tmp_path / "person.jpg"
    garment = tmp_path / "shirt.jpg"
    _write_image(person)
    _write_image(garment)
    monkeypatch.setenv("TRYON_OUTPUT_DIR", str(tmp_path / "tryon"))
    monkeypatch.setenv("RESIZE_CACHE_DIR", str(tmp_path / "cache"))

    result = runner.invoke(
        app,
        [
            "--person", str(person),
            "--garment", str(garment),
            "--adapter", "gpt_tryon",
            "--dry-run",
        ],
    )

    assert result.exit_code == 1
    assert "valid:" in result.stdout
