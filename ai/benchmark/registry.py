"""Candidate registry: benchmark candidate ids → adapter classes."""

from __future__ import annotations

from collections.abc import Sequence
from enum import StrEnum
from typing import Final

from ai.adapters.base import TryOnAdapter
from ai.adapters.fal import FalTryOnAdapter
from ai.adapters.fashn_v16 import FashnV16Adapter
from ai.adapters.flux_vto import FluxVtoAdapter
from ai.benchmark.dryrun import DryRunGateway


class InvalidCandidateError(Exception):
    """The requested benchmark candidate id is unknown."""


class CandidateId(StrEnum):
    """Stable ids used on the CLI (--candidate fashn_v1_6)."""

    FASHN_V1_6 = "fashn_v1_6"
    FLUX_VTO = "flux_vto"


CANDIDATES: Final[dict[CandidateId, type[FalTryOnAdapter]]] = {
    CandidateId.FASHN_V1_6: FashnV16Adapter,
    CandidateId.FLUX_VTO: FluxVtoAdapter,
}


def parse_candidates(ids: Sequence[str]) -> tuple[CandidateId, ...]:
    """Validate candidate ids early, listing every unknown id on failure."""
    unknown = [i for i in ids if i not in CANDIDATES]
    if unknown:
        valid = ", ".join(c.value for c in CANDIDATES)
        message = f"unknown candidate(s): {', '.join(unknown)} (valid: {valid})"
        raise InvalidCandidateError(message)
    return tuple(CandidateId(i) for i in ids)


def _lookup(candidate_id: str) -> type[FalTryOnAdapter]:
    """Resolve a candidate id to its adapter class or raise a typed error."""
    try:
        key = CandidateId(candidate_id)
    except ValueError as err:
        valid = ", ".join(c.value for c in CANDIDATES)
        message = f"unknown candidate: {candidate_id} (valid: {valid})"
        raise InvalidCandidateError(message) from err
    return CANDIDATES[key]


def make_adapter(candidate_id: str) -> TryOnAdapter:
    """Instantiate the live adapter for a candidate id; raise if unknown."""
    return _lookup(candidate_id)()


def make_dry_adapter(candidate_id: str) -> TryOnAdapter:
    """Instantiate the offline stand-in: same schema handling, zero network.

    Uses the real adapter class with the fake gateway and a dummy key, so a
    dry run exercises discovery → validation → argument building → records.
    """
    return _lookup(candidate_id)(gateway=DryRunGateway(), key="dry-run")
