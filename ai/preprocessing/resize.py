"""Aspect-preserving downscale to an adapter's megapixel input budget.

Providers express input limits in megapixels (FLUX VTO: person 2 MP,
garment 1 MP). Validated images within budget pass through untouched —
no copy, no re-encode; oversized images are downscaled into a cache dir
and the ORIGINALS are never mutated.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Final

from PIL import Image

from ai.preprocessing.validate import ValidatedImage

PIXELS_PER_MEGAPIXEL: Final = 1_000_000
JPEG_QUALITY: Final = 95
JPEG_SUFFIXES: Final = frozenset({".jpg", ".jpeg"})


def _target_size(width: int, height: int, max_pixels: int) -> tuple[int, int]:
    """Largest aspect-preserving size that fits within ``max_pixels``."""
    factor = math.sqrt(max_pixels / (width * height))
    return max(1, math.floor(width * factor)), max(1, math.floor(height * factor))


def downscale_to_budget(
    image: ValidatedImage, max_megapixels: float | None, cache_dir: Path
) -> Path:
    """Return a path whose pixel count fits the budget.

    Returns the original path when the budget is None or already met;
    otherwise writes an aspect-preserved downscale to ``cache_dir``.
    """
    if max_megapixels is None:
        return image.path
    max_pixels = math.floor(max_megapixels * PIXELS_PER_MEGAPIXEL)
    if image.width * image.height <= max_pixels:
        return image.path
    new_width, new_height = _target_size(image.width, image.height, max_pixels)
    dest = (
        cache_dir / f"{image.path.stem}__{new_width}x{new_height}{image.path.suffix}"
    )
    with Image.open(image.path) as source:
        resized = source.resize(
            (new_width, new_height), resample=Image.Resampling.LANCZOS
        )
        dest.parent.mkdir(parents=True, exist_ok=True)
        if image.path.suffix.lower() in JPEG_SUFFIXES:
            resized.save(dest, quality=JPEG_QUALITY)
        else:
            resized.save(dest)
    return dest
