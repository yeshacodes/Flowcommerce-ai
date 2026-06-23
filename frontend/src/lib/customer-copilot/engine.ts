import type { Order } from '../../api/orders'
import type {
  CustomerAssistantAnswer,
  CustomerOrderContext,
  CustomerOrderEvent,
  JourneyStep,
} from '../../types/customerCopilot'

const NOT_ENOUGH = "I don't have enough information to answer that from the available order data."

const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '')
const short = (id?: string | null) => (id ? `${id.slice(0, 8)}...` : 'unavailable')

function eventTime(event?: CustomerOrderEvent) {
  return event?.occurred_at ?? event?.created_at
}

function byType(ctx: CustomerOrderContext, type: string) {
  return ctx.events.find(e => e.type === type)
}

function orderedEvents(ctx: CustomerOrderContext) {
  return [...ctx.events].sort(
    (a, b) => new Date(eventTime(a) ?? 0).getTime() - new Date(eventTime(b) ?? 0).getTime(),
  )
}

export function buildOrderJourney(ctx: CustomerOrderContext): JourneyStep[] {
  const order = ctx.order
  const orderCreated = byType(ctx, 'OrderCreated')
  const inventoryReserved = byType(ctx, 'InventoryReserved')
  const inventoryFailed = byType(ctx, 'InventoryFailed')
  const paymentCompleted = byType(ctx, 'PaymentCompleted')
  const paymentFailed = byType(ctx, 'PaymentFailed')
  const releaseInventory = byType(ctx, 'ReleaseInventory')
  const orderConfirmed = byType(ctx, 'OrderConfirmed')
  const orderFailed = byType(ctx, 'OrderFailed')

  const steps: JourneyStep[] = [
    {
      key: 'created',
      label: 'Order Created',
      description: 'Checkout created the order record.',
      time: eventTime(orderCreated) ?? order.created_at,
      status: 'done',
      source: orderCreated,
    },
  ]

  if (inventoryFailed) {
    steps.push({
      key: 'inventory-failed',
      label: 'Inventory Failed',
      description: reasonOf(inventoryFailed) ?? 'Inventory could not be reserved.',
      time: eventTime(inventoryFailed),
      status: 'failed',
      source: inventoryFailed,
    })
  } else {
    steps.push({
      key: 'inventory-reserved',
      label: 'Inventory Reserved',
      description: inventoryReserved ? 'Stock was reserved for this order.' : 'Waiting for inventory reservation.',
      time: eventTime(inventoryReserved),
      status: inventoryReserved ? 'done' : order.status === 'PENDING' ? 'active' : 'pending',
      source: inventoryReserved,
    })
  }

  if (paymentFailed) {
    steps.push({
      key: 'payment-failed',
      label: 'Payment Failed',
      description: reasonOf(paymentFailed) ?? 'Payment could not be completed.',
      time: eventTime(paymentFailed),
      status: 'failed',
      source: paymentFailed,
    })
  } else {
    steps.push({
      key: 'payment',
      label: paymentCompleted ? 'Payment Completed' : 'Payment Pending',
      description: paymentCompleted ? 'Payment was completed for this order.' : 'Waiting for payment completion.',
      time: eventTime(paymentCompleted),
      status: paymentCompleted ? 'done' : order.status === 'PENDING' ? 'active' : 'pending',
      source: paymentCompleted,
    })
  }

  if (releaseInventory) {
    steps.push({
      key: 'inventory-released',
      label: 'Inventory Released',
      description: 'The reserved stock was released after the failure.',
      time: eventTime(releaseInventory),
      status: 'warning',
      source: releaseInventory,
    })
  }

  if (order.status === 'FAILED' || orderFailed) {
    steps.push({
      key: 'failed',
      label: 'Order Failed',
      description: reasonOf(orderFailed) ?? 'The order was marked as failed.',
      time: eventTime(orderFailed) ?? order.updated_at,
      status: 'failed',
      source: orderFailed,
    })
  } else {
    steps.push({
      key: 'confirmed',
      label: orderConfirmed ? 'Order Confirmed' : 'Order Confirmation Pending',
      description: orderConfirmed
        ? 'The order was confirmed and a confirmation event was recorded.'
        : 'Waiting for the order confirmation event.',
      time: eventTime(orderConfirmed) ?? (order.status === 'CONFIRMED' ? order.updated_at : undefined),
      status: orderConfirmed || order.status === 'CONFIRMED' ? 'done' : 'pending',
      source: orderConfirmed,
    })
  }

  return steps
}

export function runCustomerAssistant(question: string, ctx: CustomerOrderContext): CustomerAssistantAnswer {
  const q = question.toLowerCase().trim()
  if (!q) return notEnough()

  if (/where|status|progress/.test(q)) return answerWhere(ctx)
  if (/after checkout|what happened|timeline|explain/.test(q)) return answerTimeline(ctx)
  if (/why.*payment.*fail|payment.*fail|declined|card/.test(q)) return answerPaymentFailure(ctx)
  if (/when.*arrive|delivery|shipment|ship/.test(q)) return answerDelivery(ctx)
  if (/payment.*complete|paid|charged|charge/.test(q)) return answerPaymentStatus(ctx)
  if (/inventory|reserved|stock/.test(q)) return answerInventory(ctx)
  if (/email|notification|confirmation/.test(q)) return answerNotification(ctx)
  if (/how long|processing time|take/.test(q)) return answerDuration(ctx)
  if (/next|do next|what should/.test(q)) return answerNextStep(ctx)

  return {
    intent: 'customer_unknown',
    blocks: [
      { kind: 'paragraph', text: NOT_ENOUGH },
      { kind: 'heading', text: 'Try asking about' },
      { kind: 'bullets', items: [
        { text: 'Where your order is' },
        { text: 'What happened after checkout' },
        { text: 'Payment, inventory, email, or timeline status' },
      ] },
    ],
    citations: ['Order Service'],
  }
}

function answerWhere(ctx: CustomerOrderContext): CustomerAssistantAnswer {
  const steps = buildOrderJourney(ctx)
  const order = ctx.order
  const done = steps.filter(s => s.status === 'done')
  const current = [...steps].reverse().find(s => s.status === 'failed' || s.status === 'active' || s.status === 'done')

  const lead =
    order.status === 'CONFIRMED'
      ? 'Good news — your order completed successfully and a confirmation event was recorded.'
      : order.status === 'FAILED'
        ? 'This order did not complete. The system stopped it safely and released any reserved inventory.'
        : "Your order is still moving through the workflow — here's where it is right now."

  return {
    intent: 'order_status',
    blocks: [
      { kind: 'status', label: `Order ${statusLabel(order.status)}`, tone: order.status === 'FAILED' ? 'error' : order.status === 'PENDING' ? 'warn' : 'ok' },
      { kind: 'paragraph', text: lead },
      { kind: 'heading', text: 'Progress so far' },
      { kind: 'bullets', items: done.map(s => ({ tone: 'ok', text: `${s.label}${s.time ? ` at ${fmtTime(s.time)}` : ''}` })) },
      { kind: 'paragraph', text: 'No shipment or carrier milestone is available in this order data yet.' },
      ids(ctx),
    ],
    citations: citations(ctx),
  }
}

function answerTimeline(ctx: CustomerOrderContext): CustomerAssistantAnswer {
  const events = orderedEvents(ctx)
  // Prefer real events; fall back to the derived journey when none are present.
  const items = events.length
    ? events.map(e => ({ tone: e.type?.includes('Failed') ? 'error' as const : 'ok' as const, text: eventLabel(e) }))
    : buildOrderJourney(ctx).map(s => ({
        tone: s.status === 'failed' ? 'error' as const : s.status === 'done' ? 'ok' as const : 'neutral' as const,
        text: s.label,
      }))

  const failed = ctx.order.status === 'FAILED' || !!byType(ctx, 'PaymentFailed') || !!byType(ctx, 'InventoryFailed')
  const duration = elapsedSeconds(ctx)
  const summary = duration == null
    ? (ctx.order.status === 'PENDING' ? 'This order is still being processed.' : '')
    : failed
      ? `Failed after ${duration}.`
      : `Completed in ${duration}.`

  const blocks: CustomerAssistantAnswer['blocks'] = [
    { kind: 'heading', text: 'What happened after checkout' },
    { kind: 'bullets', items },
  ]
  if (summary) blocks.push({ kind: 'paragraph', text: summary })
  blocks.push(ids(ctx))

  return { intent: 'order_timeline', blocks, citations: citations(ctx) }
}

function answerPaymentFailure(ctx: CustomerOrderContext): CustomerAssistantAnswer {
  const failed = byType(ctx, 'PaymentFailed')
  if (!failed && ctx.order.status !== 'FAILED') return notEnough(['Payment Service', 'Order Service'])
  const reason = reasonOf(failed) ?? (ctx.order.status === 'FAILED' ? 'payment_failed' : undefined)

  return {
    intent: 'payment_failure',
    blocks: [
      { kind: 'paragraph', text: reason
        ? `The payment attempt was declined (${reason}), so the system automatically stopped the order and released the reserved inventory. No charge was made.`
        : NOT_ENOUGH },
      { kind: 'heading', text: 'What happened' },
      { kind: 'bullets', items: [
        { tone: byType(ctx, 'InventoryReserved') ? 'ok' : 'neutral', text: byType(ctx, 'InventoryReserved') ? 'Inventory was reserved first' : 'No inventory reservation event is available' },
        { tone: byType(ctx, 'ReleaseInventory') ? 'ok' : 'neutral', text: byType(ctx, 'ReleaseInventory') ? 'Inventory reservation was released' : 'No inventory release event is available' },
        { tone: 'ok', text: 'No completed payment event is recorded for this order' },
        { tone: 'error', text: 'Order was marked as failed' },
      ] },
      ids(ctx),
    ],
    citations: citations(ctx, ['Payment Service']),
  }
}

function answerDelivery(ctx: CustomerOrderContext): CustomerAssistantAnswer {
  return {
    intent: 'delivery',
    blocks: [
      { kind: 'paragraph', text: "I don't have a shipment, carrier, or delivery estimate in the available order data." },
      { kind: 'keyvalue', pairs: [['Order status', ctx.order.status], ['Last order update', fmtDateTime(ctx.order.updated_at) || 'unavailable']] },
    ],
    citations: ['Order Service'],
  }
}

function answerPaymentStatus(ctx: CustomerOrderContext): CustomerAssistantAnswer {
  const completed = byType(ctx, 'PaymentCompleted')
  const failed = byType(ctx, 'PaymentFailed')
  const charged = !!completed || ctx.order.status === 'CONFIRMED'
  const failedWithoutCharge = !!failed || ctx.order.status === 'FAILED'

  return {
    intent: 'payment_status',
    blocks: [
      { kind: 'status', label: charged ? 'Payment completed' : failedWithoutCharge ? 'No completed charge recorded' : 'Payment still pending', tone: charged ? 'ok' : failedWithoutCharge ? 'error' : 'warn' },
      { kind: 'paragraph', text: charged ? 'A completed payment is recorded for this order.' : failedWithoutCharge ? 'The available events show a failed payment, not a completed charge.' : 'The order is still pending and no completed payment event is available yet.' },
      { kind: 'keyvalue', pairs: [['Payment provider', ctx.order.payment_provider ?? 'unavailable'], ['Payment intent', ctx.order.payment_intent_id ?? 'unavailable']] },
    ],
    citations: citations(ctx, ['Payment Service']),
  }
}

function answerInventory(ctx: CustomerOrderContext): CustomerAssistantAnswer {
  const reserved = byType(ctx, 'InventoryReserved')
  const released = byType(ctx, 'ReleaseInventory')
  const failed = byType(ctx, 'InventoryFailed')
  return {
    intent: 'inventory_status',
    blocks: [
      { kind: 'status', label: reserved ? 'Inventory reserved' : failed ? 'Inventory reservation failed' : 'Inventory status unavailable', tone: reserved ? 'ok' : failed ? 'error' : 'warn' },
      { kind: 'paragraph', text: released ? 'Inventory was later released as part of failure recovery.' : reserved ? 'Stock was reserved for the items in this order.' : reasonOf(failed) ?? NOT_ENOUGH },
    ],
    citations: citations(ctx, ['Inventory Service']),
  }
}

function answerNotification(ctx: CustomerOrderContext): CustomerAssistantAnswer {
  const confirmed = byType(ctx, 'OrderConfirmed')
  return {
    intent: 'notification_status',
    blocks: [
      { kind: 'status', label: confirmed ? 'Confirmation event recorded' : 'No confirmation email event available', tone: confirmed ? 'ok' : 'warn' },
      { kind: 'paragraph', text: confirmed ? 'The order confirmation event includes the customer notification data.' : NOT_ENOUGH },
    ],
    citations: citations(ctx, ['Notification Service']),
  }
}

function answerDuration(ctx: CustomerOrderContext): CustomerAssistantAnswer {
  return {
    intent: 'processing_time',
    blocks: [
      { kind: 'keyvalue', pairs: [['Processing time', processingDuration(ctx)], ['Created', fmtDateTime(ctx.order.created_at)], ['Last update', fmtDateTime(ctx.order.updated_at) || 'in progress']] },
    ],
    citations: ['Order Service', 'Event Timeline'],
  }
}

function answerNextStep(ctx: CustomerOrderContext): CustomerAssistantAnswer {
  const order = ctx.order
  const text =
    order.status === 'CONFIRMED'
      ? 'Your order is confirmed. The available data does not include a shipment step yet.'
      : order.status === 'FAILED'
        ? 'The order failed. You can retry checkout with another payment method or contact your bank if the payment was declined.'
        : 'Your order is still processing. This page will refresh while the saga continues.'
  return {
    intent: 'next_step',
    blocks: [{ kind: 'paragraph', text }],
    citations: ['Order Service', 'Event Timeline'],
  }
}

function notEnough(citationsList: string[] = ['Order Service']): CustomerAssistantAnswer {
  return { intent: 'not_enough', blocks: [{ kind: 'paragraph', text: NOT_ENOUGH }], citations: citationsList }
}

function ids(ctx: CustomerOrderContext) {
  const event = ctx.events[0]
  return {
    kind: 'keyvalue' as const,
    pairs: [
      ['Order ID', ctx.order.order_id],
      ['Correlation ID', ctx.order.correlation_id ?? event?.correlation_id ?? 'unavailable'],
      ['Saga ID', event?.saga_id ?? ctx.order.correlation_id ?? 'unavailable'],
    ] as [string, string][],
  }
}

function citations(ctx: CustomerOrderContext, extra: string[] = []) {
  return Array.from(new Set(['Order Service', 'Event Timeline', ...extra, ...ctx.events.map(e => eventSource(e)).filter(Boolean)]))
}

function eventSource(event: CustomerOrderEvent) {
  if (event.type?.includes('Inventory')) return 'Inventory Service'
  if (event.type?.includes('Payment')) return 'Payment Service'
  if (event.type === 'OrderConfirmed') return 'Notification Service'
  return ''
}

function reasonOf(event?: CustomerOrderEvent) {
  const data = (event?.payload as any)?.data
  return data?.reason ?? data?.error ?? data?.message
}

function eventLabel(event: CustomerOrderEvent) {
  const labels: Record<string, string> = {
    OrderCreated: 'Order created',
    InventoryReserved: 'Inventory reserved',
    InventoryFailed: 'Inventory reservation failed',
    PaymentCompleted: 'Payment completed',
    PaymentFailed: `Payment failed${reasonOf(event) ? ` (${reasonOf(event)})` : ''}`,
    ReleaseInventory: 'Inventory released',
    OrderConfirmed: 'Order confirmed',
    OrderFailed: `Order failed${reasonOf(event) ? ` (${reasonOf(event)})` : ''}`,
  }
  return labels[event.type ?? ''] ?? `${event.type ?? event.topic}`
}

// Human-friendly elapsed time from the first to the last event (or null if it
// can't be derived). Used for "Completed in 4 seconds." / "Failed after 3 seconds."
function elapsedSeconds(ctx: CustomerOrderContext): string | null {
  const events = orderedEvents(ctx)
  const start = eventTime(events[0]) ?? ctx.order.created_at
  const end = eventTime(events[events.length - 1]) ?? ctx.order.updated_at
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 0) return null
  if (ms < 1000) return `${ms} ms`
  const secs = ms / 1000
  const rounded = secs < 10 ? Math.round(secs) : Math.round(secs)
  return `${rounded} second${rounded === 1 ? '' : 's'}`
}

function processingDuration(ctx: CustomerOrderContext) {
  const events = orderedEvents(ctx)
  const start = eventTime(events[0]) ?? ctx.order.created_at
  const end = eventTime(events[events.length - 1]) ?? ctx.order.updated_at
  if (!start || !end) return ctx.order.status === 'PENDING' ? 'in progress' : 'unavailable'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 0) return 'unavailable'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} seconds`
}

function statusLabel(status: Order['status']) {
  if (status === 'CONFIRMED') return 'confirmed'
  if (status === 'FAILED') return 'failed'
  return 'processing'
}
