"""Discovery of benchmark test pairs from the local test image directory.

Layout (per docs/private/phases/implementation-plan.md Phase 1):

    test/
    ├── person_01.jpg ...          person photos (repo root of test/)
    └── garments/
        ├── shirt_01.jpg ...
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

GARMENT_DIR_NAME = "garments"
IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})


class TestSetError(Exception):
    """The test directory does not contain a usable test set."""


@dataclass(frozen=True, slots=True)
class TestPair:
    """One benchmark job: a person photo crossed with a garment photo."""

    person: Path
    garment: Path


def _images_in(directory: Path) -> tuple[Path, ...]:
    return tuple(
        sorted(p for p in directory.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    )


def discover_test_set(test_dir: Path) -> tuple[TestPair, ...]:
    """Return the full person x garment cross product, or raise TestSetError."""
    if not test_dir.is_dir():
        raise TestSetError(f"test directory not found: {test_dir}")
    garment_dir = test_dir / GARMENT_DIR_NAME
    if not garment_dir.is_dir():
        raise TestSetError(f"garment directory not found: {garment_dir}")
    persons = _images_in(test_dir)
    garments = _images_in(garment_dir)
    if not persons:
        raise TestSetError(f"no person images found in {test_dir}")
    if not garments:
        raise TestSetError(f"no garment images found in {garment_dir}")
    return tuple(TestPair(person=p, garment=g) for p in persons for g in garments)
