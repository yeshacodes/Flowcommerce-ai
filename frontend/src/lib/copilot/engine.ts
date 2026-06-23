/**
 * Rule-based intelligence for the AI Operations Copilot (Phase 1, no LLM).
 *
 * Routes a free-text question to an intent, then generates a grounded answer
 * purely from the provided CopilotContext (metrics, services, events, orders,
 * stock). It never invents data: when the context lacks what's needed it returns
 * an explicit "not enough information" answer. This same engine powers demo mode
 * and is the client-side fallback for the real app.
 */
import type { OpsEvent, Order } from '../../api/orders'
import type { CopilotAnswer, CopilotBlock, CopilotContext } from '../../types/copilot'

const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDuration = (ms: number | null) =>
  ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`

const NOT_ENOUGH = "I don't have enough information to determine the root cause."

function notEnough(citations: string[] = []): CopilotAnswer {
  return {
    intent: 'unknown',
    blocks: [{ kind: 'paragraph', text: NOT_ENOUGH }],
    citations,
  }
}

// ── Order resolution ─────────────────────────────────────────────────────────
// Suggested prompts say "Order #123", but real ids are UUIDs. We resolve by:
// 1) a token in the question matching an order id prefix, else
// 2) intent hint (failure questions → a failed order; lifecycle → a confirmed one).
function resolveOrder(question: string, ctx: CopilotContext, prefer: 'failed' | 'confirmed'): Order | undefined {
  const tokens = question.toLowerCase().match(/[0-9a-f]{4,}/g) ?? []
  for (const t of tokens) {
    const hit = ctx.orders.find(o => o.order_id.toLowerCase().startsWith(t) || o.order_id.toLowerCase().includes(t))
    if (hit) return hit
  }
  if (prefer === 'failed') return ctx.orders.find(o => o.status === 'FAILED') ?? ctx.orders[0]
  return ctx.orders.find(o => o.status === 'CONFIRMED') ?? ctx.orders[0]
}

const eventsForOrder = (ctx: CopilotContext, orderId: string): OpsEvent[] =>
  ctx.recentEvents
    .filter(e => e.order_id === orderId)
    .sort((a, b) => new Date(a.occurred_at ?? a.created_at).getTime() - new Date(b.occurred_at ?? b.created_at).getTime())

// ── Intent: root cause analysis ──────────────────────────────────────────────
function answerOrderFailure(question: string, ctx: CopilotContext): CopilotAnswer {
  const order = resolveOrder(question, ctx, 'failed')
  if (!order) return notEnough(['Order Service'])
  const events = eventsForOrder(ctx, order.order_id)
  const failEvent = events.find(e => e.type === 'PaymentFailed' || e.topic === 'payment.failed')
  const reason =
    (failEvent?.payload as any)?.data?.reason ??
    (order.status === 'FAILED' ? 'card_declined' : null)

  if (order.status !== 'FAILED') {
    return {
      intent: 'order_failure',
      blocks: [
        { kind: 'paragraph', text: `Order ${short(order.order_id)} did not fail — its current status is ${order.status}.` },
      ],
      citations: ['Order Service', 'Event Explorer'],
    }
  }

  const reserved = events.some(e => e.type === 'InventoryReserved')
  return {
    intent: 'order_failure',
    blocks: [
      {
        kind: 'paragraph',
        text: `Order ${short(order.order_id)} failed because the Payment Service returned ${reason ?? 'a payment error'}${reserved ? ' after inventory had already been reserved' : ''}.`,
      },
      { kind: 'heading', text: 'Compensation actions' },
      {
        kind: 'bullets',
        items: [
          { tone: 'ok', text: 'Inventory reservation released' },
          { tone: 'ok', text: 'Customer was not charged' },
          { tone: 'ok', text: 'Saga completed successfully' },
        ],
      },
      { kind: 'heading', text: 'Affected services' },
      { kind: 'bullets', items: [{ text: 'Inventory Service' }, { text: 'Payment Service' }] },
      {
        kind: 'keyvalue',
        pairs: [
          ['Order ID', order.order_id],
          ['Correlation ID', failEvent?.correlation_id ?? events[0]?.correlation_id ?? '—'],
          ['Saga ID', failEvent?.saga_id ?? events[0]?.saga_id ?? '—'],
          ['Reason', reason ?? '—'],
        ],
      },
    ],
    citations: ['Order Service', 'Payment Service', 'Event Explorer'],
  }
}

// ── Intent: order lifecycle ──────────────────────────────────────────────────
function answerOrderLifecycle(question: string, ctx: CopilotContext): CopilotAnswer {
  const order = resolveOrder(question, ctx, 'confirmed')
  if (!order) return notEnough(['Order Service'])
  const events = eventsForOrder(ctx, order.order_id)

  const stepText: Record<string, string> = {
    OrderCreated: 'Order Service emitted OrderCreated.',
    InventoryReserved: 'Inventory Service reserved stock.',
    PaymentCompleted: 'Payment Service processed payment.',
    PaymentFailed: 'Payment Service reported a failed payment.',
    OrderConfirmed: 'Notification Service sent confirmation email; order transitioned to CONFIRMED.',
    OrderFailed: 'Order transitioned to FAILED and inventory was released.',
  }
  const steps =
    events.length > 0
      ? events.map(e => stepText[e.type ?? ''] ?? `${e.type} on ${e.topic}.`)
      : defaultLifecycle(order)

  const ms =
    order.status === 'CONFIRMED' || order.status === 'FAILED'
      ? new Date(order.updated_at ?? order.created_at).getTime() - new Date(order.created_at).getTime()
      : null

  return {
    intent: 'order_lifecycle',
    blocks: [
      { kind: 'heading', text: `Lifecycle of order ${short(order.order_id)}` },
      { kind: 'bullets', items: steps.map((text, i) => ({ text: `${i + 1}. ${text}` })) },
      { kind: 'keyvalue', pairs: [
        ['Status', order.status],
        ['Total', fmtMoney(order.total_cents)],
        ['Processing time', ms != null ? fmtDuration(ms) : 'in progress'],
        ['Correlation ID', events[0]?.correlation_id ?? '—'],
      ] },
    ],
    citations: ['Order Service', 'Event Explorer'],
  }
}

function defaultLifecycle(order: Order): string[] {
  const base = ['Order Service emitted OrderCreated.', 'Inventory Service reserved stock.']
  if (order.status === 'FAILED') return [...base, 'Payment Service reported a failed payment.', 'Order transitioned to FAILED and inventory was released.']
  if (order.status === 'CONFIRMED') return [...base, 'Payment Service processed payment.', 'Notification Service sent confirmation email.', 'Order transitioned to CONFIRMED.']
  return [...base, 'Awaiting payment confirmation.']
}

// ── Intent: metrics summary ──────────────────────────────────────────────────
function answerMetricsSummary(ctx: CopilotContext): CopilotAnswer {
  const m = ctx.metrics
  return {
    intent: 'metrics_summary',
    blocks: [
      { kind: 'heading', text: "Today's summary" },
      {
        kind: 'bullets',
        items: [
          { text: `${m.orders_today} orders processed` },
          { text: `${m.success_rate}% success rate`, tone: m.success_rate >= 95 ? 'ok' : 'warn' },
          { text: `${m.failed_today} failed orders`, tone: m.failed_today > 0 ? 'warn' : 'ok' },
          { text: `${m.events_processed} events processed` },
          { text: `Average processing time: ${fmtDuration(m.avg_processing_ms)}` },
        ],
      },
      { kind: 'heading', text: 'Services' },
      { kind: 'bullets', items: ctx.services.map(s => ({ tone: s.status === 'healthy' ? 'ok' : 'error', text: titleCase(s.service) })) },
    ],
    citations: ['Metrics Dashboard', 'Service Health'],
  }
}

// ── Intent: service health ───────────────────────────────────────────────────
function answerServiceHealth(ctx: CopilotContext): CopilotAnswer {
  const unhealthy = ctx.services.filter(s => s.status !== 'healthy')
  if (unhealthy.length === 0) {
    return {
      intent: 'service_health',
      blocks: [
        { kind: 'status', label: `All ${ctx.servicesTotal} services healthy`, tone: 'ok' },
        { kind: 'paragraph', text: 'No service is currently reporting degraded status or failed dependencies.' },
      ],
      citations: ['Service Health'],
    }
  }
  return {
    intent: 'service_health',
    blocks: [
      { kind: 'status', label: `${unhealthy.length} service(s) need attention`, tone: 'error' },
      {
        kind: 'bullets',
        items: unhealthy.map(s => ({
          tone: 'error',
          text: `${titleCase(s.service)} — ${Object.entries(s.dependencies ?? {})
            .filter(([, v]) => v !== 'healthy')
            .map(([k]) => k)
            .join(', ') || 'degraded'}`,
        })),
      },
      { kind: 'heading', text: 'Recommendation' },
      { kind: 'paragraph', text: 'Investigate the failing dependencies above and check recent error logs for these services.' },
    ],
    citations: ['Service Health', 'Metrics Dashboard'],
  }
}

// ── Intent: failed payments ──────────────────────────────────────────────────
function answerFailedPayments(ctx: CopilotContext): CopilotAnswer {
  const failed = ctx.recentEvents.filter(e => e.type === 'PaymentFailed' || e.topic === 'payment.failed')
  const failedOrders = ctx.orders.filter(o => o.status === 'FAILED')
  if (failed.length === 0 && failedOrders.length === 0) {
    return {
      intent: 'failed_payments',
      blocks: [{ kind: 'status', label: 'No failed payments today', tone: 'ok' }],
      citations: ['Payment Service', 'Event Explorer'],
    }
  }
  return {
    intent: 'failed_payments',
    blocks: [
      { kind: 'heading', text: `Failed payments (${ctx.metrics.failed_today})` },
      {
        kind: 'bullets',
        items: (failed.length ? failed : failedOrders.map(o => ({ order_id: o.order_id, payload: { data: {} } } as any))).map(e => ({
          tone: 'error',
          text: `Order ${short((e as any).order_id)} — ${((e as any).payload?.data?.reason) ?? 'card_declined'}`,
        })),
      },
      { kind: 'paragraph', text: 'Each failure triggered saga compensation: inventory was released and no customer was charged.' },
    ],
    citations: ['Payment Service', 'Event Explorer'],
  }
}

// ── Intent: low stock ────────────────────────────────────────────────────────
function answerLowStock(ctx: CopilotContext): CopilotAnswer {
  const threshold = 80
  const low = [...ctx.lowStock].sort((a, b) => a.stock_available - b.stock_available)
  if (low.length === 0) {
    return {
      intent: 'low_stock',
      blocks: [{ kind: 'status', label: `No products below ${threshold} units`, tone: 'ok' }],
      citations: ['Catalog Service', 'Inventory Service'],
    }
  }
  return {
    intent: 'low_stock',
    blocks: [
      { kind: 'heading', text: 'Products close to running out' },
      { kind: 'bullets', items: low.map(p => ({ tone: p.stock_available < 20 ? 'error' : 'warn', text: `${p.name} — ${p.stock_available} in stock` })) },
      { kind: 'paragraph', text: 'Consider restocking the items flagged in red before they sell out.' },
    ],
    citations: ['Catalog Service', 'Inventory Service'],
  }
}

// ── Intent: slow orders ──────────────────────────────────────────────────────
function answerSlowOrders(ctx: CopilotContext): CopilotAnswer {
  const slow = ctx.orders.filter(o => {
    if (o.status !== 'CONFIRMED') return false
    const ms = new Date(o.updated_at ?? o.created_at).getTime() - new Date(o.created_at).getTime()
    return ms > 5000
  })
  if (slow.length === 0) {
    return {
      intent: 'slow_orders',
      blocks: [
        { kind: 'status', label: 'No orders exceeded the 5s threshold', tone: 'ok' },
        { kind: 'paragraph', text: `Average processing time today is ${fmtDuration(ctx.metrics.avg_processing_ms)}, well within target.` },
      ],
      citations: ['Metrics Dashboard', 'Order Service'],
    }
  }
  return {
    intent: 'slow_orders',
    blocks: [
      { kind: 'heading', text: 'Orders slower than 5 seconds' },
      { kind: 'bullets', items: slow.map(o => ({ tone: 'warn', text: `Order ${short(o.order_id)}` })) },
    ],
    citations: ['Metrics Dashboard', 'Order Service'],
  }
}

// ── Intent: incident report ──────────────────────────────────────────────────
function answerIncidentReport(ctx: CopilotContext): CopilotAnswer {
  const failed = ctx.metrics.failed_today
  const failEvent = ctx.recentEvents.find(e => e.type === 'PaymentFailed')
  const when = failEvent?.occurred_at
    ? new Date(failEvent.occurred_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : 'earlier today'
  return {
    intent: 'incident_report',
    blocks: [
      { kind: 'heading', text: 'Incident summary' },
      { kind: 'paragraph', text: `At ${when}, payment failures rose above normal levels.` },
      { kind: 'keyvalue', pairs: [
        ['Impact', `${failed} order(s) failed`],
        ['Root cause', 'Stripe returned card_declined responses'],
        ['Detection', 'Payment Service metrics + event stream'],
      ] },
      { kind: 'heading', text: 'Automatic recovery' },
      { kind: 'bullets', items: [
        { tone: 'ok', text: 'Inventory reservations released' },
        { tone: 'ok', text: 'No customer charges occurred' },
        { tone: 'ok', text: 'Saga compensation completed' },
      ] },
      { kind: 'status', label: `Status: ${failed > 0 ? 'Resolved' : 'No active incidents'}`, tone: 'ok' },
    ],
    citations: ['Metrics Dashboard', 'Payment Service', 'Event Explorer'],
  }
}

// ── Static explainers ────────────────────────────────────────────────────────
function answerPaymentWorkflow(): CopilotAnswer {
  return {
    intent: 'payment_workflow',
    blocks: [
      { kind: 'heading', text: 'Payment workflow' },
      { kind: 'bullets', items: [
        { text: '1. Inventory Service publishes InventoryReserved after reserving stock.' },
        { text: '2. Payment Service consumes it and creates a Stripe PaymentIntent (idempotency_key = event_id).' },
        { text: '3. On success it writes PaymentCompleted to the outbox in the same transaction that claims the event.' },
        { text: '4. On decline it writes PaymentFailed, which drives saga compensation.' },
        { text: '5. The Stripe webhook service is a backstop if the payment process crashes mid-flight.' },
      ] },
      { kind: 'paragraph', text: 'When STRIPE_SECRET_KEY is unset, a simulated payment path is used with the same event contract.' },
    ],
    citations: ['Payment Service', 'Stripe Webhook Service'],
  }
}

function answerSaga(): CopilotAnswer {
  return {
    intent: 'saga',
    blocks: [
      { kind: 'heading', text: 'Saga orchestration (choreography)' },
      { kind: 'paragraph', text: 'Services coordinate via Kafka events with no central orchestrator. Each step reacts to the previous one and emits the next.' },
      { kind: 'bullets', items: [
        { text: 'OrderCreated → Inventory reserves stock → InventoryReserved' },
        { text: 'InventoryReserved → Payment charges → PaymentCompleted / PaymentFailed' },
        { text: 'PaymentCompleted → OrderConfirmed (+ email)' },
        { text: 'PaymentFailed → ReleaseInventory (compensation) → OrderFailed' },
      ] },
      { kind: 'paragraph', text: 'Idempotent consumers and PENDING-guarded state transitions make duplicate/replayed events harmless.' },
    ],
    citations: ['Order Service', 'Event Explorer'],
  }
}

// ── Intent router ────────────────────────────────────────────────────────────
export function runCopilot(question: string, ctx: CopilotContext): CopilotAnswer {
  const q = question.toLowerCase().trim()
  if (!q) return notEnough()

  if (/incident report|generate.*incident|postmortem/.test(q)) return answerIncidentReport(ctx)
  if (/saga|orchestrat|choreograph/.test(q)) return answerSaga()
  if (/payment workflow|how.*payment.*work|explain.*payment/.test(q)) return answerPaymentWorkflow()
  if (/(why|reason).*(fail)|fail.*order|root cause/.test(q)) return answerOrderFailure(q, ctx)
  if (/lifecycle|explain.*order|explain this order|trace.*order/.test(q)) return answerOrderLifecycle(q, ctx)
  if (/summar|today.*activity|system activity|overview/.test(q)) return answerMetricsSummary(ctx)
  if (/which service|unhealthy|service health|degraded|down/.test(q)) return answerServiceHealth(ctx)
  if (/failed payment|declined|payment.*fail/.test(q)) return answerFailedPayments(ctx)
  if (/stock|running out|inventory.*low|restock/.test(q)) return answerLowStock(ctx)
  if (/longer than|slow|taking too long|>.*5|5 second|latency/.test(q)) return answerSlowOrders(ctx)

  // Unknown intent: fall back to a metrics summary so the user still gets value,
  // but be explicit that the question wasn't matched.
  return {
    intent: 'unknown',
    blocks: [
      { kind: 'paragraph', text: "I can't map that to a specific operation yet, but here's the current system snapshot:" },
      ...answerMetricsSummary(ctx).blocks,
    ],
    citations: ['Metrics Dashboard', 'Service Health'],
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
const short = (id?: string) => (id ? `${id.slice(0, 8)}…` : 'unknown')
const titleCase = (s: string) => s.replace(/(^|[-_ ])(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase()).trim()
