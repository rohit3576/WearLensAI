"""Offline E2E: the full benchmark loop with the dry-run gateway.

Proves discovery → validation → argument building → records → downloads
(placeholder) → results.jsonl + scores.csv, for every registered candidate,
with zero API spend.
"""

from __future__ import annotations

from pathlib import Path

import anyio
import pytest
from ai.benchmark.discovery import discover_test_set
from ai.benchmark.records import read_results_jsonl
from ai.benchmark.run_benchmark import preflight, run_all
from PIL import Image

pytestmark = pytest.mark.anyio

SCORES_HEADER = "candidate,person,garment,identity,garment_fidelity,visual_quality"


def _make_test_set(root: Path) -> Path:
    test_dir = root / "test"
    garment_dir = test_dir / "garments"
    garment_dir.mkdir(parents=True)
    for name in ("person_01.jpg", "person_02.jpg"):
        Image.new("RGB", (256, 320), (140, 150, 160)).save(test_dir / name)
    Image.new("RGB", (256, 256), (200, 60, 60)).save(garment_dir / "shirt_01.jpg")
    return test_dir


async def test_dry_run_proves_full_loop(tmp_path: Path) -> None:
    test_dir = _make_test_set(tmp_path)
    pairs = discover_test_set(test_dir)
    preflight(pairs)
    out_dir = tmp_path / "out"

    await run_all(["fashn_v1_6", "flux_vto"], pairs, out_dir, dry_run=True)

    records = read_results_jsonl(out_dir / "results.jsonl")
    assert len(records) == 4  # 2 persons x 1 garment x 2 candidates
    assert all(r.ok and r.error is None for r in records)
    for record in records:
        assert record.result_url is not None
        assert record.result_url.startswith("dry-run://")
    assert {r.candidate for r in records} == {"fashn_v1_6", "flux_vto"}
    for record in records:
        assert record.result_path is not None
        assert await anyio.Path(record.result_path).is_file()
    scores_lines = (out_dir / "scores.csv").read_text(encoding="utf-8").splitlines()
    assert scores_lines[0] == SCORES_HEADER
    assert len(scores_lines) == 5  # header + 4 blank-score rows
