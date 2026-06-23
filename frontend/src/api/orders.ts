import { apiFetch, SERVICES } from './client'

export interface OrderItem {
  sku: string
  quantity: number
  unit_price_cents?: number
}

export interface Order {
  order_id: string
  status: 'PENDING' | 'CONFIRMED' | 'FAILED'
  total_cents: number
  created_at: string
  updated_at?: string
  items?: OrderItem[]
  payment_intent_id?: string | null
  payment_provider?: string
  correlation_id?: string | null
}

export interface OrderListResponse {
  total: number
  limit: number
  offset: number
  orders: Order[]
}

export interface AdminStats {
  order_counts: Record<string, number>
  recent_orders: (Order & { customer_id: string })[]
  outbox: { pending: number; published_last_hour: number }
}

export interface PaymentIntentResponse {
  client_secret: string | null
  total_cents: number
}

export interface ServiceHealth {
  service: string
  status: 'healthy' | 'degraded' | 'down'
  version?: string
  dependencies?: Record<string, string>
  uptime_seconds?: number
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'down'
  services: ServiceHealth[]
}

export interface MetricsSummary {
  orders_today: number
  confirmed_today: number
  failed_today: number
  pending: number
  success_rate: number
  payment_success_rate: number
  events_processed: number
  avg_processing_ms: number | null  // saga latency (OrderCreated → OrderConfirmed), in ms
}

export interface OpsEvent {
  id: number
  topic: string
  order_id: string | null
  correlation_id: string | null
  saga_id: string | null
  event_id: string | null
  type: string | null
  occurred_at: string | null
  created_at: string
  published_at: string | null
  payload: Record<string, unknown>
}

export const ordersApi = {
  createPaymentIntent: (items: OrderItem[]) =>
    apiFetch<PaymentIntentResponse>(SERVICES.orders, '/orders/payment-intent', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  create: (items: OrderItem[], paymentIntentId?: string) =>
    apiFetch<Order>(SERVICES.orders, '/orders', {
      method: 'POST',
      body: JSON.stringify({
        items,
        ...(paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
      }),
    }),

  list: (limit = 20, offset = 0) =>
    apiFetch<OrderListResponse>(SERVICES.orders, `/orders?limit=${limit}&offset=${offset}`),

  get: (orderId: string) =>
    apiFetch<Order>(SERVICES.orders, `/orders/${orderId}`),

  context: (orderId: string) =>
    apiFetch<import('../types/customerCopilot').CustomerOrderContext>(SERVICES.orders, `/orders/${orderId}/context`),

  adminStats: () =>
    apiFetch<AdminStats>(SERVICES.orders, '/admin/stats'),

  systemHealth: () =>
    apiFetch<SystemHealth>(SERVICES.orders, '/admin/system-health'),

  metricsSummary: () =>
    apiFetch<MetricsSummary>(SERVICES.orders, '/admin/metrics-summary'),

  recentEvents: (limit = 50) =>
    apiFetch<{ events: OpsEvent[] }>(SERVICES.orders, `/admin/events?limit=${limit}`),
}
