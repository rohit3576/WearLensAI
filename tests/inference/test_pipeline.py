"""Offline tests for the virtual_try_on pipeline (dry-run gateway, zero spend)."""

from __future__ import annotations

from pathlib import Path
from typing import ClassVar

import anyio
import pytest
from ai.adapters.base import (
    InputBudget,
    TryOnRequest,
    TryOnResult,
)
from ai.adapters.flux_vto import FluxVtoAdapter
from ai.benchmark.registry import InvalidCandidateError
from ai.inference.pipeline import (
    TryOnTimeoutError,
    resolve_adapter,
    run_with_timeout,
    virtual_try_on,
)
from PIL import Image

pytestmark = pytest.mark.anyio


def _write_image(path: Path, width: int, height: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (width, height), (110, 120, 130)).save(path)


def _pair(tmp_path: Path) -> tuple[Path, Path]:
    person = tmp_path / "person.jpg"
    garment = tmp_path / "shirt.jpg"
    _write_image(person, 256, 320)
    _write_image(garment, 256, 256)
    return person, garment


class SleepingAdapter:
    """Adapter whose try_on never finishes in time."""

    name: ClassVar[str] = "sleepy"
    price_per_generation_usd: ClassVar[float] = 0.0
    input_budget: ClassVar[InputBudget] = InputBudget(person=None, garment=None)

    async def try_on(self, request: TryOnRequest) -> TryOnResult:
        _ = request
        await anyio.sleep(2)
        return TryOnResult(image_url="https://late.example/too-late.jpg")


async def test_happy_path_dry_run_fashn(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("TRYON_ADAPTER", raising=False)
    out_dir = tmp_path / "tryon"
    monkeypatch.setenv("TRYON_OUTPUT_DIR", str(out_dir))
    person, garment = _pair(tmp_path)

    outcome = await virtual_try_on(
        person, garment, adapter_id="fashn_v1_6", dry_run=True
    )

    assert outcome.adapter == "fashn_v1_6"
    assert outcome.result_url.startswith("dry-run://")
    assert outcome.person_image == person  # FASHN has no MP budget: passthrough
    assert outcome.garment_image == garment
    assert outcome.latency_s >= 0
    assert outcome.result_path is not None
    assert outcome.result_path == out_dir / "fashn_v1_6" / "person__shirt.jpg"
    assert outcome.result_path.is_file()
    assert outcome.comparison_path is not None
    assert outcome.comparison_path.is_file()


async def test_flux_budget_downscales_person(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("RESIZE_CACHE_DIR", str(tmp_path / "cache"))
    person = tmp_path / "person.jpg"
    garment = tmp_path / "shirt.jpg"
    _write_image(person, 2000, 1500)  # 3 MP > FLUX 2 MP person cap
    _write_image(garment, 256, 256)

    outcome = await virtual_try_on(
        person, garment, adapter_id="flux_vto", dry_run=True
    )

    assert outcome.adapter == "flux_vto"
    assert outcome.person_image != person
    assert outcome.person_image.parent == tmp_path / "cache"
    assert outcome.garment_image == garment  # 0.065 MP < 1 MP: passthrough


async def test_explicit_adapter_beats_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TRYON_ADAPTER", "flux_vto")
    person, garment = _pair(tmp_path)

    outcome = await virtual_try_on(
        person, garment, adapter_id="fashn_v1_6", dry_run=True
    )

    assert outcome.adapter == "fashn_v1_6"


async def test_env_adapter_is_respected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TRYON_ADAPTER", "flux_vto")
    person, garment = _pair(tmp_path)

    outcome = await virtual_try_on(person, garment, dry_run=True)

    assert outcome.adapter == "flux_vto"


async def test_unknown_adapter_lists_valid_ids(tmp_path: Path) -> None:
    person, garment = _pair(tmp_path)

    with pytest.raises(InvalidCandidateError, match="valid"):
        await virtual_try_on(person, garment, adapter_id="gpt_tryon", dry_run=True)


async def test_bad_image_raises_validation_error(tmp_path: Path) -> None:
    missing = tmp_path / "missing.jpg"

    with pytest.raises(Exception, match=r"missing\.jpg") as excinfo:
        await virtual_try_on(
            missing, missing, adapter_id="fashn_v1_6", dry_run=True
        )

    assert type(excinfo.value).__name__ == "ImageValidationError"


async def test_slow_adapter_raises_timeout() -> None:
    adapter = SleepingAdapter()
    request = TryOnRequest(person_image=Path("p.jpg"), garment_image=Path("g.jpg"))

    with pytest.raises(TryOnTimeoutError) as excinfo:
        await run_with_timeout(adapter, request, 0.05)

    assert excinfo.value.adapter == "sleepy"
    assert excinfo.value.seconds == 0.05


def test_resolve_adapter_prefers_explicit_id() -> None:
    adapter = resolve_adapter("flux_vto", "fashn_v1_6", dry_run=True)

    assert isinstance(adapter, FluxVtoAdapter)
