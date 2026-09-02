"""Offline tests for megapixel-budget downscaling."""

from __future__ import annotations

from pathlib import Path

from ai.preprocessing.resize import PIXELS_PER_MEGAPIXEL, downscale_to_budget
from ai.preprocessing.validate import validate_image
from PIL import Image


def _write_image(path: Path, width: int, height: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (width, height), (100, 120, 140)).save(path)


def test_within_budget_returns_original_path(tmp_path: Path) -> None:
    original = tmp_path / "person.jpg"
    _write_image(original, 256, 256)
    image = validate_image(original)

    result = downscale_to_budget(image, 2.0, tmp_path / "cache")

    assert result == original
    assert not (tmp_path / "cache").exists()


def test_none_budget_returns_original_path(tmp_path: Path) -> None:
    original = tmp_path / "person.jpg"
    _write_image(original, 4096, 4096)
    image = validate_image(original)

    result = downscale_to_budget(image, None, tmp_path / "cache")

    assert result == original
    assert not (tmp_path / "cache").exists()


def test_over_budget_downscales_within_budget(tmp_path: Path) -> None:
    original = tmp_path / "person.jpg"
    _write_image(original, 2000, 1500)  # 3.0 MP
    image = validate_image(original)
    cache = tmp_path / "cache"

    result = downscale_to_budget(image, 1.0, cache)

    assert result != original
    assert result.parent == cache
    with Image.open(result) as resized:
        assert resized.width * resized.height <= PIXELS_PER_MEGAPIXEL


def test_downscale_preserves_aspect_ratio(tmp_path: Path) -> None:
    original = tmp_path / "person.jpg"
    _write_image(original, 2000, 1500)  # aspect 4:3
    image = validate_image(original)

    result = downscale_to_budget(image, 1.0, tmp_path / "cache")

    with Image.open(result) as resized:
        assert abs(resized.width / resized.height - 2000 / 1500) < 0.01


def test_original_file_untouched_after_downscale(tmp_path: Path) -> None:
    original = tmp_path / "person.jpg"
    _write_image(original, 2000, 1500)
    image = validate_image(original)
    before = original.read_bytes()

    _ = downscale_to_budget(image, 1.0, tmp_path / "cache")

    assert original.read_bytes() == before
    with Image.open(original) as untouched:
        assert untouched.size == (2000, 1500)
