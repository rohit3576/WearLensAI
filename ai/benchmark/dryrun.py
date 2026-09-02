"""Offline stand-ins for the live fal gateway.

``DryRunGateway`` feeds the real adapters fake URLs and a schema-shaped
payload; :func:`write_result_placeholder` replaces result downloads with
tiny valid JPEGs so downstream tooling sees real files on disk.
"""

from __future__ import annotations

import io
from collections.abc import Mapping
from pathlib import Path
from typing import Final, final

import anyio
from PIL import Image

from ai.adapters.fal import JsonValue

PLACEHOLDER_SIZE_PX: Final = 16
PLACEHOLDER_COLOR: Final = (120, 120, 130)


@final
class DryRunGateway:
    """Fake gateway: stable fake URLs, schema-shaped payload, zero network."""

    async def upload(self, path: Path) -> str:
        """Pretend to upload; return a fake hosted URL."""
        return f"dry-run://{path.name}"

    async def run(
        self, model_id: str, arguments: Mapping[str, JsonValue]
    ) -> JsonValue:
        """Return a payload shaped like every fal VTO response."""
        return {
            "images": [{"url": f"dry-run://results/{model_id}?{len(arguments)}args"}]
        }


async def write_result_placeholder(dest: Path) -> None:
    """Write a tiny valid JPEG so downstream tooling sees real files."""
    image = Image.new(
        "RGB", (PLACEHOLDER_SIZE_PX, PLACEHOLDER_SIZE_PX), PLACEHOLDER_COLOR
    )
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    async_dest = anyio.Path(dest)
    await async_dest.parent.mkdir(parents=True, exist_ok=True)
    await async_dest.write_bytes(buffer.getvalue())
