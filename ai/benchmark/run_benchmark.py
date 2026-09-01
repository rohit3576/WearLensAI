"""CLI: run try-on candidates over the local test set and record results.

# ─── How to run ───
#   cp .env.example .env                  # set FAL_KEY
#   uv sync
#   uv run python -m ai.benchmark.run_benchmark --candidate fashn_v1_6 --limit 2
#   uv run python -m ai.benchmark.run_benchmark list-candidates
#
# SPENDS fal.ai credits — every candidate x pair combination is one paid generation.
"""

from __future__ import annotations

import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import anyio
import httpx2
import typer
from rich.console import Console
from rich.table import Table

from ai.adapters.base import AdapterError, TryOnAdapter, TryOnRequest
from ai.benchmark.discovery import TestPair, TestSetError, discover_test_set
from ai.benchmark.records import (
    CandidateSummary,
    RunRecord,
    error_text,
    summarize,
    write_results_jsonl,
)
from ai.benchmark.registry import CANDIDATES, InvalidCandidateError, make_adapter, parse_candidates
from ai.net import create_async_client
from ai.preprocessing.validate import ImageValidationError, validate_image

app = typer.Typer(add_completion=False, no_args_is_help=True)
console = Console()

SCORES_HEADER = "candidate,person,garment,identity,garment_fidelity,visual_quality"


@dataclass(frozen=True, slots=True)
class RunContext:
    """Everything one candidate run needs."""

    adapter: TryOnAdapter
    out_dir: Path
    client: httpx2.AsyncClient


def _preflight(pairs: Sequence[TestPair]) -> None:
    """Validate every distinct image once before spending any credits."""
    seen: set[Path] = set()
    problems: list[str] = []
    for pair in pairs:
        for image in (pair.person, pair.garment):
            if image in seen:
                continue
            seen.add(image)
            try:
                validate_image(image)
            except ImageValidationError as err:
                problems.append(str(err))
    if problems:
        raise TestSetError("invalid test images:\n  " + "\n  ".join(problems))


async def _download(client: httpx2.AsyncClient, url: str, dest: Path) -> None:
    response = await client.get(url)
    response.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(response.content)


def _record(
    ctx: RunContext,
    pair: TestPair,
    *,
    ok: bool,
    latency_s: float,
    result_url: str | None,
    result_path: str | None,
    error: str | None,
) -> RunRecord:
    """Build a RunRecord with the shared identity fields filled in."""
    return RunRecord(
        candidate=ctx.adapter.name,
        person=pair.person.name,
        garment=pair.garment.name,
        ok=ok,
        latency_s=latency_s,
        result_url=result_url,
        result_path=result_path,
        error=error,
    )


async def _run_pair(ctx: RunContext, pair: TestPair) -> RunRecord:
    """Run one pair against one adapter; failures become non-ok records."""
    start = time.perf_counter()
    try:
        result = await ctx.adapter.try_on(
            TryOnRequest(person_image=pair.person, garment_image=pair.garment)
        )
    except AdapterError as err:
        return _record(
            ctx,
            pair,
            ok=False,
            latency_s=round(time.perf_counter() - start, 3),
            result_url=None,
            result_path=None,
            error=error_text(err),
        )
    latency = round(time.perf_counter() - start, 3)
    dest = ctx.out_dir / f"{pair.person.stem}__{pair.garment.stem}.jpg"
    try:
        await _download(ctx.client, result.image_url, dest)
    except httpx2.HTTPError as err:
        return _record(
            ctx,
            pair,
            ok=True,
            latency_s=latency,
            result_url=result.image_url,
            result_path=None,
            error=f"download failed: {err}",
        )
    return _record(
        ctx,
        pair,
        ok=True,
        latency_s=latency,
        result_url=result.image_url,
        result_path=str(dest),
        error=None,
    )


async def _run_candidate(
    ctx: RunContext, pairs: Sequence[TestPair]
) -> tuple[RunRecord, ...]:
    """Run all pairs against one adapter, printing a progress line per pair."""
    records: list[RunRecord] = []
    for pair in pairs:
        record = await _run_pair(ctx, pair)
        records.append(record)
        status = (
            f"[green]ok[/green] {record.latency_s}s"
            if record.ok and record.error is None
            else f"[red]fail[/red] {record.error}"
        )
        console.print(
            f"{ctx.adapter.name} {pair.person.name} x {pair.garment.name}: {status}"
        )
    return tuple(records)


def _write_scores_template(records: Sequence[RunRecord], path: Path) -> None:
    """Write scores.csv rows for every successful run, scores left blank."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [SCORES_HEADER]
    lines.extend(
        f"{r.candidate},{r.person},{r.garment},,,"
        for r in records
        if r.ok and r.error is None
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _print_summary(summaries: Sequence[CandidateSummary]) -> None:
    table = Table(title="Benchmark summary")
    for column in ("Candidate", "Runs", "Success", "Mean s", "P95 s", "Est. cost $"):
        table.add_column(column)
    for s in summaries:
        table.add_row(
            s.candidate,
            str(s.total),
            f"{s.success_rate:.1%}",
            "—" if s.mean_latency_s is None else f"{s.mean_latency_s:.2f}",
            "—" if s.p95_latency_s is None else f"{s.p95_latency_s:.2f}",
            f"{s.est_cost_usd:.2f}",
        )
    console.print(table)


async def _run_all(
    candidate_ids: Sequence[str], pairs: Sequence[TestPair], out_dir: Path
) -> None:
    results_path = out_dir / "results.jsonl"
    all_records: list[RunRecord] = []
    summaries: list[CandidateSummary] = []
    async with create_async_client() as client:
        for candidate_id in candidate_ids:
            adapter = make_adapter(candidate_id)
            ctx = RunContext(
                adapter=adapter, out_dir=out_dir / adapter.name, client=client
            )
            records = await _run_candidate(ctx, pairs)
            all_records.extend(records)
            summaries.append(summarize(records, adapter.price_per_generation_usd))
    write_results_jsonl(tuple(all_records), results_path)
    _write_scores_template(all_records, out_dir / "scores.csv")
    _print_summary(summaries)
    console.print(
        f"\nresults: {results_path}\nscores:  {out_dir / 'scores.csv'}"
        " (fill in 1-10, then run build_report)"
    )


@app.command()
def run(
    candidates: list[str] = typer.Option(
        ..., "--candidate", "-c", help="Candidate id, repeatable (see list-candidates)"
    ),
    test_dir: Path = typer.Option(
        Path("test"), help="Directory with person photos + garments/ subdirectory"
    ),
    out_dir: Path = typer.Option(Path("output/benchmark"), help="Output directory"),
    limit: int = typer.Option(0, help="Max pairs per candidate (0 = all)"),
) -> None:
    """Run the benchmark for the given candidates. SPENDS fal.ai credits."""
    try:
        parse_candidates(candidates)
        pairs = discover_test_set(test_dir)
        _preflight(pairs)
    except (InvalidCandidateError, TestSetError) as err:
        console.print(f"[red]error:[/red] {err}")
        raise typer.Exit(code=1) from err
    if limit > 0:
        pairs = pairs[:limit]
    console.print(f"{len(pairs)} pairs x {len(candidates)} candidate(s)\n")
    anyio.run(_run_all, candidates, pairs, out_dir)


@app.command()
def list_candidates() -> None:
    """Show available benchmark candidates and their price per generation."""
    table = Table(title="Candidates")
    for column in ("Id", "Adapter", "$/generation"):
        table.add_column(column)
    for candidate_id, factory in CANDIDATES.items():
        adapter = factory()
        table.add_row(
            candidate_id.value,
            adapter.name,
            f"{adapter.price_per_generation_usd:.4f}",
        )
    console.print(table)


if __name__ == "__main__":
    app()
