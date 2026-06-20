# Distributed Order Processing Platform

An event-driven order pipeline: an API accepts orders, then independent services coordinate
inventory, payment, and notification asynchronously over Kafka, with idempotency, retries,
a dead-letter queue, and saga-based rollback on failure.

## Architecture
See `docs/architecture.md` for the sequence diagram and topics. Full design guide in
`docs/BUILD_GUIDE.md`. Services: order, inventory, payment, notification. Infra: Kafka (KRaft),
PostgreSQL, Redis.

## What is implemented
- Async happy path: order -> inventory reserve -> payment -> confirmation, all over Kafka.
- Saga rollback: a failed payment releases reserved inventory and marks the order FAILED.
- Idempotent consumers (dedupe via `processed_events`) and idempotent state transitions.
- Retries with exponential backoff and a dead-letter topic for poison messages (`shared/kafka_utils.py`).
- Optimistic-locked inventory reservation (conditional update + version bump).
- Prometheus metrics on every service and an end-to-end order-latency histogram.

## Quick start
```bash
# 1) infra
docker compose up -d

# 2) python env
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# 3) run services (each in its own terminal)
make order          # order-service on :8000 (also serves /metrics)
make inventory      # metrics on :8001
make payment        # metrics on :8002
make notification   # metrics on :8003

# 4) verify end-to-end
python scripts/smoke_test.py
```

## Observability (Phase 3)
```bash
docker compose -f docker-compose.observability.yml up -d
# Prometheus: http://localhost:9090   Grafana: http://localhost:3000 (dashboard auto-provisioned)
```

## Load test
```bash
k6 run load_tests/order_load_test.js
```
Use this to fill the Results section. Set PAYMENT_FAILURE_RATE in `.env` (e.g. 0.2) to exercise rollback.

## Results
TODO (fill after the k6 load test):
- Throughput: X orders/sec
- Latency: p95 Y ms, p99 Z ms
- Resilience: zero lost/duplicate orders under N% injected payment failures
- Scaling: throughput from 1 to N consumers

## Design decisions & tradeoffs
- Saga (choreography) vs two-phase commit: chose saga for loose coupling and availability.
- At-least-once delivery + idempotency: consumers dedupe by event_id; state transitions are
  guarded (only a PENDING order transitions), so duplicate events are harmless.
- Known limitation (good interview talking point): publishing happens after the DB commit, so a
  crash in that window could drop a downstream event. The fix is a transactional outbox; left as
  a documented next step.
- Partitioning by order_id preserves per-order event ordering.

## Demo
TODO: 60-second Loom/GIF of an order flowing through, plus a failure recovering.

## Remaining for Yesha (Phase 3 finish)
1. Run the k6 load test and record throughput + p95/p99 into Results.
2. Capture Grafana screenshots into `docs/`.
3. Write up the Design Decisions section in her own words (this is what she defends in interviews).
4. Record the 60-second demo.
5. Optional: add OpenTelemetry spans for true distributed traces across services.
