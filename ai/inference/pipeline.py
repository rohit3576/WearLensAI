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

import anyio

from ai.adapters.base import TryOnAdapter, TryOnRequest, TryOnResult
from ai.benchmark.registry import make_adapter, make_dry_adapter
from ai.config import load_settings
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


async def virtual_try_on(
    person_image: Path,
    garment_image: Path,
    *,
    adapter_id: str | None = None,
    dry_run: bool = False,
) -> TryOnOutcome:
    """Validate, resize, and run one try-on; result download arrives in Step 4."""
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
    return TryOnOutcome(
        adapter=adapter.name,
        person_image=request.person_image,
        garment_image=request.garment_image,
        result_url=result.image_url,
        result_path=None,
        latency_s=round(time.perf_counter() - start, 3),
    )
