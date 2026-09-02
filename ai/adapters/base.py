"""Adapter contract and shared types for virtual try-on providers.

Every provider (fal.ai models now, self-hosted FASHN v1.5 in Phase 6)
implements the same :class:`TryOnAdapter` protocol, so the benchmark
and the web backend treat all models uniformly.
"""

from __future__ import annotations

from collections.abc import Awaitable
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar, Protocol, runtime_checkable


class AdapterError(Exception):
    """Base class for typed adapter failures."""


class MissingApiKeyError(AdapterError):
    """The provider API key is absent from the environment."""

    env_var: str

    def __init__(self, env_var: str) -> None:
        """Remember which environment variable the operator must set."""
        message = f"API key missing: set {env_var} in .env"
        super().__init__(message)
        self.env_var = env_var


class ProviderCallError(AdapterError):
    """The provider call failed or returned an unusable payload."""

    provider: str
    detail: str

    def __init__(self, provider: str, detail: str) -> None:
        """Remember which provider failed and why."""
        message = f"{provider}: {detail}"
        super().__init__(message)
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


@dataclass(frozen=True, slots=True)
class InputBudget:
    """Maximum input megapixels per role; None = no documented limit.

    Providers express limits in megapixels (1 MP = 1,000,000 px).
    """

    person: float | None
    garment: float | None


@runtime_checkable
class TryOnAdapter(Protocol):
    """The contract every try-on provider implements."""

    name: ClassVar[str]
    price_per_generation_usd: ClassVar[float]
    input_budget: ClassVar[InputBudget]

    def try_on(self, request: TryOnRequest) -> Awaitable[TryOnResult]:
        """Generate a try-on image; raises a subclass of AdapterError on failure."""
        ...
