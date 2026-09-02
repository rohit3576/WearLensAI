"""CLI: merge benchmark records + human scores into a markdown report.

# ─── How to run ───
#   uv run python -m ai.benchmark.build_report \
#       --results output/benchmark/results.jsonl \
#       --scores output/benchmark/scores.csv \
#       --out docs/model-benchmark.md
#
# Rows in scores.csv with blank score cells count as "pending" and are
# excluded from averages until filled in.
"""

from __future__ import annotations

import csv
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from io import StringIO
from pathlib import Path

import typer
from rich.console import Console

from ai.adapters.fashn_v16 import FASHN_PRICE_PER_GENERATION_USD
from ai.adapters.flux_vto import FLUX_PRICE_PER_GENERATION_USD
from ai.benchmark.records import RunRecord, read_results_jsonl, summarize

app = typer.Typer(add_completion=False, no_args_is_help=True)
console = Console()

SCORE_COLUMNS: tuple[str, ...] = (
    "candidate",
    "person",
    "garment",
    "identity",
    "garment_fidelity",
    "visual_quality",
)
MIN_SCORE = 1
MAX_SCORE = 10

ScoreKey = tuple[str, str, str]


class ReportError(Exception):
    """The report inputs are missing or malformed."""


@dataclass(frozen=True, slots=True)
class HumanScores:
    """One scored run: three visual metrics, each 1-10."""

    identity: int
    garment_fidelity: int
    visual_quality: int

    def all_values(self) -> tuple[int, int, int]:
        """Flat view for overall averaging."""
        return (self.identity, self.garment_fidelity, self.visual_quality)


def _parse_cell(raw: str | None, row_label: str, column: str) -> int:
    """Parse one score cell (1-10) with a row-labelled typed error."""
    if raw is None:
        message = f"{row_label}: missing column '{column}'"
        raise ReportError(message)
    try:
        value = int(raw.strip())
    except ValueError as err:
        message = f"{row_label}: '{column}' is not an integer: {raw.strip()!r}"
        raise ReportError(message) from err
    if not MIN_SCORE <= value <= MAX_SCORE:
        message = f"{row_label}: '{column}' must be 1-10, got {value}"
        raise ReportError(message)
    return value


def parse_scores_csv(text: str) -> dict[ScoreKey, HumanScores]:
    """Parse the scores template; rows with blank cells are pending, skipped."""
    reader = csv.DictReader(StringIO(text))
    header = reader.fieldnames or []
    missing = [column for column in SCORE_COLUMNS if column not in header]
    if missing:
        message = f"scores csv missing columns: {', '.join(missing)}"
        raise ReportError(message)
    parsed: dict[ScoreKey, HumanScores] = {}
    for row in reader:
        key: ScoreKey = (row["candidate"], row["person"], row["garment"])
        row_label = f"{key[0]}/{key[1]}x{key[2]}"
        raw_scores = (
            row["identity"],
            row["garment_fidelity"],
            row["visual_quality"],
        )
        if any(cell is not None and cell.strip() == "" for cell in raw_scores):
            continue
        if all(cell is None for cell in raw_scores):
            continue
        if key in parsed:
            message = f"{row_label}: duplicate scores row"
            raise ReportError(message)
        parsed[key] = HumanScores(
            identity=_parse_cell(row["identity"], row_label, "identity"),
            garment_fidelity=_parse_cell(
                row["garment_fidelity"], row_label, "garment_fidelity"
            ),
            visual_quality=_parse_cell(
                row["visual_quality"], row_label, "visual_quality"
            ),
        )
    return parsed


def _price_per_generation(candidate: str) -> float:
    """Price for a candidate name; typed error for unknown names."""
    prices = {
        "fashn_v1_6": FASHN_PRICE_PER_GENERATION_USD,
        "flux_vto": FLUX_PRICE_PER_GENERATION_USD,
    }
    price = prices.get(candidate)
    if price is None:
        message = f"records contain unknown candidate: {candidate}"
        raise ReportError(message)
    return price


@dataclass(frozen=True, slots=True)
class ScoreMeans:
    """Per-candidate human score averages; None while scores are pending."""

    identity: float | None
    garment_fidelity: float | None
    visual_quality: float | None
    overall: float | None


def _score_means(
    records: Sequence[RunRecord], scores: Mapping[ScoreKey, HumanScores]
) -> ScoreMeans:
    """Average the human scores for one candidate's runs."""
    values = [
        scores[(r.candidate, r.person, r.garment)]
        for r in records
        if (r.candidate, r.person, r.garment) in scores
    ]
    if not values:
        return ScoreMeans(None, None, None, None)
    identity = sum(v.identity for v in values) / len(values)
    garment = sum(v.garment_fidelity for v in values) / len(values)
    visual = sum(v.visual_quality for v in values) / len(values)
    flat = [n for v in values for n in v.all_values()]
    overall = sum(flat) / len(flat)
    return ScoreMeans(identity, garment, visual, overall)


def _fmt_number(value: float | None) -> str:
    """Render an optional average; pending scores render as 'pending'."""
    return "pending" if value is None else f"{value:.1f}"


def _fmt_latency(value: float | None) -> str:
    """Render an optional latency; failed-only candidates render as '—'."""
    return "—" if value is None else f"{value:.2f}"


def render_report(
    records: Sequence[RunRecord], scores: Mapping[ScoreKey, HumanScores]
) -> str:
    """Render the benchmark markdown report from records + human scores."""
    if not records:
        message = "no records to report on — run the benchmark first"
        raise ReportError(message)
    by_candidate: dict[str, list[RunRecord]] = {}
    for record in records:
        by_candidate.setdefault(record.candidate, []).append(record)
    lines = [
        "# Model benchmark",
        "",
        "Generated by `ai.benchmark.build_report`. Latency and cost come from",
        "`results.jsonl`; identity/garment/visual columns average the human",
        "scores from `scores.csv` (1-10, blank = pending).",
        "",
        (
            "| Candidate | Runs | Success | Mean s | P95 s | Est. cost $ |"
            " Identity | Garment | Visual | Overall |"
        ),
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for name, candidate_records in by_candidate.items():
        summary = summarize(tuple(candidate_records), _price_per_generation(name))
        means = _score_means(candidate_records, scores)
        cells = [
            str(summary.total),
            f"{summary.success_rate:.0%}",
            _fmt_latency(summary.mean_latency_s),
            _fmt_latency(summary.p95_latency_s),
            f"{summary.est_cost_usd:.2f}",
            _fmt_number(means.identity),
            _fmt_number(means.garment_fidelity),
            _fmt_number(means.visual_quality),
            _fmt_number(means.overall),
        ]
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    lines.extend(
        [
            "",
            "## Decision",
            "",
            "- [ ] One API model picked for the demo",
            (
                "- [ ] One self-host model picked for Phase 6 (default: FASHN v1.5,"
                " Apache-2.0)"
            ),
            "- [ ] Licenses verified on official pages; MODEL_LICENSES.md updated",
            "",
            "_PENDING: real benchmark run deferred (API budget)._",
        ]
    )
    return "\n".join(lines) + "\n"


@app.command()
def build(
    results: Path = typer.Option(
        Path("output/benchmark/results.jsonl"), help="Run records (JSONL)"
    ),
    scores: Path = typer.Option(
        Path("output/benchmark/scores.csv"), help="Filled scores template"
    ),
    out: Path = typer.Option(
        Path("docs/model-benchmark.md"), help="Markdown report destination"
    ),
) -> None:
    """Build the benchmark report from records + human scores."""
    try:
        records = read_results_jsonl(results)
        score_map = parse_scores_csv(scores.read_text(encoding="utf-8"))
        report = render_report(records, score_map)
    except (ReportError, OSError, ValueError) as err:
        console.print(f"[red]error:[/red] {err}")
        raise typer.Exit(code=1) from err
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    console.print(f"report written: {out}")


if __name__ == "__main__":
    app()
