import asyncio
import logging
from uuid import UUID

from shared.db import affected, get_pool
from shared.events import Event, Topics
from shared.kafka_utils import get_producer, run_consumer
from shared.metrics import EVENTS, serve_metrics
from shared.outbox import run_outbox_poller, write_outbox

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("inventory-service")

SERVICE = "inventory-service"


class _ReservationFailed(Exception):
    """Raised inside a savepoint to roll back partial inventory updates."""


async def main():
    producer = await get_producer()
    pool = await get_pool()
    serve_metrics(8001)

    async def handle(event: Event, topic: str) -> None:
        if topic == Topics.ORDER_CREATED.value:
            items = event.data.get("items", [])

            async with pool.acquire() as conn:
                async with conn.transaction():  # outer tx: claim + outbox
                    claimed = await conn.fetchval(
                        "INSERT INTO processed_events(event_id, consumer) VALUES($1,$2) "
                        "ON CONFLICT DO NOTHING RETURNING event_id",
                        UUID(event.event_id),
                        SERVICE,
                    )
                    if claimed is None:
                        return

                    # Inner tx becomes a SAVEPOINT in asyncpg. If reservation fails,
                    # only the inventory updates roll back; the outer tx (claim + outbox)
                    # stays alive and commits the failure event instead.
                    reserved = True
                    try:
                        async with conn.transaction():
                            for it in items:
                                res = await conn.execute(
                                    "UPDATE inventory "
                                    "SET available=available-$2, reserved=reserved+$2, version=version+1 "
                                    "WHERE sku=$1 AND available>=$2",
                                    it["sku"],
                                    int(it["quantity"]),
                                )
                                if affected(res) == 0:
                                    reserved = False
                                    raise _ReservationFailed()
                    except _ReservationFailed:
                        pass  # savepoint rolled back; outer transaction still active

                    if reserved:
                        await write_outbox(
                            conn,
                            Topics.INVENTORY_RESERVED,
                            Event(
                                correlation_id=event.correlation_id,
                                order_id=event.order_id,
                                type="InventoryReserved",
                                data={"items": items},
                            ),
                        )
                        EVENTS.labels(SERVICE, "InventoryReserved", "ok").inc()
                        log.info("reserved inventory for order %s", event.order_id)
                    else:
                        await write_outbox(
                            conn,
                            Topics.INVENTORY_FAILED,
                            Event(
                                correlation_id=event.correlation_id,
                                order_id=event.order_id,
                                type="InventoryFailed",
                                data={"reason": "insufficient_stock"},
                            ),
                        )
                        EVENTS.labels(SERVICE, "InventoryFailed", "ok").inc()
                        log.info("insufficient stock for order %s", event.order_id)

        elif topic == Topics.RELEASE_INVENTORY.value:
            items = event.data.get("items", [])
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
                    for it in items:
                        await conn.execute(
                            "UPDATE inventory SET available=available+$2, reserved=reserved-$2 WHERE sku=$1",
                            it["sku"],
                            int(it["quantity"]),
                        )
            EVENTS.labels(SERVICE, "InventoryReleased", "ok").inc()
            log.info("released inventory for order %s", event.order_id)

    outbox_task = asyncio.create_task(run_outbox_poller(pool, producer))
    try:
        await run_consumer([Topics.ORDER_CREATED, Topics.RELEASE_INVENTORY], SERVICE, handle)
    finally:
        outbox_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
