"""CLI for the inference pipeline.

# ─── How to run ───
#   uv sync
#   # offline proof (zero spend):
#   uv run python -m ai.inference --person p.jpg --garment g.jpg --dry-run
#   # live (SPENDS fal.ai credits):
#   uv run python -m ai.inference --person p.jpg --garment g.jpg
"""

from __future__ import annotations

import functools
import shutil
from pathlib import Path

import anyio
import typer
from rich.console import Console

from ai.adapters.base import AdapterError
from ai.benchmark.registry import InvalidCandidateError
from ai.inference.pipeline import TryOnTimeoutError, virtual_try_on
from ai.postprocessing.save import ResultDownloadError
from ai.preprocessing.validate import ImageValidationError

app = typer.Typer(add_completion=False)
console = Console()


@app.command()
def run(
    person: Path = typer.Option(..., "--person", help="Person photo"),
    garment: Path = typer.Option(..., "--garment", help="Garment photo"),
    adapter: str | None = typer.Option(
        None,
        "--adapter",
        help="Adapter id (default: TRYON_ADAPTER env, then fashn_v1_6)",
    ),
    out: Path = typer.Option(
        Path("output/result.jpg"), "--out", help="Where to copy the result"
    ),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Offline proof: fake gateway, no spend"
    ),
) -> None:
    """Run one virtual try-on (real runs SPEND fal.ai credits)."""
    try:
        outcome = anyio.run(
            functools.partial(
                virtual_try_on,
                person,
                garment,
                adapter_id=adapter,
                dry_run=dry_run,
            )
        )
    except (
        ImageValidationError,
        AdapterError,
        InvalidCandidateError,
        TryOnTimeoutError,
        ResultDownloadError,
    ) as err:
        console.print(f"[red]error:[/red] {err}")
        raise typer.Exit(code=1) from err
    result_path = outcome.result_path
    if result_path is None:
        console.print("[red]error:[/red] pipeline returned no result path")
        raise typer.Exit(code=1)
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(result_path, out)
    console.print(f"adapter:   {outcome.adapter}")
    console.print(f"latency:   {outcome.latency_s:.2f}s")
    console.print(f"result:    {result_path}")
    console.print(f"compare:   {outcome.comparison_path}")
    console.print(f"copied to: {out}")


if __name__ == "__main__":
    app()
