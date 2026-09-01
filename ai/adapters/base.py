"""Adapter contract and shared types for virtual try-on providers.

Every provider (fal.ai models now, self-hosted FASHN v1.5 in Phase 6)
implements the same :class:`TryOnAdapter` protocol, so the benchmark
and the web backend treat all models uniformly.
"""

from __future__ import annotations

from collections.abc import Awaitable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


class AdapterError(Exception):
    """Base class for typed adapter failures."""


class MissingApiKeyError(AdapterError):
    """The provider API key is absent from the environment."""

    def __init__(self, env_var: str) -> None:
        super().__init__(f"API key missing: set {env_var} in .env")
        self.env_var = env_var


class ProviderCallError(AdapterError):
    """The provider call failed or returned an unusable payload."""

    def __init__(self, provider: str, detail: str) -> None:
        super().__init__(f"{provider}: {detail}")
        self.provider = provider
        self.detail = detail


@dataclass(frozen=True, slots=True)
class TryOnRequest:
    """One try-on job: a person photo and a garment photo."""

    person_image: Path
    garment_image: Path


@dataclass(frozen=True, slots=True)
class TryOnResult:
    """A successful try-on: hosted result URL of the generated image."""

    image_url: str


class TryOnAdapter(Protocol):
    """The contract every try-on provider implements."""

    name: str
    price_per_generation_usd: float

    def try_on(self, request: TryOnRequest) -> Awaitable[TryOnResult]:
        """Generate a try-on image; raises a subclass of AdapterError on failure."""
        ...
