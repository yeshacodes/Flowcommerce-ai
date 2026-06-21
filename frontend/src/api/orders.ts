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

  adminStats: () =>
    apiFetch<AdminStats>(SERVICES.orders, '/admin/stats'),
}
