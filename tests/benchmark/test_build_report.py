"""Offline tests for the report builder: scores parsing + rendering."""

from __future__ import annotations

import pytest
from ai.benchmark.build_report import (
    HumanScores,
    ReportError,
    parse_scores_csv,
    render_report,
)
from ai.benchmark.records import RunRecord

HEADER = "candidate,person,garment,identity,garment_fidelity,visual_quality"


def _record(candidate: str, person: str, garment: str, *, ok: bool = True) -> RunRecord:
    return RunRecord(
        candidate=candidate,
        person=person,
        garment=garment,
        ok=ok,
        latency_s=1.5 if ok else None,
        result_url="https://cdn/x.jpg" if ok else None,
        result_path="out/x.jpg" if ok else None,
        error=None if ok else "boom",
    )


def test_parse_scores_csv_filled_rows() -> None:
    text = (
        f"{HEADER}\n"
        "fashn_v1_6,person_01.jpg,shirt_01.jpg,8,7,9\n"
        "flux_vto,person_01.jpg,shirt_01.jpg,6,5,7"
    )

    parsed = parse_scores_csv(text)

    assert parsed[("fashn_v1_6", "person_01.jpg", "shirt_01.jpg")] == HumanScores(
        identity=8, garment_fidelity=7, visual_quality=9
    )
    assert len(parsed) == 2


def test_parse_scores_csv_blank_rows_are_pending() -> None:
    text = f"{HEADER}\nfashn_v1_6,person_01.jpg,shirt_01.jpg,,,"

    parsed = parse_scores_csv(text)

    assert parsed == {}


def test_parse_scores_csv_rejects_out_of_range() -> None:
    text = f"{HEADER}\nfashn_v1_6,person_01.jpg,shirt_01.jpg,11,7,9"

    with pytest.raises(ReportError, match="identity"):
        parse_scores_csv(text)


def test_parse_scores_csv_rejects_non_integer() -> None:
    text = f"{HEADER}\nfashn_v1_6,person_01.jpg,shirt_01.jpg,eight,7,9"

    with pytest.raises(ReportError, match="not an integer"):
        parse_scores_csv(text)


def test_parse_scores_csv_rejects_missing_header_column() -> None:
    text = (
        "candidate,person,garment,identity\nfashn_v1_6,person_01.jpg,shirt_01.jpg,8"
    )

    with pytest.raises(ReportError, match="missing columns"):
        parse_scores_csv(text)


def test_render_report_mixes_latency_and_scores() -> None:
    records = [
        _record("fashn_v1_6", "person_01.jpg", "shirt_01.jpg"),
        _record("fashn_v1_6", "person_02.jpg", "shirt_01.jpg"),
        _record("flux_vto", "person_01.jpg", "shirt_01.jpg", ok=False),
    ]
    scores = {
        ("fashn_v1_6", "person_01.jpg", "shirt_01.jpg"): HumanScores(8, 7, 9),
        ("fashn_v1_6", "person_02.jpg", "shirt_01.jpg"): HumanScores(6, 5, 7),
    }

    report = render_report(records, scores)

    fashn_row = "| fashn_v1_6 | 2 | 100% | 1.50 | 1.50 | 0.15 | 7.0 | 6.0 | 8.0 | 7.0 |"
    flux_row = (
        "| flux_vto | 1 | 0% | — | — | 0.00 | pending | pending | pending | pending |"
    )
    assert fashn_row in report
    assert flux_row in report
    assert "PENDING" in report


def test_render_report_requires_records() -> None:
    with pytest.raises(ReportError, match="no records"):
        render_report([], {})


def test_render_report_rejects_unknown_candidate() -> None:
    with pytest.raises(ReportError, match="unknown candidate"):
        render_report([_record("mystery", "p.jpg", "g.jpg")], {})
