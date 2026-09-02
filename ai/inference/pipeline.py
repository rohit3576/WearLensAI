"""The ``virtual_try_on`` pipeline: validate → resize → adapt → outcome.

Public interface (the Phase 2 deliverable):

    outcome = await virtual_try_on(
        person_image=Path("person.jpg"),
        garment_image=Path("shirt.jpg"),
    )

Adapter resolution order: explicit ``adapter_id`` argument > ``TRYON_ADAPTER``
environment variable > config default. Failures stay typed at every layer —
bad images raise ``ImageValidationError``, unknown ids raise
``InvalidCandidateError``, provider failures raise ``ProviderCallError``,
and a slow model raises :class:`TryOnTimeoutError`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import anyio

from ai.adapters.base import TryOnAdapter, TryOnRequest, TryOnResult
from ai.benchmark.registry import make_adapter, make_dry_adapter
from ai.config import load_settings
from ai.net import create_async_client
from ai.postprocessing.save import (
    make_comparison,
    save_result,
    write_result_placeholder,
)
from ai.preprocessing.resize import downscale_to_budget
from ai.preprocessing.validate import ValidatedImage, validate_image


class TryOnTimeoutError(Exception):
    """The adapter exceeded the configured timeout."""

    adapter: str
    seconds: float

    def __init__(self, adapter: str, seconds: float) -> None:
        """Remember which adapter was slow and by how much."""
        message = f"{adapter}: timed out after {seconds:.0f}s"
        super().__init__(message)
        self.adapter = adapter
        self.seconds = seconds


@dataclass(frozen=True, slots=True)
class TryOnOutcome:
    """Everything one finished try-on produced."""

    adapter: str
    person_image: Path
    garment_image: Path
    result_url: str
    result_path: Path | None
    comparison_path: Path | None
    latency_s: float


def resolve_adapter(
    adapter_id: str | None, default_id: str, *, dry_run: bool
) -> TryOnAdapter:
    """Explicit id wins, then settings (env TRYON_ADAPTER), then default."""
    chosen = adapter_id if adapter_id is not None else default_id
    maker = make_dry_adapter if dry_run else make_adapter
    return maker(chosen)


async def run_with_timeout(
    adapter: TryOnAdapter, request: TryOnRequest, timeout_s: float
) -> TryOnResult:
    """Run one try-on under a deadline; slow models raise TryOnTimeoutError."""
    try:
        with anyio.fail_after(timeout_s):
            return await adapter.try_on(request)
    except TimeoutError as err:
        raise TryOnTimeoutError(adapter.name, timeout_s) from err


def _resized(
    image: ValidatedImage, max_mp: float | None, cache_dir: Path
) -> Path:
    """Downscale within budget; original path returned when already fitting."""
    return downscale_to_budget(image, max_mp, cache_dir)


async def _persist_result(
    result_url: str, dest: Path, *, dry_run: bool
) -> Path:
    """Save the hosted result (or a placeholder in dry-run) to ``dest``."""
    if dry_run:
        await write_result_placeholder(dest)
        return dest
    async with create_async_client() as client:
        return await save_result(client, result_url, dest)


def _result_suffix(result_url: str) -> str:
    """File suffix from the result URL; ``.jpg`` when none is present."""
    suffix = Path(urlparse(result_url).path).suffix.lower()
    return suffix if suffix in {".jpg", ".jpeg", ".png", ".webp"} else ".jpg"


async def virtual_try_on(
    person_image: Path,
    garment_image: Path,
    *,
    adapter_id: str | None = None,
    dry_run: bool = False,
) -> TryOnOutcome:
    """Validate, resize, run, and persist one try-on with a comparison image."""
    settings = load_settings()
    adapter = resolve_adapter(adapter_id, settings.tryon_adapter, dry_run=dry_run)
    person = validate_image(person_image)
    garment = validate_image(garment_image)
    cache_dir = Path(settings.resize_cache_dir)
    request = TryOnRequest(
        person_image=_resized(person, adapter.input_budget.person, cache_dir),
        garment_image=_resized(garment, adapter.input_budget.garment, cache_dir),
    )
    start = time.perf_counter()
    result = await run_with_timeout(adapter, request, settings.tryon_timeout_s)
    dest = (
        Path(settings.tryon_output_dir)
        / adapter.name
        / (
            f"{person_image.stem}__{garment_image.stem}"
            f"{_result_suffix(result.image_url)}"
        )
    )
    result_path = await _persist_result(result.image_url, dest, dry_run=dry_run)
    comparison_path = make_comparison(
        request.person_image,
        result_path,
        result_path.with_name(f"{result_path.stem}__compare.jpg"),
    )
    return TryOnOutcome(
        adapter=adapter.name,
        person_image=request.person_image,
        garment_image=request.garment_image,
        result_url=result.image_url,
        result_path=result_path,
        comparison_path=comparison_path,
        latency_s=round(time.perf_counter() - start, 3),
    )
