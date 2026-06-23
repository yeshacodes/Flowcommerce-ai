# Deployment Guide

Production topology:

| Component | Provider |
|---|---|
| Web services + workers | **Render** |
| PostgreSQL | **Neon** |
| Redis | **Upstash** |
| Kafka | **Confluent Cloud** |
| Payments | **Stripe** |
| Email | **Resend** |
| Frontend | **Vercel** |

All connection details are environment variables — see [`.env.production.example`](.env.production.example). Never commit real secrets.

---

## 1. Neon (PostgreSQL)

1. Create a project at [neon.tech](https://neon.tech); create a database named `orders`.
2. Copy the **pooled** connection string and append `?sslmode=require`:
   ```
   postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/orders?sslmode=require
   ```
3. Apply the schema once (it does **not** run automatically in prod):
   ```bash
   psql "postgresql://...sslmode=require" -f init.sql
   ```
4. Use this value for `POSTGRES_DSN` on every service that needs the DB
   (auth, catalog, order, inventory, payment).

> Service startup runs idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
> migrations, but assumes the tables already exist — so step 3 is required.

---

## 2. Upstash (Redis)

1. Create a database at [upstash.com](https://upstash.com) (Redis, TLS enabled).
2. Copy the **`rediss://`** URL → set `REDIS_URL` on **order-service**.

> Redis currently backs only health checks; it is optional but recommended.

---

## 3. Confluent Cloud (Kafka)

1. Create a cluster at [confluent.cloud](https://confluent.cloud).
2. **Create the topics** (auto-create is off in Confluent):
   `order.created`, `inventory.reserved`, `inventory.failed`,
   `payment.completed`, `payment.failed`, `order.confirmed`, `order.failed`,
   `inventory.release`, `dlq`
3. Create an **API key/secret** for the cluster.
4. Set on every service that talks to Kafka (order, webhook, inventory, payment, notification):
   ```
   KAFKA_BOOTSTRAP=pkc-xxxxx.REGION.aws.confluent.cloud:9092
   KAFKA_SECURITY_PROTOCOL=SASL_SSL
   KAFKA_SASL_MECHANISM=PLAIN
   KAFKA_USERNAME=<API key>
   KAFKA_PASSWORD=<API secret>
   ```

> Locally these are unset → clients use `PLAINTEXT` against the Docker broker.

---

## 4. Render (services + workers)

Deploy via the included [`render.yaml`](render.yaml) blueprint
(**New → Blueprint**), or create each service manually:

| Service | Type | Start command |
|---|---|---|
| flowcommerce-auth | Web | `uvicorn auth_service.main:app --host 0.0.0.0 --port $PORT` |
| flowcommerce-catalog | Web | `uvicorn catalog_service.main:app --host 0.0.0.0 --port $PORT` |
| flowcommerce-order | Web | `uvicorn order_service.main:app --host 0.0.0.0 --port $PORT` |
| flowcommerce-webhook | Web | `uvicorn stripe_webhook_service.main:app --host 0.0.0.0 --port $PORT` |
| flowcommerce-inventory | Worker | `python -m inventory_service.main` |
| flowcommerce-payment | Worker | `python -m payment_service.main` |
| flowcommerce-notification | Worker | `python -m notification_service.main` |

Build command for all: `pip install -r requirements.txt`. Web services use health check path `/health`.

**Critical env rules**
- `JWT_SECRET` must be **identical** on all services.
- Set the `*_SERVICE_URL` vars on **order-service** to the deployed Render URLs
  (used by `/admin/system-health` and the AI copilot).
- Set `FRONTEND_ORIGIN` (web services) to your Vercel URL for CORS.

Deploy order: workers and auth/catalog first, then order (it references the
others' URLs), then webhook.

---

## 5. Stripe webhook

1. After **flowcommerce-webhook** is live, copy its URL.
2. Stripe Dashboard → Developers → Webhooks → **Add endpoint**:
   `https://flowcommerce-webhook.onrender.com/webhooks/stripe`
3. Subscribe to `payment_intent.succeeded` and `payment_intent.payment_failed`.
4. Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` on the webhook service.
5. Set `STRIPE_SECRET_KEY` on **order-service** and **payment-service**.

---

## 6. Resend (email)

1. Create an API key at [resend.com](https://resend.com) and verify your sending domain.
2. Set on **notification-service**: `RESEND_API_KEY`, `FROM_EMAIL=orders@yourdomain.com`.

> If `RESEND_API_KEY` is unset the service logs notifications instead of sending — safe for staging.

---

## 7. Vercel (frontend)

Project → Settings → Environment Variables:

```
VITE_AUTH_URL=https://flowcommerce-auth.onrender.com
VITE_CATALOG_URL=https://flowcommerce-catalog.onrender.com
VITE_ORDERS_URL=https://flowcommerce-order.onrender.com
VITE_STRIPE_PUBLIC_KEY=pk_live_or_test_xxx
```

`VITE_*` vars are baked at **build time** — redeploy after changing them.
Then ensure `FRONTEND_ORIGIN` on the backend matches the Vercel domain exactly.

---

## Post-deploy smoke check

```bash
curl https://flowcommerce-auth.onrender.com/health
curl https://flowcommerce-order.onrender.com/health/details   # dependency rollup
```

`/health/details` shows `postgres` / `redis` / `kafka` status per service —
use it to confirm every managed connection is wired correctly.
