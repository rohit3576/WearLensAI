"""Offline tests for result packaging: download, placeholder, comparison."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import httpx2
import pytest
from ai.postprocessing.save import (
    ResultDownloadError,
    make_comparison,
    save_result,
    write_result_placeholder,
)
from PIL import Image

pytestmark = pytest.mark.anyio


def _png_bytes(width: int, height: int) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (width, height), (90, 110, 130)).save(buffer, format="PNG")
    return buffer.getvalue()


async def test_save_result_downloads_to_dest(tmp_path: Path) -> None:
    payload = _png_bytes(32, 48)
    dest = tmp_path / "out" / "result.jpg"

    async def handler(request: httpx2.Request) -> httpx2.Response:
        _ = request
        return httpx2.Response(200, content=payload)

    async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
        result = await save_result(client, "https://cdn.example/r.png", dest)

    assert result == dest
    assert dest.read_bytes() == payload


async def test_save_result_wraps_http_failure(tmp_path: Path) -> None:
    dest = tmp_path / "out" / "result.jpg"

    async def handler(request: httpx2.Request) -> httpx2.Response:
        _ = request
        return httpx2.Response(404)

    async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
        with pytest.raises(ResultDownloadError, match="404"):
            await save_result(client, "https://cdn.example/missing.png", dest)


async def test_write_result_placeholder_creates_jpeg(tmp_path: Path) -> None:
    dest = tmp_path / "nested" / "placeholder.jpg"

    await write_result_placeholder(dest)

    with Image.open(dest) as image:
        assert image.format == "JPEG"
        assert image.size == (16, 16)


def test_make_comparison_same_height_side_by_side(tmp_path: Path) -> None:
    person = tmp_path / "person.jpg"
    result = tmp_path / "result.jpg"
    Image.new("RGB", (400, 300), (200, 60, 60)).save(person)
    Image.new("RGB", (500, 300), (60, 60, 200)).save(result)
    dest = tmp_path / "compare.jpg"

    outcome = make_comparison(person, result, dest)

    assert outcome == dest
    with Image.open(dest) as comparison:
        assert comparison.size == (900, 300)


def test_make_comparison_scales_result_to_person_height(tmp_path: Path) -> None:
    person = tmp_path / "person.jpg"
    result = tmp_path / "result.jpg"
    Image.new("RGB", (400, 300), (200, 60, 60)).save(person)
    Image.new("RGB", (200, 600), (60, 60, 200)).save(result)  # 1:3 aspect
    dest = tmp_path / "compare.jpg"

    make_comparison(person, result, dest)

    with Image.open(dest) as comparison:
        assert comparison.height == 300
        assert comparison.width == 400 + 100  # 200 * (300/600)
