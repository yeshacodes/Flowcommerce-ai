"""Structured JSON logging with request/correlation context.

Every log line is emitted as a single JSON object carrying the service name and,
when available, the request_id / correlation_id / saga_id / order_id bound to the
current async context. HTTP middleware and the Kafka consumer set these via
bind_context(); log call sites can attach an event name with
log.info("...", extra={"event": "PaymentProcessed"}).
"""
from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar

correlation_id_var: ContextVar[str | None] = ContextVar("correlation_id", default=None)
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
order_id_var: ContextVar[str | None] = ContextVar("order_id", default=None)
saga_id_var: ContextVar[str | None] = ContextVar("saga_id", default=None)

_SERVICE_NAME = "unknown-service"

# Attributes already present on a LogRecord — anything else passed via extra= is
# treated as a structured field and merged into the JSON output.
_RESERVED = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime", "event"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "service": _SERVICE_NAME,
            "level": record.levelname,
            "message": record.getMessage(),
        }

        for key, var in (
            ("request_id", request_id_var),
            ("correlation_id", correlation_id_var),
            ("saga_id", saga_id_var),
            ("order_id", order_id_var),
        ):
            value = var.get()
            if value:
                payload[key] = value

        event = getattr(record, "event", None)
        if event:
            payload["event"] = event

        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload.setdefault(key, value)

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging(service_name: str, level: int = logging.INFO) -> None:
    """Install the JSON formatter as the sole root handler for this service."""
    global _SERVICE_NAME
    _SERVICE_NAME = service_name

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Quiet noisy third-party loggers so the JSON stream stays readable.
    for noisy in ("aiokafka", "uvicorn.access", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_service_name() -> str:
    return _SERVICE_NAME


def bind_context(
    *,
    correlation_id: str | None = None,
    request_id: str | None = None,
    order_id: str | None = None,
    saga_id: str | None = None,
) -> None:
    """Bind identifiers to the current async context for downstream log lines."""
    if correlation_id is not None:
        correlation_id_var.set(correlation_id)
    if request_id is not None:
        request_id_var.set(request_id)
    if order_id is not None:
        order_id_var.set(order_id)
    if saga_id is not None:
        saga_id_var.set(saga_id)
