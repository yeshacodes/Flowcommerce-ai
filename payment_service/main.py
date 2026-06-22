import asyncio
import logging
import random
from uuid import UUID

from shared.events import Event, Topics
from shared.kafka_utils import get_producer, publish, run_consumer
from shared.logging_config import configure_logging
from shared.metrics import (
    EVENTS,
    PAYMENTS_FAILED,
    PAYMENTS_SUCCEEDED,
    STRIPE_LATENCY,
)
from shared.ops_server import serve_ops
from shared.settings import settings

SERVICE = "payment-service"
configure_logging(SERVICE)
log = logging.getLogger(SERVICE)

_use_stripe = bool(settings.stripe_secret_key)

if _use_stripe:
    import stripe
    from shared.db import get_pool
    from shared.outbox import run_outbox_poller, write_outbox

    stripe.api_key = settings.stripe_secret_key
    log.info("Stripe payment mode enabled")
else:
    log.info("Stripe key not set — using simulated payment (PAYMENT_FAILURE_RATE=%.0f%%)",
             settings.payment_failure_rate * 100)


async def _handle_stripe(event: Event, pool, producer) -> None:
    """
    Handle payment in Stripe mode. Two sub-paths:

    1. Frontend checkout path: payment_intent_id is present in the event data.
       The user already confirmed the PaymentIntent via Stripe.js. We just
       retrieve it from Stripe and check its status — no new charge is created.

    2. Saga/smoke-test path: no payment_intent_id. We create and confirm a new
       PaymentIntent with a test payment method. PAYMENT_FAILURE_RATE controls
       which test card is used so the rollback path remains exercisable.
    """
    payment_intent_id = event.data.get("payment_intent_id")
    total_cents = int(event.data.get("total_cents", 0))
    charge_cents = max(total_cents, 50)  # Stripe minimum is 50 cents

    success = False
    reason = "card_declined"
    loop = asyncio.get_running_loop()

    if payment_intent_id:
        # Frontend already confirmed — retrieve and check status only
        log.info("Stripe PaymentIntent retrieve: order=%s pi=%s", event.order_id, payment_intent_id)
        try:
            pi = await loop.run_in_executor(
                None, lambda: stripe.PaymentIntent.retrieve(payment_intent_id)
            )
            success = pi.status == "succeeded"
            if success:
                log.info("PaymentIntent already succeeded: order=%s pi=%s", event.order_id, pi.id)
            else:
                err = getattr(pi, "last_payment_error", None)
                reason = getattr(err, "code", "card_declined") or "card_declined"
                log.info(
                    "PaymentIntent not succeeded: order=%s pi=%s status=%s reason=%s",
                    event.order_id, pi.id, pi.status, reason,
                )
        except stripe.StripeError:
            log.exception("Stripe retrieve failed for order %s — will retry", event.order_id)
            raise
    else:
        # Saga path: create and confirm a new PaymentIntent with a test card
        pm = (
            "pm_card_chargeDeclined"
            if random.random() < settings.payment_failure_rate
            else "pm_card_visa"
        )
        log.info(
            "Stripe PaymentIntent creating: order=%s amount=%d cents pm=%s",
            event.order_id, charge_cents, pm,
        )
        try:
            with STRIPE_LATENCY.time():
                pi = await loop.run_in_executor(
                    None,
                    lambda: stripe.PaymentIntent.create(
                        amount=charge_cents,
                        currency="usd",
                        payment_method=pm,
                        payment_method_types=["card"],
                        confirm=True,
                        metadata={
                            "order_id": event.order_id,
                            "correlation_id": event.correlation_id,
                        },
                        idempotency_key=event.event_id,
                    ),
                )
            success = pi.status == "succeeded"
            if success:
                log.info(
                    "Stripe PaymentIntent succeeded: order=%s pi=%s amount=%d cents",
                    event.order_id, pi.id, charge_cents,
                )
            else:
                err = getattr(pi, "last_payment_error", None)
                reason = getattr(err, "code", "card_declined") or "card_declined"
                log.info(
                    "Stripe PaymentIntent declined: order=%s pi=%s reason=%s",
                    event.order_id, pi.id, reason,
                )
        except stripe.CardError as e:
            reason = e.code or "card_declined"
            log.info("Stripe CardError for order %s: code=%s", event.order_id, reason)
        except stripe.StripeError:
            log.exception("Stripe API error for order %s — will retry", event.order_id)
            raise

    async with pool.acquire() as conn:
        async with conn.transaction():
            claimed = await conn.fetchval(
                "INSERT INTO processed_events(event_id, consumer) VALUES($1,$2) "
                "ON CONFLICT DO NOTHING RETURNING event_id",
                UUID(event.event_id),
                SERVICE,
            )
            if claimed is None:
                return   # duplicate delivery — already processed

            if success:
                await write_outbox(
                    conn,
                    Topics.PAYMENT_COMPLETED,
                    Event(
                        correlation_id=event.correlation_id,
                        order_id=event.order_id,
                        type="PaymentCompleted",
                    ),
                )
                EVENTS.labels(SERVICE, "PaymentCompleted", "ok").inc()
                PAYMENTS_SUCCEEDED.labels(SERVICE, "stripe").inc()
                log.info("Stripe payment OK for order %s", event.order_id, extra={"event": "PaymentProcessed"})
            else:
                await write_outbox(
                    conn,
                    Topics.PAYMENT_FAILED,
                    Event(
                        correlation_id=event.correlation_id,
                        order_id=event.order_id,
                        type="PaymentFailed",
                        data={"reason": reason},
                    ),
                )
                EVENTS.labels(SERVICE, "PaymentFailed", "ok").inc()
                PAYMENTS_FAILED.labels(SERVICE, "stripe").inc()
                log.info("Stripe payment DECLINED for order %s (reason=%s)", event.order_id, reason, extra={"event": "PaymentFailed"})


async def _handle_fake(event: Event, producer) -> None:
    """Original simulated payment — used when STRIPE_SECRET_KEY is not set."""
    failed = random.random() < settings.payment_failure_rate
    if failed:
        await publish(
            producer,
            Topics.PAYMENT_FAILED,
            Event(
                correlation_id=event.correlation_id,
                order_id=event.order_id,
                type="PaymentFailed",
                data={"reason": "card_declined"},
            ),
        )
        EVENTS.labels(SERVICE, "PaymentFailed", "ok").inc()
        PAYMENTS_FAILED.labels(SERVICE, "simulated").inc()
        log.info("payment DECLINED (simulated) for order %s", event.order_id, extra={"event": "PaymentFailed"})
    else:
        await publish(
            producer,
            Topics.PAYMENT_COMPLETED,
            Event(
                correlation_id=event.correlation_id,
                order_id=event.order_id,
                type="PaymentCompleted",
            ),
        )
        EVENTS.labels(SERVICE, "PaymentCompleted", "ok").inc()
        PAYMENTS_SUCCEEDED.labels(SERVICE, "simulated").inc()
        log.info("payment OK (simulated) for order %s", event.order_id, extra={"event": "PaymentProcessed"})


async def main():
    producer = await get_producer()
    await serve_ops(SERVICE, 8002, deps=["postgres", "kafka"])

    if _use_stripe:
        pool = await get_pool()
        outbox_task = asyncio.create_task(run_outbox_poller(pool, producer))
    else:
        pool = None
        outbox_task = None

    async def handle(event: Event, topic: str) -> None:
        if topic == Topics.INVENTORY_RESERVED.value:
            if _use_stripe:
                await _handle_stripe(event, pool, producer)
            else:
                await _handle_fake(event, producer)

    try:
        await run_consumer([Topics.INVENTORY_RESERVED], SERVICE, handle)
    finally:
        if outbox_task:
            outbox_task.cancel()
        await producer.stop()


if __name__ == "__main__":
    asyncio.run(main())
