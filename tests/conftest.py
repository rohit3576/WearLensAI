"""Shared pytest fixtures for the offline test suite."""

import pytest


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
