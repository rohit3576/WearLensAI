"""Offline tests for the fal.ai try-on adapters.

Zero API spend: a fake FalGateway stands in for the SDK seam, and explicit
keys keep the environment (and .env) out of the picture.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import override

import pytest
from ai.adapters.base import (
    AdapterError,
    MissingApiKeyError,
    ProviderCallError,
    TryOnRequest,
)
from ai.adapters.fal import JsonValue
from ai.adapters.fashn_v16 import FASHN_V1_6_MODEL_ID, FashnV16Adapter
from ai.adapters.flux_vto import FLUX_VTO_MODEL_ID, FluxVtoAdapter
from fal_client import FalClientError

PERSON = Path("test/person_01.jpg")
GARMENT = Path("test/garments/shirt_01.jpg")
FAKE_PERSON_URL = "https://fake.fal/person_01.jpg"
FAKE_GARMENT_URL = "https://fake.fal/shirt_01.jpg"

pytestmark = pytest.mark.anyio


class FakeFalGateway:
    """Recording gateway: returns a canned payload, remembers every call."""

    def __init__(self, payload: JsonValue) -> None:
        self.payload: JsonValue = payload
        self.uploads: list[Path] = []
        self.runs: list[tuple[str, dict[str, JsonValue]]] = []

    async def upload(self, path: Path) -> str:
        self.uploads.append(path)
        return f"https://fake.fal/{path.name}"

    async def run(
        self, model_id: str, arguments: Mapping[str, JsonValue]
    ) -> JsonValue:
        self.runs.append((model_id, dict(arguments)))
        return self.payload


class ExplodingFalGateway(FakeFalGateway):
    """Gateway whose upload fails like a real SDK error would."""

    @override
    async def upload(self, path: Path) -> str:
        raise FalClientError(f"upload failed for {path.name}")


def _request() -> TryOnRequest:
    return TryOnRequest(person_image=PERSON, garment_image=GARMENT)


FASHN_PAYLOAD: JsonValue = {"images": [{"url": "https://cdn.fashn.ai/output_0.png"}]}
FLUX_PAYLOAD: JsonValue = {
    "images": [{"url": "https://v3b.fal.media/files/out.jpg", "width": 768}],
    "seed": 451896458,
    "prompt": "A natural front-facing studio photo.",
    "has_nsfw_concepts": [False],
}


async def test_fashn_returns_first_image_url() -> None:
    gateway = FakeFalGateway(FASHN_PAYLOAD)
    adapter = FashnV16Adapter(gateway=gateway, key="test-key")

    result = await adapter.try_on(_request())

    assert result.image_url == "https://cdn.fashn.ai/output_0.png"


async def test_fashn_uploads_both_images_in_order() -> None:
    gateway = FakeFalGateway(FASHN_PAYLOAD)
    adapter = FashnV16Adapter(gateway=gateway, key="test-key")

    _ = await adapter.try_on(_request())

    assert gateway.uploads == [PERSON, GARMENT]


async def test_fashn_builds_verified_request_schema() -> None:
    gateway = FakeFalGateway(FASHN_PAYLOAD)
    adapter = FashnV16Adapter(gateway=gateway, key="test-key")

    _ = await adapter.try_on(_request())

    assert len(gateway.runs) == 1
    model_id, arguments = gateway.runs[0]
    assert model_id == FASHN_V1_6_MODEL_ID
    assert arguments == {
        "model_image": FAKE_PERSON_URL,
        "garment_image": FAKE_GARMENT_URL,
    }


async def test_flux_builds_verified_request_schema_with_prompt() -> None:
    gateway = FakeFalGateway(FLUX_PAYLOAD)
    adapter = FluxVtoAdapter(gateway=gateway, key="test-key")

    _ = await adapter.try_on(_request())

    assert len(gateway.runs) == 1
    model_id, arguments = gateway.runs[0]
    assert model_id == FLUX_VTO_MODEL_ID
    assert arguments.keys() == {"prompt", "human_image_url", "garment_image_url"}
    assert arguments["prompt"] == (
        "A natural front-facing studio photo of the person wearing the garment."
    )
    assert arguments["human_image_url"] == FAKE_PERSON_URL
    assert arguments["garment_image_url"] == FAKE_GARMENT_URL


async def test_missing_key_raises_typed_error_without_network() -> None:
    gateway = FakeFalGateway(FASHN_PAYLOAD)
    adapter = FashnV16Adapter(gateway=gateway, key="")

    with pytest.raises(MissingApiKeyError) as excinfo:
        await adapter.try_on(_request())

    assert excinfo.value.env_var == "FAL_KEY"
    assert gateway.uploads == []  # fails before any upload happens


async def test_key_is_exported_to_process_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("FAL_KEY", raising=False)
    gateway = FakeFalGateway(FASHN_PAYLOAD)
    adapter = FluxVtoAdapter(gateway=gateway, key="injected-key")

    _ = await adapter.try_on(_request())

    assert os.environ["FAL_KEY"] == "injected-key"


async def test_sdk_failure_maps_to_provider_call_error() -> None:
    gateway = ExplodingFalGateway(FASHN_PAYLOAD)
    adapter = FashnV16Adapter(gateway=gateway, key="test-key")

    with pytest.raises(ProviderCallError) as excinfo:
        await adapter.try_on(_request())

    assert excinfo.value.provider == "fashn_v1_6"
    assert "upload failed" in excinfo.value.detail


async def test_payload_without_images_is_rejected() -> None:
    gateway = FakeFalGateway({"detail": "some upstream error"})
    adapter = FluxVtoAdapter(gateway=gateway, key="test-key")

    with pytest.raises(ProviderCallError):
        await adapter.try_on(_request())


def test_adapters_expose_benchmark_metadata() -> None:
    # Construction must stay offline: no key, no gateway calls made.
    fashn = FashnV16Adapter(key="")
    flux = FluxVtoAdapter(key="")

    assert (fashn.name, fashn.model_id, fashn.price_per_generation_usd) == (
        "fashn_v1_6",
        FASHN_V1_6_MODEL_ID,
        0.075,
    )
    assert (flux.name, flux.model_id, flux.price_per_generation_usd) == (
        "flux_vto",
        FLUX_VTO_MODEL_ID,
        0.0475,
    )
    assert issubclass(ProviderCallError, AdapterError)
