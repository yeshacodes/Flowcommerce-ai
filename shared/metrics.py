from prometheus_client import Counter, Histogram, start_http_server

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


def serve_metrics(port: int) -> None:
    """Expose /metrics on the given port (used by the consumer services)."""
    start_http_server(port)
