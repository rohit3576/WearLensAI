"""Offline tests for the benchmark candidate registry."""

from __future__ import annotations

import pytest
from ai.adapters.base import TryOnAdapter
from ai.adapters.fashn_v16 import FashnV16Adapter
from ai.adapters.flux_vto import FluxVtoAdapter
from ai.benchmark.registry import (
    CANDIDATES,
    InvalidCandidateError,
    make_adapter,
    parse_candidates,
)


def test_parse_candidates_accepts_all_known_ids() -> None:
    assert parse_candidates(["fashn_v1_6", "flux_vto"]) == ("fashn_v1_6", "flux_vto")


def test_parse_candidates_lists_every_unknown_id() -> None:
    with pytest.raises(InvalidCandidateError) as excinfo:
        parse_candidates(["fashn_v1_6", "nope", "also-bad"])

    assert "nope" in str(excinfo.value)
    assert "also-bad" in str(excinfo.value)


def test_make_adapter_returns_matching_class() -> None:
    assert isinstance(make_adapter("fashn_v1_6"), FashnV16Adapter)
    assert isinstance(make_adapter("flux_vto"), FluxVtoAdapter)


def test_make_adapter_rejects_unknown_id() -> None:
    with pytest.raises(InvalidCandidateError):
        make_adapter("gpt_tryon")


def test_every_factory_builds_offline_without_a_key() -> None:
    for candidate_id, factory in CANDIDATES.items():
        adapter = factory()
        assert isinstance(adapter, TryOnAdapter)
        assert adapter.name == candidate_id.value
        assert adapter.price_per_generation_usd > 0
