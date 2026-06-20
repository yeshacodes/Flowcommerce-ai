import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from .events import Event, Topics
from .settings import settings

log = logging.getLogger(__name__)


async def get_producer() -> AIOKafkaProducer:
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap,
        value_serializer=lambda v: json.dumps(v).encode(),
        key_serializer=lambda k: k.encode() if isinstance(k, str) else k,
    )
    await producer.start()
    return producer


async def publish(producer: AIOKafkaProducer, topic, event: Event) -> None:
    # Key by order_id so all events for one order land on the same partition (ordering).
    await producer.send_and_wait(str(topic), event.model_dump(), key=event.order_id)


async def run_consumer(topics, group_id, handler):
    """Subscribe to topics, dispatch each message to handler(event, topic).

    Reliability: on a handler exception we retry with exponential backoff up to
    settings.max_retries, then route the message to the dead-letter topic and move on.
    Manual commit means an event is only acknowledged after it is handled or dead-lettered.
    """
    consumer = AIOKafkaConsumer(
        *[str(t) for t in topics],
        bootstrap_servers=settings.kafka_bootstrap,
        group_id=group_id,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
        value_deserializer=lambda b: json.loads(b.decode()),
    )
    dlq = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap,
        value_serializer=lambda v: json.dumps(v).encode(),
    )
    await consumer.start()
    await dlq.start()
    log.info("[%s] subscribed to %s", group_id, [str(t) for t in topics])
    try:
        async for msg in consumer:
            event = Event(**msg.value)
            attempt = 0
            while True:
                try:
                    await handler(event, msg.topic)
                    break
                except Exception:
                    attempt += 1
                    log.exception("[%s] handler error on %s (attempt %d)", group_id, event.event_id, attempt)
                    if attempt > settings.max_retries:
                        await dlq.send_and_wait(
                            str(Topics.DLQ),
                            {
                                "original_topic": msg.topic,
                                "group": group_id,
                                "attempts": attempt,
                                "event": msg.value,
                            },
                        )
                        log.error("[%s] routed %s to DLQ after %d attempts", group_id, event.event_id, attempt)
                        break
                    # exponential backoff (scaled small for local dev)
                    await asyncio.sleep(min(2 ** attempt, 30) * 0.1)
            await consumer.commit()
    finally:
        await consumer.stop()
        await dlq.stop()
