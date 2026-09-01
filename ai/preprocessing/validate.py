"""Boundary validation: an untrusted image path becomes a typed ValidatedImage.

This is the single trust boundary for images entering the pipeline —
everything downstream receives validated, typed values.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, UnidentifiedImageError

MIN_EDGE_PX: int = 256
MAX_EDGE_PX: int = 4096
ALLOWED_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})


class ImageValidationError(Exception):
    """Typed validation failure with a user-actionable reason."""

    def __init__(self, path: Path, reason: str) -> None:
        super().__init__(f"{path.name}: {reason}")
        self.path = path
        self.reason = reason


@dataclass(frozen=True, slots=True)
class ValidatedImage:
    """An image that passed boundary validation."""

    path: Path
    width: int
    height: int


def validate_image(path: Path) -> ValidatedImage:
    """Parse an untrusted image path into a ValidatedImage or raise ImageValidationError."""
    if not path.is_file():
        raise ImageValidationError(path, "file not found")
    if path.suffix.lower() not in ALLOWED_SUFFIXES:
        raise ImageValidationError(
            path, f"unsupported format '{path.suffix}' (use jpg, png or webp)"
        )
    try:
        with Image.open(path) as img:
            width, height = img.size
    except UnidentifiedImageError as err:
        raise ImageValidationError(path, "not a decodable image") from err
    short_edge, long_edge = min(width, height), max(width, height)
    if short_edge < MIN_EDGE_PX:
        raise ImageValidationError(
            path,
            f"resolution too low ({width}x{height}); shortest side must be >= {MIN_EDGE_PX}px",
        )
    if long_edge > MAX_EDGE_PX:
        raise ImageValidationError(
            path,
            f"resolution too high ({width}x{height}); longest side must be <= {MAX_EDGE_PX}px",
        )
    return ValidatedImage(path=path, width=width, height=height)
