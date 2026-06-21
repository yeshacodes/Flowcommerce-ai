"""
Stripe Webhook Service — port 8006

Receives payment_intent.succeeded and payment_intent.payment_failed events from
Stripe and publishes the corresponding PaymentCompleted / PaymentFailed events
directly into Kafka, where the existing order-service saga consumer picks them up.

This service is the production reliability backstop: in Stripe mode,
payment_service already writes to the outbox synchronously, so the order
typically settles before any webhook arrives. If payment_service crashes between
the Stripe API call and the outbox write, this service publishes the event
instead. order_service's state machine is idempotent — the second event is a
no-op.

Local webhook forwarding (Stripe CLI):
    stripe listen --forward-to localhost:8006/webhooks/stripe
"""
import logging
from contextlib import asynccontextmanager

import stripe
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from shared.events import Event, Topics
from shared.kafka_utils import get_producer, publish
from shared.settings import settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("stripe-webhook-service")

producer = None


def _attr(obj, key, default=None):
    """Read a field from either a stripe StripeObject (attribute access) or a plain dict.

    stripe-python 12+ rewrote StripeObject so it no longer extends dict — .get()
    was removed. Using getattr covers the verified path; dict.get() covers the
    dev/no-secret path where we json.loads the raw payload ourselves.
    """
    if isinstance(obj, dict):
        val = obj.get(key)
    else:
        val = getattr(obj, key, None)
    return val if val is not None else default


@asynccontextmanager
async def lifespan(app: FastAPI):
    global producer
    producer = await get_producer()
    if not settings.stripe_webhook_secret:
        log.warning("STRIPE_WEBHOOK_SECRET not set — signature verification will be skipped")
    log.info("stripe-webhook-service started")
    yield
    await producer.stop()


app = FastAPI(title="Stripe Webhook Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/stripe", status_code=200)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(alias="stripe-signature", default=""),
):
    payload = await request.body()

    # Verify signature when a secret is configured (always true in production)
    if settings.stripe_webhook_secret:
        try:
            webhook_event = stripe.Webhook.construct_event(
                payload, stripe_signature, settings.stripe_webhook_secret
            )
        except stripe.SignatureVerificationError:
            log.warning("Stripe webhook signature verification failed")
            raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    else:
        import json
        webhook_event = json.loads(payload)

    event_type: str = _attr(webhook_event, "type", "")
    data_obj = _attr(webhook_event, "data", {})
    pi = _attr(data_obj, "object", {})

    log.info("webhook received: type=%s", event_type)

    # Only process PaymentIntent events that carry our order metadata
    metadata = _attr(pi, "metadata") or {}
    order_id = _attr(metadata, "order_id")
    correlation_id = _attr(metadata, "correlation_id")

    if not order_id or not correlation_id:
        log.info("webhook %s has no order metadata — skipping", event_type)
        return {"status": "skipped", "reason": "no_order_metadata"}

    if event_type == "payment_intent.succeeded":
        await publish(
            producer,
            Topics.PAYMENT_COMPLETED,
            Event(
                correlation_id=correlation_id,
                order_id=order_id,
                type="PaymentCompleted",
            ),
        )
        log.info("webhook → PaymentCompleted for order %s", order_id)

    elif event_type == "payment_intent.payment_failed":
        err = _attr(pi, "last_payment_error") or {}
        reason = _attr(err, "code") or "card_declined"
        await publish(
            producer,
            Topics.PAYMENT_FAILED,
            Event(
                correlation_id=correlation_id,
                order_id=order_id,
                type="PaymentFailed",
                data={"reason": reason},
            ),
        )
        log.info("webhook → PaymentFailed for order %s (reason=%s)", order_id, reason)

    else:
        log.debug("ignoring unhandled Stripe event type: %s", event_type)

    return {"status": "ok"}
