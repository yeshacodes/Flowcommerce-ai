# FlowCommerce AI — Distributed Order Processing Platform

A production-grade, event-driven order processing system built with Python microservices, Apache Kafka, and a React frontend. Designed to demonstrate distributed systems engineering concepts that come up in senior backend interviews: saga choreography, transactional outbox, idempotent consumers, and at-least-once delivery with exactly-once semantics.

**Live demo flow:** Register → browse products → checkout with a real Stripe card → watch the order timeline update in real time as Kafka events propagate through inventory, payment, and notification services.

---

## What this project demonstrates

This is not a tutorial follow-along. Every design decision below was made deliberately and can be defended in a technical interview. The system handles real failure modes: payment declines trigger automatic inventory release and order rollback, duplicate Kafka messages are safely deduplicated, and a crash between a Stripe API call and a database write is recovered automatically via webhook.

---

## Architecture

Six independent microservices communicate exclusively through Kafka topics. No service calls another over HTTP — they react to events. The frontend talks only to the order and catalog HTTP APIs; everything behind that is async.

```
Browser (React + Stripe Elements + Operations console)
    │
    ├─ GET  :8005  catalog-service    ──→ PostgreSQL (products, inventory)
    ├─ POST :8004  auth-service       ──→ PostgreSQL (users, JWT)
    └─ POST :8000  order-service      ──→ PostgreSQL (orders, outbox)
                       │
                  Kafka (KRaft)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  inventory-      payment-      notification-
   service         service        service
  :8001            :8002           :8003
(reserves       (Stripe PI /    (Resend email)
 stock)          simulated)
        │              │
        └──────────────┘
              │
         order-service
       (saga state machine)

  Observability plane (every service)
  ────────────────────────────────────────────────
  /health · /health/details · /metrics  +  JSON logs
        │                                    with correlation_id / saga_id
        ▼
  Prometheus :9090  ──→  Grafana :3000  (5 dashboards)
        ▲
        └─ scrapes :8000–:8006 /metrics every 5s
```

### Kafka topics

| Topic | Published by | Consumed by |
|---|---|---|
| `order.created` | order-service | inventory-service |
| `inventory.reserved` | inventory-service | payment-service |
| `inventory.failed` | inventory-service | order-service |
| `payment.completed` | payment-service | order-service |
| `payment.failed` | payment-service | order-service |
| `order.confirmed` | order-service | notification-service |
| `order.failed` | order-service | notification-service |
| `release.inventory` | order-service | inventory-service |

### Saga: happy path

```
order-service          inventory-service       payment-service        order-service
     │                        │                      │                      │
     │── OrderCreated ────────▶                      │                      │
     │                        │── InventoryReserved ─▶                      │
     │                        │                      │── PaymentCompleted ──▶
     │                        │                      │                      │── status: CONFIRMED
     │                        │                      │                      │── OrderConfirmed ──▶ notification
```

### Saga: payment failure rollback

```
     │                        │── InventoryReserved ─▶                      │
     │                        │                      │── PaymentFailed ─────▶
     │                        │                      │                      │── status: FAILED
     │                        │◀─── ReleaseInventory ─────────────────────── │
     │                        │  (inventory restored)                        │── OrderFailed ──▶ notification
```

---

## Features

### Distributed systems
- **Saga choreography** — services coordinate via events, no central orchestrator
- **Transactional outbox** — events committed atomically with business data, no dual-write risk
- **Idempotent consumers** — `processed_events` table deduplicates at-least-once Kafka delivery
- **State machine guards** — `WHERE status='PENDING'` on every state transition, safe under replay
- **SAVEPOINT-based rollbacks** — asyncpg nested transactions roll back partial inventory without losing the processed-event claim
- **Dead-letter topic** — poison messages after max retries go to `*.dlq` for inspection
- **Stripe idempotency** — `idempotency_key=event_id` makes Stripe calls retry-safe
- **Webhook backstop** — if payment-service crashes after the Stripe call, Stripe's own webhook retries recover the order

### Observability
- **Standardized health** — `/health` + `/health/details` (dependency rollup, version, uptime) on every service
- **Prometheus metrics** — HTTP, Kafka, and business metrics at `/metrics` on every service
- **Structured JSON logging** — single-line logs carrying request/correlation/saga/order ids
- **Correlation IDs** — propagated across HTTP headers and Kafka events end-to-end
- **Grafana dashboards** — System Overview, Orders, Payments, Kafka, Service Health (auto-provisioned)
- **In-app Operations console** — live system health, KPI cards, event feed, and event explorer

### Product
- User registration and login with JWT auth
- Product catalog with live stock levels
- Shopping cart → Stripe Elements checkout
- Real-time order detail page with saga timeline (polls until terminal state)
- Email notifications on confirmation and failure via Resend
- Admin dashboard: order counts, recent orders, outbox lag

---

## Tech stack

| Layer | Technology |
|---|---|
| **API** | FastAPI, asyncpg, pydantic-settings |
| **Messaging** | Apache Kafka (KRaft, no Zookeeper), aiokafka |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (python-jose), bcrypt |
| **Payments** | Stripe PaymentIntents API, Stripe CLI |
| **Email** | Resend |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS 3 |
| **Stripe UI** | Stripe Elements (CardElement) |
| **Metrics** | Prometheus client, Grafana |
| **Load test** | k6 |
| **Infra** | Docker Compose |

---

## Distributed systems concepts explained

### Why Kafka instead of direct HTTP calls between services?

If inventory-service called payment-service over HTTP, a crash in payment-service would propagate directly back to the user. With Kafka, inventory-service publishes an event and moves on. Payment-service processes it when it's available. This decouples availability: any service can restart without the others knowing or caring.

### What is the transactional outbox pattern and why does it matter?

Without it, you'd do two separate writes: update the database, then publish to Kafka. If the service crashes between those two steps, the database change persists but the Kafka event is lost — downstream services never hear about it, and the order silently gets stuck.

The outbox pattern writes both the business data and the event to PostgreSQL in the same transaction. A background poller reads unpublished rows and pushes them to Kafka, then marks them published. The database commit is the source of truth. If the poller crashes, it just re-reads unpublished rows on restart.

### What is saga choreography and how does rollback work?

A saga is a sequence of local transactions across multiple services, coordinated by events. In choreography (no orchestrator), each service listens for events and publishes its own.

When payment fails, payment-service publishes `PaymentFailed`. Order-service hears it and publishes `ReleaseInventory`. Inventory-service hears that and adds the stock back. Each step is local and independent. If any step fails, Kafka's retry mechanism re-delivers the event until it succeeds.

### How does idempotency work at scale?

Kafka guarantees at-least-once delivery, meaning a message can be delivered more than once (on consumer restart, partition rebalance, etc.). Every consumer inserts `(event_id, consumer_name)` into `processed_events` with `ON CONFLICT DO NOTHING` before doing any work. If the same event arrives twice, the second insert is a no-op and the handler returns immediately. The state machine (`WHERE status='PENDING'`) is a second layer: even if dedup somehow failed, processing a CONFIRMED order as PENDING would update zero rows.

### Why asyncpg SAVEPOINTs for inventory?

Inventory-service needs to: (1) claim the event in `processed_events`, (2) try to reserve stock, (3) if stock is insufficient, roll back the reservation but still write `InventoryFailed` to the outbox. These are contradictory requirements for a single transaction.

The solution is asyncpg nested transactions, which PostgreSQL implements as SAVEPOINTs. The outer transaction holds the event claim and outbox write. An inner transaction attempts the inventory updates. If it fails, only the inner transaction (SAVEPOINT) rolls back — the outer transaction stays alive and commits the failure event.

---

## Stripe checkout demo

### Option A — Simulated payment (no keys needed)

```bash
# 1. Start infrastructure and all backend services (see Local Setup below)

# 2. Start the frontend
cd frontend && npm run dev
```

Go to `http://localhost:5173` → **Register** → **Products** → add items → **Checkout →** → click **Place Order (simulated)** → the Order Detail page polls every 2 seconds until the saga completes and the status changes to **CONFIRMED** or **FAILED**.

### Option B — Real Stripe card form

**Step 1: Get Stripe test keys**

Sign up at [stripe.com](https://stripe.com) (free, no real card needed).
Go to Dashboard → Developers → API keys → copy the **Secret key** (`sk_test_...`) and **Publishable key** (`pk_test_...`).

**Step 2: Configure environment**

```bash
# backend .env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...    # from Step 4 below

# frontend/.env  (create this file)
VITE_STRIPE_PUBLIC_KEY=pk_test_...
```

**Step 3: Install Stripe CLI and forward webhooks**

```bash
# Install: https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:8006/webhooks/stripe
# Copy the webhook signing secret printed above into STRIPE_WEBHOOK_SECRET in .env
```

**Step 4: Start all services**

```bash
make order       # restart to pick up new .env
make payment     # restart to pick up STRIPE_SECRET_KEY
make webhook     # stripe-webhook-service on :8006
cd frontend && npm run dev
```

**Step 5: Place a Stripe order**

1. Go to `http://localhost:5173` → **Register** → **Products** → add items
2. Click **Checkout →**
3. The Stripe card form appears (powered by Stripe Elements)
4. Enter test card: **4242 4242 4242 4242** · any future date · any 3-digit CVC
5. Click **Pay $X.XX**
6. Stripe confirms the charge → order-service receives the event via Kafka → status → **CONFIRMED** in ~2 seconds
7. Order Detail shows the **Payment** section with the real Stripe PaymentIntent ID

**What success looks like:** Order Detail page shows a green CONFIRMED badge, the saga timeline shows all four steps completed, and the Payment section at the bottom shows the Stripe provider and a `pi_3...` PaymentIntent ID.

**What failure looks like (inject a decline):** Set `PAYMENT_FAILURE_RATE=1.0` in `.env` and restart payment-service. Place a new order. The saga timeline will show Payment Failed and Order Failed in red, and inventory will be automatically released.

### Test cards

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | Always succeeds |
| `4000 0000 0000 9995` | Always declines — insufficient funds |

---

## Local Development

### Prerequisites

- Docker Desktop
- Python 3.11+
- Node.js 18+
- (Optional) Stripe CLI for webhook forwarding

### First-time setup

Run once to create the Python environment, install dependencies, and configure env vars:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env        # edit as needed

cd frontend; npm install; cd ..
```

### Start the platform

Once setup is complete, the entire stack can be started with a single command:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\dev.ps1
```

This command automatically:

- Starts **PostgreSQL, Redis, and Kafka** via Docker Compose
- Opens separate terminals for all **backend services and workers**
- Starts the **React frontend**
- Boots the entire **FlowCommerce development environment**

When it finishes, the app is available at **http://localhost:5173** and each service exposes a `/health` endpoint (auth `:8004`, catalog `:8005`, order `:8000`, inventory `:8001`, payment `:8002`, notification `:8003`, webhook `:8006`).

> PostgreSQL schema and seed data load automatically from `init.sql` on first start.

### Stop infrastructure

```powershell
.\scripts\stop.ps1
```

This command:

- Stops the **PostgreSQL, Redis, and Kafka** containers
- Removes the Docker network
- Leaves service terminals open so logs can still be inspected

> Press `Ctrl + C` in each spawned terminal (or close them) to completely shut down all backend services and the frontend.

### Verify end-to-end (CLI)

```powershell
python scripts\smoke_test.py
# Registers a fresh user, places an order, polls until CONFIRMED or FAILED.
# Works without Stripe keys — uses the simulated payment path.
```

### Manual startup (alternative)

Prefer to run services individually? Start infrastructure, then launch each service in its own terminal:

```powershell
docker compose up -d            # Kafka (KRaft), PostgreSQL, Redis

make auth           # auth-service          :8004
make catalog        # catalog-service       :8005
make order          # order-service         :8000
make inventory      # inventory-service     :8001
make payment        # payment-service       :8002
make notification   # notification-service  :8003
make webhook        # stripe-webhook-service :8006  (optional, Stripe only)

cd frontend; npm run dev        # → http://localhost:5173
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `KAFKA_BOOTSTRAP` | `localhost:9092` | Kafka broker address |
| `POSTGRES_DSN` | `postgresql://postgres:postgres@localhost:5432/orders` | Database connection |
| `JWT_SECRET` | `change-me-in-production` | JWT signing secret |
| `PAYMENT_FAILURE_RATE` | `0.2` | Fraction of payments that simulate failure (0.0–1.0) |
| `STRIPE_SECRET_KEY` | _(empty)_ | Enables real Stripe charges when set |
| `STRIPE_WEBHOOK_SECRET` | _(empty)_ | Enables webhook signature verification |
| `RESEND_API_KEY` | _(empty)_ | Enables transactional email when set |
| `VITE_STRIPE_PUBLIC_KEY` | _(empty)_ | Shows Stripe Elements in the frontend when set |

---

## Screenshots

### Sign in
A split-screen console: email/password on the left, brand statement and the platform's capabilities on the right.

![FlowCommerce AI sign-in screen](docs/screenshots/login.png)

### Products
Catalog grid with per-product stock levels and a cart-aware checkout control that stays disabled until at least one item is added.

![Products catalog page](docs/screenshots/products.png)

### Order Detail — Confirmed
Live saga timeline (Order Placed → Inventory Reserved → Payment Processed → Order Confirmed), itemized totals, and a Payment panel showing the real Stripe PaymentIntent ID and PAID status.

![Order detail with confirmed saga timeline](docs/screenshots/order-detail-confirmed.png)

### Still to capture

| Screen | Description |
|---|---|
| `docs/screenshots/checkout-stripe.png` | Checkout page with Stripe Elements card form |
| `docs/screenshots/order-failed.png` | Order Detail — FAILED status with rollback steps |
| `docs/screenshots/admin.png` | Admin dashboard with order counts and outbox lag |
| `docs/screenshots/operations.png` | Operations console — system health, KPI cards, event explorer |
| `docs/screenshots/grafana.png` | Grafana dashboard — throughput, p95 latency, payment success rate |

---

## Design decisions

### Choreography saga vs. orchestrator

I chose choreography (services react to each other's events) over an orchestrator (a central service that tells each service what to do). The tradeoff: choreography is harder to trace end-to-end but more resilient — there is no single coordinator that can fail and block the whole pipeline. For an order platform where availability matters more than strict sequential control, this is the right call.

The cost of choreography is visibility: you cannot look at one place and see the full state of a saga. I address this with correlation IDs threaded through every event, and the order-service acting as the state machine that aggregates outcomes.

### Transactional outbox over direct Kafka publish

Publishing to Kafka directly from a route handler creates a window where the database write commits but the Kafka publish fails (network blip, broker restart). The order is created but no downstream service ever sees it.

The outbox pattern closes this window. Events are written to the `outbox` table in the same PostgreSQL transaction as the business data. A background poller reads unpublished rows and pushes them to Kafka. The worst case is duplicate delivery (the poller crashes after publishing but before marking the row published) — which is handled by idempotent consumers.

### Idempotent consumers over exactly-once delivery

Kafka's exactly-once delivery (`enable.idempotence=true` + transactions) adds complexity and coordinator overhead. Instead, every consumer inserts into `processed_events` with `ON CONFLICT DO NOTHING` before processing. This is simpler, works across any consumer implementation, and pairs naturally with state-machine guards (`WHERE status='PENDING'`) as a second safety layer.

### asyncpg nested transactions (SAVEPOINTs) for inventory rollback

The inventory-service must atomically claim a Kafka event, attempt to reserve stock across multiple SKUs, and — if any SKU is out of stock — roll back the partial reservation while still writing `InventoryFailed` to the outbox. These are contradictory within a single flat transaction.

PostgreSQL SAVEPOINTs solve this cleanly. asyncpg automatically promotes nested `async with conn.transaction():` calls to SAVEPOINTs. The inner SAVEPOINT holds the inventory updates; if it rolls back, the outer transaction (event claim + outbox write) remains intact and commits.

### Stripe idempotency key = Kafka event_id

If payment-service crashes after the Stripe API call succeeds but before the outbox write commits, the Kafka event will be re-delivered and payment-service will call Stripe again. Using `event_id` as the Stripe idempotency key means the second call returns the same PaymentIntent (already charged) rather than charging the card twice. This is the most important correctness property in the payment flow.

### Webhook service as reliability backstop

Payment-service writes to the outbox synchronously in the same transaction that claims the Kafka event. In the common case, the webhook from Stripe arrives after the order is already CONFIRMED. If payment-service crashes in the narrow window between the Stripe call and the DB commit, Stripe retries the webhook to stripe-webhook-service, which publishes the event directly to Kafka. Order-service's `WHERE status='PENDING'` guard makes this duplicate safe.

---

## Promoting a user to admin (local development)

Admin access is controlled by the `is_admin` column on the `users` table. New registrations always default to `false`. To promote your account:

```sql
-- Connect to the local Postgres container:
docker exec -it <postgres-container-name> psql -U postgres -d orders

-- Find your user:
SELECT user_id, email, is_admin FROM users;

-- Promote by email:
UPDATE users SET is_admin = true WHERE email = 'you@example.com';
```

Then **sign out and sign back in** — the JWT must be re-issued to carry the new `is_admin: true` claim. After that, the Admin link appears in the sidebar and `/admin/stats` is accessible.

Non-admin users who navigate directly to `/admin` are redirected to `/products`. The backend returns `403 Forbidden` for any non-admin JWT hitting `/admin/stats`, so the route is doubly guarded.

## Results

> _Run the k6 load test and fill in these numbers:_

```bash
make load   # k6 run load_tests/order_load_test.js
```

| Metric | Result |
|---|---|
| Throughput | TODO orders/sec |
| p50 latency (order → confirmed) | TODO ms |
| p95 latency | TODO ms |
| p99 latency | TODO ms |
| Orders lost under 20% payment failure | TODO (expect 0) |
| Duplicate orders under replay | TODO (expect 0) |
| Max consumers tested | TODO |

---

## Observability

Production-grade monitoring is built in: standardized health endpoints,
Prometheus metrics, structured JSON logs with correlation IDs, a Grafana
dashboard suite, and an in-app Operations console.

### Health endpoints

Every service exposes two endpoints on its own port:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Fast liveness probe — `{"service": "...", "status": "healthy"}` |
| `GET /health/details` | Dependency rollup, version, and uptime |

```jsonc
// GET /health/details
{
  "service": "order-service",
  "status": "healthy",
  "version": "1.0.0",
  "dependencies": { "postgres": "healthy", "redis": "healthy", "kafka": "healthy" },
  "uptime_seconds": 12345
}
```

The HTTP services (auth :8004, catalog :8005, order :8000, webhook :8006) serve
these on their main port. The consumer services (inventory :8001, payment :8002,
notification :8003) run a small side server (`shared/ops_server.py`) exposing the
same endpoints, so every service is uniform.

### Metrics

Every service exposes Prometheus metrics at `GET /metrics`:

| Metric | Type | Labels |
|---|---|---|
| `op_http_requests_total` | counter | service, method, path, status |
| `op_http_request_duration_seconds` | histogram | service, method, path |
| `op_http_errors_total` | counter | service, method, path |
| `op_kafka_events_published_total` | counter | service, topic |
| `op_kafka_events_consumed_total` | counter | service, topic, status |
| `op_orders_created_total` / `op_orders_confirmed_total` / `op_orders_failed_total` | counter | service (+reason) |
| `op_payments_succeeded_total` / `op_payments_failed_total` | counter | service, provider |
| `op_stripe_request_duration_seconds` | histogram | — |
| `op_inventory_reservations_total` | counter | service, result |
| `op_email_notifications_sent_total` | counter | service, type, result |
| `op_order_e2e_seconds` | histogram | — |

### Structured logging & correlation IDs

All logs are single-line JSON (`shared/logging_config.py`). HTTP middleware
assigns a `request_id` and `correlation_id` per request; the Kafka consumer binds
`correlation_id` / `saga_id` / `order_id` from each event. Every log line in a
request or event handler automatically carries those ids:

```json
{"timestamp":"2026-06-22T15:04:33-0400","service":"payment-service","level":"INFO",
 "correlation_id":"a467af7b…","saga_id":"a467af7b…","order_id":"5654ee60…",
 "event":"PaymentProcessed","message":"Stripe payment OK for order 5654ee60…"}
```

Correlation IDs propagate across HTTP (`X-Correlation-ID` request/response
headers) and Kafka (every `Event` carries `correlation_id` + `saga_id`).

### Prometheus + Grafana

```bash
docker compose -f docker-compose.observability.yml up -d
# Prometheus → http://localhost:9090
# Grafana    → http://localhost:3000   (anonymous admin; dashboards auto-provisioned)
```

Prometheus scrapes all seven services every 5s (`observability/prometheus.yml`,
via `host.docker.internal`). Five dashboards are auto-provisioned:

| Dashboard | Panels |
|---|---|
| **System Overview** | requests/sec, error rate, avg latency, targets up, order pipeline, e2e latency p50/p95 |
| **Orders** | created/confirmed/failed, success rate, saga failures by reason, inventory reservations |
| **Payments** | success/failure totals, success rate, outcomes by provider, Stripe latency p50/p95 |
| **Kafka / Events** | events published/consumed per sec, by topic/service, dead-lettered events |
| **Service Health** | per-service up/down timeline, request rate, 5xx rate, latency p95 |

### Operations console (in-app)

Admins get an **Operations** page in the app (dark, Grafana-style, auto-refreshes
every 5s) backed by three admin-only order-service endpoints — no Prometheus
required to use it:

- **System Health** — live 🟢/🟡/🔴 status per service + dependency chips (`/admin/system-health` aggregates every service's `/health/details` server-side)
- **Metrics** — Orders Today, Success Rate, Failed Orders, Payment Success Rate, Events Processed, Avg Processing Time (`/admin/metrics-summary`)
- **Recent Events** — live event feed from the outbox (`/admin/events`)
- **Event Explorer** — click any event to inspect its `correlation_id`, `saga_id`, timestamps, and full payload

---

## Project structure

```
order-platform/
├── auth_service/          JWT registration and login
├── catalog_service/       Product listing with stock levels
├── order_service/         HTTP API + saga state machine + outbox poller
├── inventory_service/     Stock reservation with SAVEPOINT rollback
├── payment_service/       Stripe PaymentIntent + simulated fallback
├── notification_service/  Resend transactional email
├── stripe_webhook_service/ Stripe webhook receiver (reliability backstop)
├── shared/
│   ├── auth.py            JWT creation and FastAPI dependency
│   ├── db.py              asyncpg connection pool
│   ├── events.py          Pydantic event models and Kafka topic enum
│   ├── kafka_utils.py     Producer, consumer, retry + DLQ logic
│   ├── outbox.py          Outbox writer and background poller
│   └── settings.py        pydantic-settings config with .env support
├── frontend/              React 18 + TypeScript + Tailwind + Stripe Elements
├── scripts/smoke_test.py  End-to-end CLI test
├── load_tests/            k6 load test script
├── init.sql               PostgreSQL schema + seed data
├── docker-compose.yml     Kafka + PostgreSQL + Redis
└── Makefile               One-command service launcher
```
