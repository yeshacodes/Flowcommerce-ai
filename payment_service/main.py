import asyncio
import logging
import random

from shared.events import Event, Topics
from shared.kafka_utils import get_producer, publish, run_consumer
from shared.metrics import EVENTS, serve_metrics
from shared.settings import settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("payment-service")

SERVICE = "payment-service"


async def main():
    producer = await get_producer()
    serve_metrics(8002)

    async def handle(event: Event, topic: str) -> None:
        if topic == Topics.INVENTORY_RESERVED.value:
            # Simulated charge. The configurable failure rate is what exercises the
            # saga rollback path (inventory gets released, order ends FAILED).
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
                log.info("payment DECLINED for order %s", event.order_id)
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
                log.info("payment OK for order %s", event.order_id)

    await run_consumer([Topics.INVENTORY_RESERVED], SERVICE, handle)


if __name__ == "__main__":
    asyncio.run(main())
