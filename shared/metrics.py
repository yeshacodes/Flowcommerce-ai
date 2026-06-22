"""Prometheus metrics shared across all services.

The original EVENTS / ORDER_LATENCY metrics are preserved for backward
compatibility; everything below them was added for the observability stack.
All services import these same objects so a single /metrics scrape per service
exposes a consistent, comparable set of series.
"""
from prometheus_client import Counter, Histogram, start_http_server

# ── Original metrics (kept as-is) ───────────────────────────────────────────
EVENTS = Counter(
    "op_events_total",
    "Events processed by a service",
    ["service", "event", "status"],
)

ORDER_LATENCY = Histogram(
    "op_order_e2e_seconds",
    "End-to-end seconds from order creation to terminal state",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30),
)

# ── HTTP layer ──────────────────────────────────────────────────────────────
HTTP_REQUESTS = Counter(
    "op_http_requests_total",
    "HTTP requests handled",
    ["service", "method", "path", "status"],
)

HTTP_LATENCY = Histogram(
    "op_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["service", "method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5),
)

HTTP_ERRORS = Counter(
    "op_http_errors_total",
    "HTTP responses with a 5xx status",
    ["service", "method", "path"],
)

# ── Kafka layer ─────────────────────────────────────────────────────────────
KAFKA_PUBLISHED = Counter(
    "op_kafka_events_published_total",
    "Kafka events published",
    ["service", "topic"],
)

KAFKA_CONSUMED = Counter(
    "op_kafka_events_consumed_total",
    "Kafka events consumed",
    ["service", "topic", "status"],  # status: ok | dlq
)

# ── Business metrics ────────────────────────────────────────────────────────
ORDERS_CREATED = Counter("op_orders_created_total", "Orders created", ["service"])
ORDERS_CONFIRMED = Counter("op_orders_confirmed_total", "Orders confirmed", ["service"])
ORDERS_FAILED = Counter(
    "op_orders_failed_total", "Orders failed", ["service", "reason"]
)

PAYMENTS_SUCCEEDED = Counter(
    "op_payments_succeeded_total", "Payments succeeded", ["service", "provider"]
)
PAYMENTS_FAILED = Counter(
    "op_payments_failed_total", "Payments failed", ["service", "provider"]
)
STRIPE_LATENCY = Histogram(
    "op_stripe_request_duration_seconds",
    "Stripe PaymentIntent call latency in seconds",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
)

INVENTORY_RESERVATIONS = Counter(
    "op_inventory_reservations_total",
    "Inventory reservation attempts",
    ["service", "result"],  # result: reserved | failed
)

EMAILS_SENT = Counter(
    "op_email_notifications_sent_total",
    "Email notifications attempted",
    ["service", "type", "result"],  # result: sent | skipped | error
)


def serve_metrics(port: int) -> None:
    """Expose /metrics on the given port (legacy helper; prefer ops_server)."""
    start_http_server(port)
