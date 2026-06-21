import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel

from shared.auth import TokenData, get_current_user
from shared.db import get_pool
from shared.events import Event, Topics
from shared.kafka_utils import get_producer, run_consumer
from shared.metrics import EVENTS, ORDER_LATENCY
from shared.outbox import run_outbox_poller, write_outbox
from shared.settings import settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("order-service")

SERVICE = "order-service"
producer = None
consumer_task = None
outbox_task = None

_stripe_enabled = bool(settings.stripe_secret_key)
if _stripe_enabled:
    import stripe as _stripe
    _stripe.api_key = settings.stripe_secret_key


class OrderItem(BaseModel):
    sku: str
    quantity: int


class OrderRequest(BaseModel):
    items: list[OrderItem]
    payment_intent_id: str | None = None  # set by frontend after Stripe payment confirmed


class PaymentIntentRequest(BaseModel):
    items: list[OrderItem]


async def handle_event(event: Event, topic: str) -> None:
    pool = await get_pool()
    created_at = None

    async with pool.acquire() as conn:
        async with conn.transaction():
            claimed = await conn.fetchval(
                "INSERT INTO processed_events(event_id, consumer) VALUES($1,$2) "
                "ON CONFLICT DO NOTHING RETURNING event_id",
                UUID(event.event_id),
                SERVICE,
            )
            if claimed is None:
                return

            if topic == Topics.PAYMENT_COMPLETED.value:
                row = await conn.fetchrow(
                    "UPDATE orders SET status='CONFIRMED', updated_at=now() "
                    "WHERE order_id=$1 AND status='PENDING' "
                    "RETURNING created_at, customer_id, total_cents",
                    UUID(event.order_id),
                )
                if row:
                    created_at = row["created_at"]
                    user_row = await conn.fetchrow(
                        "SELECT email FROM users WHERE customer_id=$1", row["customer_id"]
                    )
                    await write_outbox(
                        conn,
                        Topics.ORDER_CONFIRMED,
                        Event(
                            correlation_id=event.correlation_id,
                            order_id=event.order_id,
                            type="OrderConfirmed",
                            data={
                                "customer_id": row["customer_id"],
                                "customer_email": user_row["email"] if user_row else None,
                                "total_cents": row["total_cents"],
                                "status": "CONFIRMED",
                            },
                        ),
                    )
                    EVENTS.labels(SERVICE, "OrderConfirmed", "ok").inc()

            elif topic == Topics.PAYMENT_FAILED.value:
                row = await conn.fetchrow(
                    "UPDATE orders SET status='FAILED', updated_at=now() "
                    "WHERE order_id=$1 AND status='PENDING' "
                    "RETURNING created_at, customer_id, total_cents",
                    UUID(event.order_id),
                )
                if row:
                    user_row = await conn.fetchrow(
                        "SELECT email FROM users WHERE customer_id=$1", row["customer_id"]
                    )
                    items = [
                        dict(r)
                        for r in await conn.fetch(
                            "SELECT sku, quantity FROM order_items WHERE order_id=$1",
                            UUID(event.order_id),
                        )
                    ]
                    await write_outbox(
                        conn,
                        Topics.RELEASE_INVENTORY,
                        Event(
                            correlation_id=event.correlation_id,
                            order_id=event.order_id,
                            type="ReleaseInventory",
                            data={"items": items},
                        ),
                    )
                    await write_outbox(
                        conn,
                        Topics.ORDER_FAILED,
                        Event(
                            correlation_id=event.correlation_id,
                            order_id=event.order_id,
                            type="OrderFailed",
                            data={
                                "reason": event.data.get("reason", "payment_failed"),
                                "customer_id": row["customer_id"],
                                "customer_email": user_row["email"] if user_row else None,
                                "total_cents": row["total_cents"],
                                "status": "FAILED",
                            },
                        ),
                    )
                    EVENTS.labels(SERVICE, "OrderFailed", "ok").inc()

            elif topic == Topics.INVENTORY_FAILED.value:
                row = await conn.fetchrow(
                    "UPDATE orders SET status='FAILED', updated_at=now() "
                    "WHERE order_id=$1 AND status='PENDING' "
                    "RETURNING created_at, customer_id, total_cents",
                    UUID(event.order_id),
                )
                if row:
                    user_row = await conn.fetchrow(
                        "SELECT email FROM users WHERE customer_id=$1", row["customer_id"]
                    )
                    await write_outbox(
                        conn,
                        Topics.ORDER_FAILED,
                        Event(
                            correlation_id=event.correlation_id,
                            order_id=event.order_id,
                            type="OrderFailed",
                            data={
                                "reason": event.data.get("reason", "inventory_failed"),
                                "customer_id": row["customer_id"],
                                "customer_email": user_row["email"] if user_row else None,
                                "total_cents": row["total_cents"],
                                "status": "FAILED",
                            },
                        ),
                    )
                    EVENTS.labels(SERVICE, "OrderFailed", "ok").inc()

            else:
                return

    if created_at:
        ORDER_LATENCY.observe((datetime.now(timezone.utc) - created_at).total_seconds())


@asynccontextmanager
async def lifespan(app: FastAPI):
    global producer, consumer_task, outbox_task
    pool = await get_pool()

    # Idempotent migration: add columns introduced after initial schema deployment.
    # init.sql only runs on Postgres first-start; existing volumes miss these columns.
    async with pool.acquire() as conn:
        await conn.execute(
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_id TEXT"
        )
        await conn.execute(
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS "
            "payment_provider TEXT NOT NULL DEFAULT 'simulated'"
        )
    log.info("schema migration: payment columns ensured")

    producer = await get_producer()
    outbox_task = asyncio.create_task(run_outbox_poller(pool, producer))
    consumer_task = asyncio.create_task(
        run_consumer(
            [Topics.PAYMENT_COMPLETED, Topics.PAYMENT_FAILED, Topics.INVENTORY_FAILED],
            "order-service",
            handle_event,
        )
    )
    log.info("order-service started")
    yield
    consumer_task.cancel()
    outbox_task.cancel()
    await producer.stop()


app = FastAPI(title="Order Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Returning a JSONResponse here keeps the response inside ExceptionMiddleware,
    # which is inside CORSMiddleware — so CORS headers are present even on 500s.
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/orders/payment-intent")
async def create_payment_intent(
    req: PaymentIntentRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Called by the frontend checkout page before showing the Stripe card form.
    Computes the order total, creates a Stripe PaymentIntent, and returns the
    client_secret the browser needs to call stripe.confirmCardPayment().

    If STRIPE_SECRET_KEY is not configured, returns client_secret=null so the
    frontend can fall back to the simulated payment path.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        skus = [it.sku for it in req.items]
        product_rows = await conn.fetch(
            "SELECT sku, price_cents FROM products WHERE sku = ANY($1::text[])", skus
        )
        price_map = {r["sku"]: r["price_cents"] for r in product_rows}
        missing = [s for s in skus if s not in price_map]
        if missing:
            raise HTTPException(status_code=422, detail=f"Unknown SKUs: {missing}")
        total_cents = sum(price_map[it.sku] * it.quantity for it in req.items)

    if not _stripe_enabled:
        log.info("payment-intent: Stripe not configured, returning null client_secret")
        return {"client_secret": None, "total_cents": total_cents}

    loop = asyncio.get_running_loop()
    pi = await loop.run_in_executor(
        None,
        lambda: _stripe.PaymentIntent.create(
            amount=max(total_cents, 50),
            currency="usd",
            metadata={
                "customer_id": current_user.customer_id,
                "customer_email": current_user.email,
            },
        ),
    )
    log.info(
        "payment-intent created: pi=%s amount=%d customer=%s",
        pi.id, max(total_cents, 50), current_user.customer_id,
    )
    return {"client_secret": pi.client_secret, "total_cents": total_cents}


@app.post("/orders", status_code=202)
async def create_order(
    req: OrderRequest,
    current_user: TokenData = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if idempotency_key:
            existing = await conn.fetchval(
                "SELECT order_id FROM orders WHERE idempotency_key=$1 AND customer_id=$2",
                idempotency_key,
                current_user.customer_id,
            )
            if existing:
                return {"order_id": str(existing), "status": "PENDING", "idempotent": True}

        skus = [it.sku for it in req.items]
        product_rows = await conn.fetch(
            "SELECT sku, price_cents FROM products WHERE sku = ANY($1::text[])", skus
        )
        price_map = {r["sku"]: r["price_cents"] for r in product_rows}

        missing = [s for s in skus if s not in price_map]
        if missing:
            raise HTTPException(status_code=422, detail=f"Unknown SKUs: {missing}")

        total_cents = sum(price_map[it.sku] * it.quantity for it in req.items)
        order_id = uuid4()
        correlation_id = uuid4()
        payment_provider = "stripe" if req.payment_intent_id else "simulated"

        event = Event(
            correlation_id=str(correlation_id),
            order_id=str(order_id),
            type="OrderCreated",
            data={
                "customer_id": current_user.customer_id,
                "customer_email": current_user.email,
                "total_cents": total_cents,
                "items": [i.model_dump() for i in req.items],
                "payment_intent_id": req.payment_intent_id,  # None for smoke test / simulated path
            },
        )

        async with conn.transaction():
            await conn.execute(
                "INSERT INTO orders(order_id, customer_id, status, idempotency_key, "
                "correlation_id, total_cents, payment_intent_id, payment_provider) "
                "VALUES($1,$2,'PENDING',$3,$4,$5,$6,$7)",
                order_id,
                current_user.customer_id,
                idempotency_key,
                correlation_id,
                total_cents,
                req.payment_intent_id,
                payment_provider,
            )
            for it in req.items:
                await conn.execute(
                    "INSERT INTO order_items(order_id, sku, quantity, unit_price_cents) VALUES($1,$2,$3,$4)",
                    order_id,
                    it.sku,
                    it.quantity,
                    price_map[it.sku],
                )
            await write_outbox(conn, Topics.ORDER_CREATED, event)

    EVENTS.labels(SERVICE, "OrderCreated", "ok").inc()
    log.info(
        "created order %s for customer %s provider=%s",
        order_id, current_user.customer_id, payment_provider,
    )
    return {"order_id": str(order_id), "status": "PENDING", "total_cents": total_cents}


@app.get("/orders")
async def list_orders(
    current_user: TokenData = Depends(get_current_user),
    limit: int = 20,
    offset: int = 0,
):
    if limit > 100:
        limit = 100
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT order_id, status, total_cents, created_at, updated_at "
            "FROM orders WHERE customer_id=$1 "
            "ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            current_user.customer_id,
            limit,
            offset,
        )
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM orders WHERE customer_id=$1", current_user.customer_id
        )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "orders": [
            {
                "order_id": str(r["order_id"]),
                "status": r["status"],
                "total_cents": r["total_cents"],
                "created_at": r["created_at"].isoformat(),
                "updated_at": r["updated_at"].isoformat(),
            }
            for r in rows
        ],
    }


@app.get("/orders/{order_id}")
async def get_order(order_id: str, current_user: TokenData = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, total_cents, created_at, updated_at, customer_id, "
            "payment_intent_id, payment_provider "
            "FROM orders WHERE order_id=$1",
            UUID(order_id),
        )
        if not row:
            return Response(status_code=404)
        if row["customer_id"] != current_user.customer_id:
            return Response(status_code=404)
        items = await conn.fetch(
            "SELECT sku, quantity, unit_price_cents FROM order_items WHERE order_id=$1",
            UUID(order_id),
        )
    return {
        "order_id": order_id,
        "status": row["status"],
        "total_cents": row["total_cents"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "items": [dict(i) for i in items],
        "payment_intent_id": row["payment_intent_id"],
        "payment_provider": row["payment_provider"] or "simulated",
    }


@app.get("/admin/stats")
async def admin_stats(_: TokenData = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        status_rows = await conn.fetch(
            "SELECT status, COUNT(*) AS count FROM orders GROUP BY status"
        )
        recent_rows = await conn.fetch(
            "SELECT order_id, customer_id, status, total_cents, created_at "
            "FROM orders ORDER BY created_at DESC LIMIT 20"
        )
        outbox_pending = await conn.fetchval(
            "SELECT COUNT(*) FROM outbox WHERE published_at IS NULL"
        )
        outbox_last_hour = await conn.fetchval(
            "SELECT COUNT(*) FROM outbox WHERE published_at > now() - interval '1 hour'"
        )
    return {
        "order_counts": {r["status"]: r["count"] for r in status_rows},
        "recent_orders": [
            {
                "order_id": str(r["order_id"]),
                "customer_id": r["customer_id"],
                "status": r["status"],
                "total_cents": r["total_cents"],
                "created_at": r["created_at"].isoformat(),
            }
            for r in recent_rows
        ],
        "outbox": {
            "pending": outbox_pending,
            "published_last_hour": outbox_last_hour,
        },
    }
