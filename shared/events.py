from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


class Topics(str, Enum):
    ORDER_CREATED = "order.created"
    INVENTORY_RESERVED = "inventory.reserved"
    INVENTORY_FAILED = "inventory.failed"
    PAYMENT_COMPLETED = "payment.completed"
    PAYMENT_FAILED = "payment.failed"
    ORDER_CONFIRMED = "order.confirmed"
    ORDER_FAILED = "order.failed"
    RELEASE_INVENTORY = "inventory.release"
    DLQ = "dlq"

    def __str__(self) -> str:  # so str(topic) == the wire topic name
        return self.value


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Event(BaseModel):
    """Generic event envelope passed across services.

    correlation_id ties together every event in one order's lifecycle (use it as the trace id).
    `type` is a human-readable label; `data` holds the payload (items, amounts, reason, etc.).
    """

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    correlation_id: str
    saga_id: str | None = None  # identifies the saga instance; defaults to correlation_id
    order_id: str
    type: str
    occurred_at: str = Field(default_factory=_now)
    data: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _default_saga_id(self) -> "Event":
        # The order lifecycle (correlation_id) is the saga instance, so saga_id
        # tracks it unless explicitly overridden. This propagates automatically
        # to every downstream event without touching existing call sites.
        if self.saga_id is None:
            self.saga_id = self.correlation_id
        return self
