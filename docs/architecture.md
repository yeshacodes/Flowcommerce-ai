# Architecture

## Service flow (happy path + compensation)

```mermaid
sequenceDiagram
    participant C as Client
    participant O as Order API
    participant I as Inventory
    participant P as Payment
    participant N as Notification

    C->>O: POST /orders
    O-->>C: 202 Accepted (order_id, PENDING)
    O->>I: OrderCreated
    I->>P: InventoryReserved
    P->>O: PaymentCompleted
    O->>N: OrderConfirmed
    Note over P,O: On PaymentFailed/InventoryFailed,<br/>Order publishes ReleaseInventory (saga rollback)
```

## Topics
order.created, inventory.reserved, inventory.failed, payment.completed, payment.failed,
order.confirmed, order.failed, inventory.release, dlq

## Design notes to write up in the README
- Saga (choreography) vs two-phase commit, and why saga here.
- At-least-once delivery + idempotency (dedupe by event_id).
- Retry with backoff + dead-letter queue for poison messages.
- Partitioning by order_id for per-order ordering.
