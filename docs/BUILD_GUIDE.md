# Yesha Flagship Project: Distributed Order Processing Platform
Build guide. Goal: one standout project that proves real distributed-systems ability and generates
hard, defensible resume metrics. This is the highest-leverage asset for landing backend/SWE interviews.

## Why this project
Her current four projects (LearnBot, AI Closet, TicketHub, Mindful Journaling) show full-stack and
AI/RAG ability, but none demonstrate distributed-systems depth: async messaging, a correctly
implemented distributed transaction, idempotency, fault tolerance, and load-tested scale. Those are
exactly what backend interviewers at Amazon/FAANG probe. This project fills that gap and mirrors a
real Amazon-style order pipeline, which is a nice tie-in for an Amazon referral.

## The X factor (treat these as REQUIRED, not extras)
The idea alone is common. What makes it stand out is proof and depth most new grads skip:
1. Real measured numbers under load: a k6 load-test report + Grafana screenshots committed to the repo.
2. Demonstrated resilience with evidence: inject a configurable payment-failure rate (e.g., 20%) and
   show zero lost or duplicate orders.
3. README with an architecture diagram AND a "Design Decisions & Tradeoffs" section.
4. A 60-second demo (Loom video or animated GIF) showing the system running and recovering from a failure.
5. One "go deeper" moment: a graph of throughput scaling from 1 to N consumers, or hot-partition handling.

## The system in one line
An order API accepts orders, then independent services coordinate inventory, payment, and notification
asynchronously over a message broker, with retries, rollback on failure (saga), and full tracing.

## Architecture (event flow)
1. **Order API**: `POST /orders` validates, saves the order as PENDING with an idempotency key,
   publishes `OrderCreated`, returns `202 Accepted` with an order ID.
2. **Inventory service**: consumes `OrderCreated`, reserves stock in a DB transaction (optimistic lock),
   publishes `InventoryReserved` or `InventoryFailed`.
3. **Payment service**: consumes `InventoryReserved`, simulates a charge with a configurable failure
   rate, publishes `PaymentCompleted` or `PaymentFailed`.
4. **Order service**: on `PaymentCompleted` marks the order CONFIRMED; on any failure marks it FAILED
   and triggers compensation (release reserved inventory). This is the saga rollback.
5. **Notification service**: consumes the terminal event and sends a simulated confirmation email.

Compensation path: `InventoryFailed` or `PaymentFailed` -> order service publishes `ReleaseInventory`
-> inventory service restocks. This is the distributed-transaction rollback story.

## Tech stack
- **Chosen: Python + FastAPI**, Apache Kafka (KRaft mode), PostgreSQL, Redis (idempotency cache),
  Docker Compose, k6 (load tests), OpenTelemetry + Prometheus + Grafana (observability).
  Libraries: aiokafka, asyncpg, redis.asyncio, pydantic.
- **Why Python/FastAPI**: she is most fluent here (LearnBot), so the turnaround is faster while still
  demonstrating every distributed-systems concept. The architecture and interview talking points are
  language-agnostic, the language choice does not weaken any of them.
- Java + Spring Boot remains a valid higher-ceiling alternative, but Python wins on speed for this build.
- Broker alternative: RabbitMQ is simpler than Kafka if needed, but Kafka is the stronger resume signal.

## Cross-cutting concerns (the substance)
- **Idempotency**: idempotency key on order creation; consumers dedupe by event ID (a `processed_events`
  table or a Redis set) so retried messages never double-process.
- **Retries + DLQ**: failed processing retried with exponential backoff; after N attempts route to a
  dead-letter topic.
- **Delivery semantics**: handle at-least-once delivery correctly (which is why idempotency matters).
- **Observability**: a correlation/trace ID flows through every event; OpenTelemetry traces span all
  services; Prometheus metrics (orders processed, latency histograms); a Grafana dashboard.
- **Resilience**: a circuit breaker (resilience4j in Spring) on the payment service.

## Phased build plan (each phase is demoable on its own)
Timeline is compressed per Sagar; phases are sequencing, not calendar weeks. Move as fast as each
phase gate allows. A scaffold (infra + service skeletons + TODOs) is already generated to skip setup.
**Phase 1 (week 1) - MVP / happy path**
- Order API + Kafka + Inventory + Payment(sim) + Postgres, async end-to-end flow, Docker Compose.
- Done when: posting an order flows through all services and ends CONFIRMED, all via `docker compose up`.

**Phase 2 (week 2) - distributed-systems rigor**
- Idempotency, retries + DLQ, saga compensation on failure, structured logging.
- Done when: injecting payment failures rolls back inventory and never double-charges or loses an order.

**Phase 3 (week 3) - the proof (this generates the metrics)**
- OpenTelemetry tracing, Prometheus/Grafana dashboard, k6 load test, capture metrics.
- README with architecture diagram, the numbers, and the tradeoffs section. Record the demo.
- Done when: the repo has a load-test report, dashboard screenshots, a diagram, and a demo link.

If time runs out after Phase 2, she still has a strong, complete project. Phase 3 is what produces the
resume metrics and the X factor.

## Metrics it will produce (resume payoff)
- Sustained throughput: orders/sec processed.
- p95/p99 end-to-end order latency under load.
- Resilience: zero duplicate or lost orders under an injected payment-failure rate.
- Scaling: throughput change when consumers scale from 1 to N.

## Resume bullets it will generate (fill in real numbers after the load test)
- Built an event-driven order-processing platform (Spring Boot, Kafka, PostgreSQL, Redis) with N
  services coordinating a distributed transaction via the saga pattern, sustaining X orders/sec at p95 Y ms under load.
- Implemented idempotent consumers, exponential-backoff retries, and a dead-letter queue, processing
  orders with zero duplicates or losses under an injected 20% payment-failure rate.
- Added distributed tracing (OpenTelemetry) and Prometheus/Grafana dashboards across services, and
  load-tested with k6 to validate throughput scaling from 1 to N consumers.
- Containerized the full stack with Docker Compose for one-command local startup.

## Repo structure (recruiters click GitHub - make it sharp)
```
order-platform/
  order-service/        # API + order state + saga coordination
  inventory-service/
  payment-service/
  notification-service/
  shared/               # event schemas, common libs
  load-tests/           # k6 scripts + results
  docs/                 # architecture diagram, sequence diagrams
  docker-compose.yml    # Kafka, Postgres, Redis, all services, Prometheus, Grafana
  README.md             # diagram, how-to-run, metrics, design tradeoffs, demo link
```

## README outline (the README is half the impression)
1. One-paragraph what + why.
2. Architecture diagram (draw.io / Excalidraw) + the event flow.
3. Quick start: `docker compose up`, then `curl` a sample order.
4. Results: throughput, p95/p99 latency, resilience test outcome, scaling graph.
5. Design Decisions & Tradeoffs: saga vs 2PC, at-least-once + idempotency, Kafka partitioning, DLQ strategy.
6. Demo: embedded GIF or Loom link.

## Interview talking points it sets up
At-least-once vs exactly-once delivery; why idempotency matters; saga vs two-phase commit; backpressure;
how she handled a poison message; how she'd scale a hot partition. Senior-sounding answers grounded in
something she actually built.

## Pre-build checklist
- Decide language (Java/Spring Boot recommended, Python/FastAPI fallback).
- Confirm she has Docker Desktop installed.
- Create the GitHub repo early; commit often (green graph + real history is itself a signal).
- Pin this repo on her GitHub profile once Phase 1 is demoable.
