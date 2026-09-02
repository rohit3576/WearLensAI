"""Shared plumbing for fal.ai-backed try-on adapters.

:class:`FalGateway` is the single seam to the fal SDK: offline tests inject
a fake, production uses :class:`LiveFalGateway`. Both concrete adapters
(FASHN v1.6, FLUX VTO) build on the :class:`FalTryOnAdapter` template:
upload both images, run the model, extract the first result image URL.

The SDK's public API returns ``Dict[str, Any]``, so :class:`LiveFalGateway`
re-validates every result through a Pydantic ``TypeAdapter`` on the recursive
:data:`JsonValue` alias — untyped data never crosses this module.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import ClassVar, Final, Protocol, final

import fal_client
from pydantic import TypeAdapter

from ai.adapters.base import (
    InputBudget,
    MissingApiKeyError,
    ProviderCallError,
    TryOnRequest,
    TryOnResult,
)
from ai.config import load_settings

type JsonValue = (
    str | int | float | bool | list[JsonValue] | dict[str, JsonValue] | None
)

FAL_KEY_ENV: Final = "FAL_KEY"

_json_value: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)


class FalGateway(Protocol):
    """The narrow fal.ai surface adapters depend on."""

    async def upload(self, path: Path) -> str:
        """Upload a local image; return its hosted URL."""
        ...

    async def run(self, model_id: str, arguments: Mapping[str, JsonValue]) -> JsonValue:
        """Run a model to completion; return the raw JSON payload."""
        ...


@final
class LiveFalGateway:
    """Production gateway over the official fal-client SDK."""

    def __init__(self) -> None:
        """Own one SDK client.

        The SDK's module-level aliases re-export bound methods that are
        only partially typed.
        """
        self._client = fal_client.AsyncClient()

    async def upload(self, path: Path) -> str:
        """Upload a local image to fal storage; return its hosted URL."""
        return await self._client.upload_file(path)

    async def run(
        self, model_id: str, arguments: Mapping[str, JsonValue]
    ) -> JsonValue:
        """Run a model to completion; return the re-validated payload."""
        payload = await self._client.subscribe(model_id, dict(arguments))
        return _json_value.validate_python(payload)


def _first_image_url(payload: JsonValue, provider: str) -> str:
    """Extract ``images[0].url`` — the one shape all fal VTO models share.

    Narrows untrusted JSON at the boundary (not a variant union), so the
    audit's assert_never rule does not apply here.
    """
    match payload:  # noqa: MATCH_OK
        case {"images": [{"url": str() as url}, *_]}:
            return url
        case _:
            raise ProviderCallError(provider, "response has no images[0].url")


class FalTryOnAdapter:
    """Template for fal.ai try-on models.

    Subclasses declare ``name``, ``model_id``, ``price_per_generation_usd``
    and implement :meth:`_build_arguments` with their model's verified schema.
    """

    name: ClassVar[str]
    model_id: ClassVar[str]
    price_per_generation_usd: ClassVar[float]
    input_budget: ClassVar[InputBudget]

    _gateway: FalGateway
    _key: str | None

    def __init__(
        self, *, gateway: FalGateway | None = None, key: str | None = None
    ) -> None:
        """Store the gateway seam and optional explicit API key.

        The key check fires at :meth:`try_on` call time (not here) so offline
        tools like ``list-candidates`` and the test suite never need one.
        """
        self._gateway = gateway if gateway is not None else LiveFalGateway()
        self._key = key

    async def try_on(self, request: TryOnRequest) -> TryOnResult:
        """Upload both images, run the model, return the first result image."""
        key = self._key if self._key is not None else load_settings().fal_key
        if not key:
            raise MissingApiKeyError(FAL_KEY_ENV)
        # fal-client reads credentials from the process environment.
        os.environ[FAL_KEY_ENV] = key
        try:
            person_url = await self._gateway.upload(request.person_image)
            garment_url = await self._gateway.upload(request.garment_image)
            payload = await self._gateway.run(
                self.model_id,
                self._build_arguments(person_url=person_url, garment_url=garment_url),
            )
        except fal_client.FalClientError as err:
            detail = f"{type(err).__name__}: {err}"
            raise ProviderCallError(self.name, detail) from err
        return TryOnResult(image_url=_first_image_url(payload, self.name))

    def _build_arguments(
        self, *, person_url: str, garment_url: str
    ) -> dict[str, JsonValue]:
        """Build the model-specific request arguments (verified schema)."""
        message = (
            f"{type(self).__name__} must implement _build_arguments "
            f"(person_url={person_url}, garment_url={garment_url})"
        )
        raise NotImplementedError(message)
