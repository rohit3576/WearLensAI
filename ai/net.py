"""httpx2 client factory — canonical production defaults (HTTP/2, tuned pool,
split timeouts, transport retries, TCP_NODELAY). Always create clients here."""

from __future__ import annotations

import socket
import typing

import httpx2

_LIMITS = httpx2.Limits(
    max_connections=200,
    max_keepalive_connections=40,
    keepalive_expiry=30.0,
)

_TIMEOUT = httpx2.Timeout(
    connect=5.0,
    read=30.0,
    write=10.0,
    pool=10.0,
)

_SOCKET_OPTIONS: list[tuple[int, int, int]] = [
    (socket.IPPROTO_TCP, socket.TCP_NODELAY, 1),
]


def create_async_client(
    *,
    base_url: str = "",
    http2: bool = True,
    retries: int = 3,
    limits: httpx2.Limits = _LIMITS,
    timeout: httpx2.Timeout = _TIMEOUT,
    headers: dict[str, str] | None = None,
    event_hooks: dict[str, list[typing.Callable[..., typing.Any]]] | None = None,
    **kwargs: typing.Any,
) -> httpx2.AsyncClient:
    """Create an AsyncClient with all production defaults enabled."""
    transport = httpx2.AsyncHTTPTransport(
        http2=http2,
        retries=retries,
        limits=limits,
        socket_options=_SOCKET_OPTIONS,
    )
    return httpx2.AsyncClient(
        transport=transport,
        timeout=timeout,
        base_url=base_url,
        headers=headers or {},
        event_hooks=event_hooks or {},
        follow_redirects=True,
        **kwargs,
    )
