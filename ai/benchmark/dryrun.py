"""Offline stand-in for the live fal gateway.

``DryRunGateway`` feeds the real adapters fake URLs and a schema-shaped
payload, proving the benchmark loop with zero API spend. Placeholder result
writing lives in ``ai.postprocessing.save``.
"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import final

from ai.adapters.fal import JsonValue


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
