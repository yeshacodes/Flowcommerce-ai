-- Schema for the order platform. Loaded automatically by Postgres on first start.
CREATE TABLE IF NOT EXISTS orders (
    order_id          UUID PRIMARY KEY,
    customer_id       TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | CONFIRMED | FAILED
    idempotency_key   TEXT UNIQUE,
    correlation_id    UUID,
    total_cents       INT,
    payment_intent_id TEXT,                             -- Stripe PaymentIntent id (null for simulated)
    payment_provider  TEXT NOT NULL DEFAULT 'simulated',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Migrate existing installations that pre-date these columns.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider  TEXT NOT NULL DEFAULT 'simulated';

CREATE TABLE IF NOT EXISTS order_items (
    id                BIGSERIAL PRIMARY KEY,
    order_id          UUID REFERENCES orders(order_id),
    sku               TEXT NOT NULL,
    quantity          INT NOT NULL,
    unit_price_cents  INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory (
    sku        TEXT PRIMARY KEY,
    available  INT NOT NULL,
    reserved   INT NOT NULL DEFAULT 0,
    version    INT NOT NULL DEFAULT 0   -- for optimistic locking
);

CREATE TABLE IF NOT EXISTS users (
    user_id         TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    is_admin        BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Migrate existing installations that pre-date the is_admin column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS products (
    sku         TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed products matching the existing inventory SKUs
INSERT INTO products (sku, name, description, price_cents) VALUES
    ('SKU-LAPTOP',     'Laptop',     'High-performance laptop',          99900),
    ('SKU-PHONE',      'Phone',      'Latest smartphone',                69900),
    ('SKU-HEADPHONES', 'Headphones', 'Noise-cancelling headphones',      24900)
ON CONFLICT (sku) DO NOTHING;

-- Transactional outbox: events are written here atomically with business data,
-- then a background poller publishes them to Kafka. Eliminates the crash window
-- between DB commit and Kafka publish.
CREATE TABLE IF NOT EXISTS outbox (
    id           BIGSERIAL PRIMARY KEY,
    topic        TEXT NOT NULL,
    key          TEXT NOT NULL,          -- order_id, used as Kafka partition key
    payload      JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ             -- NULL = pending, non-NULL = done
);

-- Partial index so the poller query only scans unpublished rows.
CREATE INDEX IF NOT EXISTS outbox_unpublished ON outbox(id) WHERE published_at IS NULL;

-- Dedupe table for idempotent consumers (alternative to Redis).
CREATE TABLE IF NOT EXISTS processed_events (
    event_id     UUID NOT NULL,
    consumer     TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);

-- Seed some stock to test against.
INSERT INTO inventory (sku, available) VALUES
    ('SKU-LAPTOP', 100),
    ('SKU-PHONE', 250),
    ('SKU-HEADPHONES', 500)
ON CONFLICT (sku) DO NOTHING;
