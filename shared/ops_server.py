"""Background health + metrics HTTP server for the consumer services.

The consumer services (inventory / payment / notification) are not FastAPI
apps — they run a Kafka consume loop. This spins up a tiny FastAPI app on a
side port exposing the same /health, /health/details and /metrics endpoints as
the HTTP services, so Prometheus and the Operations page treat every service
identically. Replaces the old serve_metrics() which only exposed /metrics.
"""
from __future__ import annotations

import asyncio

import uvicorn
from fastapi import FastAPI

from .observability import attach_observability


async def serve_ops(service_name: str, port: int, deps: list[str]) -> uvicorn.Server:
    """Start the ops server as a background task on the current event loop."""
    app = FastAPI(title=f"{service_name} ops")
    attach_observability(app, service_name, deps)

    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=port,
        log_config=None,
        access_log=False,
    )
    server = uvicorn.Server(config)
    asyncio.create_task(server.serve())
    return server
