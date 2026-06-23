/**
 * Static mock data for the public demo experience (/demo/*).
 *
 * This module is intentionally self-contained: demo pages render exclusively
 * from these constants and never call the backend or require auth, so the demo
 * can be deployed publicly (e.g. Vercel) with no services running. Types are
 * imported (type-only) from the real API clients so the demo stays shape-
 * compatible with the live app without importing any request logic.
 */
import type { Product } from '../api/catalog'
import type {
  MetricsSummary,
  OpsEvent,
  Order,
  SystemHealth,
} from '../api/orders'

// ── Products ────────────────────────────────────────────────────────────────
export const demoProducts: Product[] = [
  { sku: 'SKU-HEADPHONES', name: 'Headphones', description: 'Noise-cancelling headphones', price_cents: 24900, stock_available: 473, is_active: true },
  { sku: 'SKU-LAPTOP', name: 'Laptop', description: 'High-performance laptop', price_cents: 99900, stock_available: 72, is_active: true },
  { sku: 'SKU-PHONE', name: 'Phone', description: 'Latest smartphone', price_cents: 69900, stock_available: 233, is_active: true },
  { sku: 'SKU-KEYBOARD', name: 'Mechanical Keyboard', description: 'Hot-swappable mechanical keyboard', price_cents: 14900, stock_available: 118, is_active: true },
  { sku: 'SKU-MONITOR', name: 'Monitor', description: '27" 4K display', price_cents: 32900, stock_available: 54, is_active: true },
]

const priceOf = (sku: string) => demoProducts.find(p => p.sku === sku)?.price_cents ?? 0

// ── Orders ──────────────────────────────────────────────────────────────────
// One confirmed, one pending, one failed-payment order. Order detail data is
// the same shape the real /orders/:id endpoint returns.
export const demoOrders: Order[] = [
  {
    order_id: 'd1f0c2a4-confirmed-4a1b-9f3c-aa1122334455',
    status: 'CONFIRMED',
    total_cents: priceOf('SKU-HEADPHONES') * 1 + priceOf('SKU-KEYBOARD') * 1,
    created_at: '2026-06-22T14:58:10.000Z',
    updated_at: '2026-06-22T14:58:12.310Z',
    payment_provider: 'stripe',
    payment_intent_id: 'pi_3TkrkDCxwCItCdmJ0Ng2nMvo',
    items: [
      { sku: 'SKU-HEADPHONES', quantity: 1, unit_price_cents: priceOf('SKU-HEADPHONES') },
      { sku: 'SKU-KEYBOARD', quantity: 1, unit_price_cents: priceOf('SKU-KEYBOARD') },
    ],
  },
  {
    order_id: 'a7b9e3d1-pending-4c22-8e10-bb2233445566',
    status: 'PENDING',
    total_cents: priceOf('SKU-PHONE') * 1,
    created_at: '2026-06-22T15:03:48.000Z',
    updated_at: '2026-06-22T15:03:48.000Z',
    payment_provider: 'stripe',
    payment_intent_id: 'pi_3Tl9ZQCxwCItCdmJ1aB2cD3e',
    items: [
      { sku: 'SKU-PHONE', quantity: 1, unit_price_cents: priceOf('SKU-PHONE') },
    ],
  },
  {
    order_id: 'f4c8a012-failed-4d33-9a20-cc3344556677',
    status: 'FAILED',
    total_cents: priceOf('SKU-LAPTOP') * 1,
    created_at: '2026-06-22T13:41:02.000Z',
    updated_at: '2026-06-22T13:41:04.870Z',
    payment_provider: 'stripe',
    payment_intent_id: 'pi_3Tk0pLCxwCItCdmJ9zY8xW7v',
    items: [
      { sku: 'SKU-LAPTOP', quantity: 1, unit_price_cents: priceOf('SKU-LAPTOP') },
    ],
  },
]

export const findDemoOrder = (id: string): Order | undefined =>
  demoOrders.find(o => o.order_id === id)

// Reason shown on the failed order's timeline / payment panel.
export const demoFailureReasons: Record<string, string> = {
  'f4c8a012-failed-4d33-9a20-cc3344556677': 'card_declined',
}

// ── Operations: system health ────────────────────────────────────────────────
const svc = (service: string, deps: Record<string, string>, uptime: number) => ({
  service,
  status: 'healthy' as const,
  version: '1.0.0',
  dependencies: deps,
  uptime_seconds: uptime,
})

export const demoSystemHealth: SystemHealth = {
  overall: 'healthy',
  services: [
    svc('auth-service', { postgres: 'healthy' }, 86120),
    svc('catalog-service', { postgres: 'healthy' }, 86118),
    svc('order-service', { postgres: 'healthy', redis: 'healthy', kafka: 'healthy' }, 86095),
    svc('inventory-service', { postgres: 'healthy', kafka: 'healthy' }, 86090),
    svc('payment-service', { postgres: 'healthy', kafka: 'healthy' }, 86088),
    svc('notification-service', { kafka: 'healthy' }, 86085),
    svc('stripe-webhook-service', { kafka: 'healthy' }, 86080),
  ],
}

// ── Operations: metric cards ─────────────────────────────────────────────────
export const demoMetrics: MetricsSummary = {
  orders_today: 18,
  confirmed_today: 16,
  failed_today: 2,
  pending: 1,
  success_rate: 96,
  payment_success_rate: 98,
  events_processed: 214,
  avg_processing_ms: 2310, // renders as "2.31 s"
}

// ── Operations: recent events / event explorer ───────────────────────────────
export const demoEvents: OpsEvent[] = [
  {
    id: 5,
    topic: 'order.confirmed',
    type: 'OrderConfirmed',
    order_id: 'd1f0c2a4-confirmed-4a1b-9f3c-aa1122334455',
    correlation_id: 'corr-9f3c-aa11-22334455',
    saga_id: 'corr-9f3c-aa11-22334455',
    event_id: 'evt-5a1b-confirmed-0001',
    occurred_at: '2026-06-22T14:58:12.310Z',
    created_at: '2026-06-22T14:58:12.311Z',
    published_at: '2026-06-22T14:58:12.402Z',
    payload: {
      type: 'OrderConfirmed',
      order_id: 'd1f0c2a4-confirmed-4a1b-9f3c-aa1122334455',
      correlation_id: 'corr-9f3c-aa11-22334455',
      saga_id: 'corr-9f3c-aa11-22334455',
      data: { customer_email: 'demo@flowcommerce.ai', total_cents: 39800, status: 'CONFIRMED' },
    },
  },
  {
    id: 4,
    topic: 'payment.completed',
    type: 'PaymentCompleted',
    order_id: 'd1f0c2a4-confirmed-4a1b-9f3c-aa1122334455',
    correlation_id: 'corr-9f3c-aa11-22334455',
    saga_id: 'corr-9f3c-aa11-22334455',
    event_id: 'evt-4d2c-payment-0001',
    occurred_at: '2026-06-22T14:58:12.180Z',
    created_at: '2026-06-22T14:58:12.181Z',
    published_at: '2026-06-22T14:58:12.255Z',
    payload: {
      type: 'PaymentCompleted',
      order_id: 'd1f0c2a4-confirmed-4a1b-9f3c-aa1122334455',
      correlation_id: 'corr-9f3c-aa11-22334455',
      saga_id: 'corr-9f3c-aa11-22334455',
      data: { provider: 'stripe', payment_intent_id: 'pi_3TkrkDCxwCItCdmJ0Ng2nMvo' },
    },
  },
  {
    id: 3,
    topic: 'inventory.reserved',
    type: 'InventoryReserved',
    order_id: 'd1f0c2a4-confirmed-4a1b-9f3c-aa1122334455',
    correlation_id: 'corr-9f3c-aa11-22334455',
    saga_id: 'corr-9f3c-aa11-22334455',
    event_id: 'evt-3b1a-inventory-0001',
    occurred_at: '2026-06-22T14:58:11.040Z',
    created_at: '2026-06-22T14:58:11.041Z',
    published_at: '2026-06-22T14:58:11.120Z',
    payload: {
      type: 'InventoryReserved',
      order_id: 'd1f0c2a4-confirmed-4a1b-9f3c-aa1122334455',
      correlation_id: 'corr-9f3c-aa11-22334455',
      saga_id: 'corr-9f3c-aa11-22334455',
      data: { items: [{ sku: 'SKU-HEADPHONES', quantity: 1 }, { sku: 'SKU-KEYBOARD', quantity: 1 }], total_cents: 39800 },
    },
  },
  {
    id: 2,
    topic: 'order.created',
    type: 'OrderCreated',
    order_id: 'd1f0c2a4-confirmed-4a1b-9f3c-aa1122334455',
    correlation_id: 'corr-9f3c-aa11-22334455',
    saga_id: 'corr-9f3c-aa11-22334455',
    event_id: 'evt-2a09-created-0001',
    occurred_at: '2026-06-22T14:58:10.000Z',
    created_at: '2026-06-22T14:58:10.002Z',
    published_at: '2026-06-22T14:58:10.060Z',
    payload: {
      type: 'OrderCreated',
      order_id: 'd1f0c2a4-confirmed-4a1b-9f3c-aa1122334455',
      correlation_id: 'corr-9f3c-aa11-22334455',
      saga_id: 'corr-9f3c-aa11-22334455',
      data: { total_cents: 39800, items: [{ sku: 'SKU-HEADPHONES', quantity: 1 }, { sku: 'SKU-KEYBOARD', quantity: 1 }] },
    },
  },
  {
    id: 1,
    topic: 'payment.failed',
    type: 'PaymentFailed',
    order_id: 'f4c8a012-failed-4d33-9a20-cc3344556677',
    correlation_id: 'corr-9a20-cc33-44556677',
    saga_id: 'corr-9a20-cc33-44556677',
    event_id: 'evt-1f08-payment-fail',
    occurred_at: '2026-06-22T13:41:04.870Z',
    created_at: '2026-06-22T13:41:04.871Z',
    published_at: '2026-06-22T13:41:04.940Z',
    payload: {
      type: 'PaymentFailed',
      order_id: 'f4c8a012-failed-4d33-9a20-cc3344556677',
      correlation_id: 'corr-9a20-cc33-44556677',
      saga_id: 'corr-9a20-cc33-44556677',
      data: { provider: 'stripe', reason: 'card_declined' },
    },
  },
]

export const GITHUB_URL = 'https://github.com/yeshabhavsar/flowcommerce-ai'
