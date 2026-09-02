"""Result packaging for finished try-ons.

Three concerns live here: downloading the hosted result image (live runs),
writing placeholder JPEGs (dry runs), and building side-by-side comparisons
for human review — the comparison doubles as a Phase 1 scoring aid.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Final

import anyio
import httpx2
from PIL import Image

PLACEHOLDER_SIZE_PX: Final = 16
PLACEHOLDER_COLOR: Final = (120, 120, 130)


class ResultDownloadError(Exception):
    """The hosted result image could not be downloaded."""

    url: str
    detail: str

    def __init__(self, url: str, detail: str) -> None:
        """Remember which URL failed and why."""
        message = f"result download failed ({url}): {detail}"
        super().__init__(message)
        self.url = url
        self.detail = detail


async def save_result(client: httpx2.AsyncClient, url: str, dest: Path) -> Path:
    """Download a hosted result image to ``dest``; raise on HTTP failure."""
    response = await client.get(url)
    try:
        response.raise_for_status()
    except httpx2.HTTPStatusError as err:
        raise ResultDownloadError(url, str(err)) from err
    async_dest = anyio.Path(dest)
    await async_dest.parent.mkdir(parents=True, exist_ok=True)
    await async_dest.write_bytes(response.content)
    return dest


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


def make_comparison(person: Path, result: Path, dest: Path) -> Path:
    """Write a side-by-side composite (person | result) to ``dest``.

    The result is scaled proportionally to the person's height.
    """
    with (
        Image.open(person) as person_image,
        Image.open(result) as result_image,
    ):
        scaled = result_image.resize(
            (
                round(result_image.width * person_image.height / result_image.height),
                person_image.height,
            ),
            resample=Image.Resampling.LANCZOS,
        )
        comparison = Image.new(
            "RGB", (person_image.width + scaled.width, person_image.height)
        )
        comparison.paste(person_image, (0, 0))
        comparison.paste(scaled, (person_image.width, 0))
        dest.parent.mkdir(parents=True, exist_ok=True)
        comparison.save(dest, quality=95)
    return dest
