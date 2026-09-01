"""Candidate registry: benchmark candidate ids → adapter factories."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from enum import StrEnum
from typing import Final

from ai.adapters.base import TryOnAdapter
from ai.adapters.fashn_v16 import FashnV16Adapter
from ai.adapters.flux_vto import FluxVtoAdapter


class InvalidCandidateError(Exception):
    """The requested benchmark candidate id is unknown."""


class CandidateId(StrEnum):
    """Stable ids used on the CLI (--candidate fashn_v1_6)."""

    FASHN_V1_6 = "fashn_v1_6"
    FLUX_VTO = "flux_vto"


def _fashn_v1_6_factory() -> TryOnAdapter:
    """Build the FASHN v1.6 adapter with production defaults."""
    return FashnV16Adapter()


def _flux_vto_factory() -> TryOnAdapter:
    """Build the FLUX VTO adapter with production defaults."""
    return FluxVtoAdapter()


CANDIDATES: Final[dict[CandidateId, Callable[[], TryOnAdapter]]] = {
    CandidateId.FASHN_V1_6: _fashn_v1_6_factory,
    CandidateId.FLUX_VTO: _flux_vto_factory,
}


def parse_candidates(ids: Sequence[str]) -> tuple[CandidateId, ...]:
    """Validate candidate ids early, listing every unknown id on failure."""
    unknown = [i for i in ids if i not in CANDIDATES]
    if unknown:
        valid = ", ".join(c.value for c in CANDIDATES)
        message = f"unknown candidate(s): {', '.join(unknown)} (valid: {valid})"
        raise InvalidCandidateError(message)
    return tuple(CandidateId(i) for i in ids)


def make_adapter(candidate_id: str) -> TryOnAdapter:
    """Instantiate the adapter for a candidate id; raise if unknown."""
    try:
        key = CandidateId(candidate_id)
    except ValueError as err:
        message = f"unknown candidate: {candidate_id}"
        raise InvalidCandidateError(message) from err
    return CANDIDATES[key]()
