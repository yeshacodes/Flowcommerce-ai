"""Dependency health checks and process uptime.

Each service declares which dependencies it cares about (postgres / redis /
kafka); dependency_status() probes only those. Checks are deliberately cheap so
/health/details can be polled frequently without load: a real SELECT 1 for
Postgres, a PING for Redis, and a TCP connect for Kafka.
"""
from __future__ import annotations

import asyncio
import socket
import time

from .db import get_pool
from .settings import settings

_START = time.monotonic()


def uptime_seconds() -> int:
    return int(time.monotonic() - _START)


async def check_postgres() -> bool:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:
        return False


async def check_redis() -> bool:
    try:
        import redis.asyncio as redis

        client = redis.from_url(settings.redis_url, socket_connect_timeout=2)
        try:
            await client.ping()
        finally:
            await client.aclose()
        return True
    except Exception:
        return False


def _tcp_ok(host_port: str, default_port: int) -> bool:
    host, _, port = host_port.partition(":")
    try:
        with socket.create_connection((host, int(port or default_port)), timeout=2):
            return True
    except OSError:
        return False


async def check_kafka() -> bool:
    # A TCP connect to the broker is a cheap liveness signal that avoids spinning
    # up a full Kafka client on every health poll.
    return await asyncio.to_thread(_tcp_ok, settings.kafka_bootstrap, 9092)


_CHECKS = {
    "postgres": check_postgres,
    "redis": check_redis,
    "kafka": check_kafka,
}


async def dependency_status(deps: list[str]) -> dict[str, str]:
    """Return {dependency: 'healthy'|'down'} for the given dependencies."""
    results: dict[str, str] = {}
    for dep in deps:
        check = _CHECKS.get(dep)
        if check is None:
            continue
        ok = await check()
        results[dep] = "healthy" if ok else "down"
    return results
