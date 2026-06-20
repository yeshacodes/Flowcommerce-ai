import asyncio
import json
import logging

from .events import Event, Topics
from .kafka_utils import publish

log = logging.getLogger(__name__)


async def write_outbox(conn, topic: Topics, event: Event) -> None:
    """Insert an event into the outbox within an existing DB transaction.

    Must be called while conn has an active transaction so the outbox write
    and the business-data change are committed atomically.
    """
    await conn.execute(
        "INSERT INTO outbox(topic, key, payload) VALUES($1, $2, $3::jsonb)",
        str(topic),
        event.order_id,
        json.dumps(event.model_dump()),
    )


async def run_outbox_poller(pool, producer, interval: float = 1.0) -> None:
    """Background loop: drain unpublished outbox rows into Kafka.

    Uses SELECT FOR UPDATE SKIP LOCKED so multiple service instances never
    double-publish the same row. Marks each row published_at after a
    successful send; if the process crashes after send but before the UPDATE
    commits, the row is re-sent on restart — consumers dedupe by event_id so
    duplicate delivery is harmless.
    """
    while True:
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    rows = await conn.fetch(
                        "SELECT id, topic, key, payload FROM outbox "
                        "WHERE published_at IS NULL "
                        "ORDER BY id "
                        "LIMIT 100 "
                        "FOR UPDATE SKIP LOCKED"
                    )
                    for row in rows:
                        event = Event(**json.loads(row["payload"]))
                        await publish(producer, Topics(row["topic"]), event)
                        await conn.execute(
                            "UPDATE outbox SET published_at = now() WHERE id = $1",
                            row["id"],
                        )
                        log.debug("outbox published id=%s topic=%s", row["id"], row["topic"])
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("outbox poller error")
        await asyncio.sleep(interval)
