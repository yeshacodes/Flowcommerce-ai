"""FastAPI observability wiring: request middleware + standard endpoints.

attach_observability() gives any FastAPI app:
  - a middleware that assigns request_id / correlation_id, binds them to the
    logging context, records HTTP metrics, and echoes the ids back as headers
  - GET /health           — fast liveness probe
  - GET /health/details   — dependency rollup + version + uptime
  - GET /metrics          — Prometheus exposition

It is safe to call on services that previously defined their own /health or
/metrics: pass include_* flags to skip the ones a service already owns.
"""
from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from . import metrics
from .health import dependency_status, uptime_seconds
from .logging_config import correlation_id_var, order_id_var, request_id_var, saga_id_var

VERSION = "1.0.0"


def attach_observability(
    app: FastAPI,
    service_name: str,
    deps: list[str],
    *,
    include_health: bool = True,
    include_metrics: bool = True,
) -> None:
    @app.middleware("http")
    async def _observability_mw(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        correlation_id = request.headers.get("x-correlation-id") or request_id
        request_id_var.set(request_id)
        correlation_id_var.set(correlation_id)
        order_id_var.set(None)
        saga_id_var.set(None)

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            path = _route_path(request, request.url.path)
            metrics.HTTP_ERRORS.labels(service_name, request.method, path).inc()
            metrics.HTTP_REQUESTS.labels(service_name, request.method, path, "500").inc()
            raise

        duration = time.perf_counter() - start
        path = _route_path(request, request.url.path)
        metrics.HTTP_LATENCY.labels(service_name, request.method, path).observe(duration)
        metrics.HTTP_REQUESTS.labels(
            service_name, request.method, path, str(response.status_code)
        ).inc()
        if response.status_code >= 500:
            metrics.HTTP_ERRORS.labels(service_name, request.method, path).inc()

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Correlation-ID"] = correlation_id
        return response

    if include_health:
        @app.get("/health")
        async def health():
            return {"service": service_name, "status": "healthy"}

        @app.get("/health/details")
        async def health_details():
            dependencies = await dependency_status(deps)
            status = (
                "healthy"
                if all(v == "healthy" for v in dependencies.values())
                else "degraded"
            )
            return {
                "service": service_name,
                "status": status,
                "version": VERSION,
                "dependencies": dependencies,
                "uptime_seconds": uptime_seconds(),
            }

    if include_metrics:
        @app.get("/metrics")
        async def metrics_endpoint():
            return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


def _route_path(request: Request, fallback: str) -> str:
    """Use the matched route template (e.g. /orders/{order_id}) to keep label
    cardinality bounded — raw paths would explode with one series per UUID."""
    route = request.scope.get("route")
    return getattr(route, "path", fallback)
