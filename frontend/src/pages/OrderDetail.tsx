import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ordersApi, Order } from '../api/orders'
import { catalogApi } from '../api/catalog'
import StatusBadge from '../components/StatusBadge'

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDate = (iso: string) => new Date(iso).toLocaleString()

interface TimelineStep {
  label: string
  description: string
  time?: string
  status: 'done' | 'active' | 'pending' | 'failed'
}

function buildTimeline(order: Order): TimelineStep[] {
  const isTerminal = order.status === 'CONFIRMED' || order.status === 'FAILED'
  const failed = order.status === 'FAILED'

  return [
    {
      label: 'Order Placed',
      description: 'Order received and saved',
      time: order.created_at,
      status: 'done',
    },
    {
      label: 'Inventory Reserved',
      description: 'Stock checked and reserved for your order',
      status: isTerminal ? (failed ? 'done' : 'done') : 'active',
    },
    {
      label: failed ? 'Payment Failed' : 'Payment Processed',
      description: failed ? 'Payment could not be completed' : 'Payment authorised successfully',
      time: isTerminal ? order.updated_at : undefined,
      status: isTerminal ? (failed ? 'failed' : 'done') : 'pending',
    },
    {
      label: failed ? 'Order Failed' : 'Order Confirmed',
      description: failed
        ? 'Reserved inventory has been released'
        : 'Your order is confirmed and being processed',
      time: isTerminal ? order.updated_at : undefined,
      status: isTerminal ? (failed ? 'failed' : 'done') : 'pending',
    },
  ]
}

const stepIcon = (status: TimelineStep['status']) => {
  if (status === 'done') return <span className="text-xs text-white">✓</span>
  if (status === 'failed') return <span className="text-xs text-white">✕</span>
  if (status === 'active') return <span className="block h-2 w-2 animate-pulse rounded-full bg-white" />
  return null
}

const stepRingColor = (status: TimelineStep['status']) => ({
  done:    'bg-emerald-500 border-emerald-500',
  failed:  'bg-ember border-ember',
  active:  'bg-ember border-ember',
  pending: 'bg-white border-pewter',
}[status])

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [skuToName, setSkuToName] = useState<Record<string, string>>({})

  useEffect(() => {
    catalogApi.listProducts()
      .then(ps => setSkuToName(Object.fromEntries(ps.map(p => [p.sku, p.name]))))
      .catch(() => {}) // non-fatal — falls back to showing SKU
  }, [])

  useEffect(() => {
    if (!id) return
    const load = () => {
      ordersApi.get(id)
        .then(o => {
          setOrder(o)
          // Keep polling if still PENDING
          if (o.status === 'PENDING') setTimeout(load, 2000)
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
    }
    load()
  }, [id])

  if (loading) return (
    <div className="mx-auto max-w-3xl px-8 py-10 text-sm text-ash">Loading order…</div>
  )

  if (error || !order) return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="rounded-input border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-hot">
        {error || 'Order not found.'}
      </div>
    </div>
  )

  const timeline = buildTimeline(order)

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/orders" className="text-sm text-ash transition-colors hover:text-obsidian">← Orders</Link>
        <span className="text-pewter">/</span>
        <span className="font-mono text-sm text-slate2">{order.order_id.slice(0, 8)}…</span>
      </div>

      {/* Header card */}
      <div className="card mb-5 flex items-start justify-between p-7">
        <div>
          <div className="mb-1.5 flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-obsidian">Order Detail</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="font-mono text-xs text-ash">{order.order_id}</p>
          <p className="mt-2 text-sm text-ash">Placed {fmtDate(order.created_at)}</p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Total</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-obsidian">{fmt(order.total_cents)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Timeline */}
        <div className="card p-7">
          <h2 className="mb-5 text-sm font-semibold text-obsidian">Order Timeline</h2>
          <ol className="space-y-0">
            {timeline.map((step, i) => (
              <li key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 ${stepRingColor(step.status)}`}>
                    {stepIcon(step.status)}
                  </div>
                  {i < timeline.length - 1 && (
                    <div className={`my-1 w-0.5 flex-1 ${step.status === 'done' ? 'bg-emerald-300' : 'bg-mist'}`} />
                  )}
                </div>
                <div className="min-w-0 pb-6 pt-0.5">
                  <p className={`text-sm font-medium ${step.status === 'failed' ? 'text-ember-hot' : step.status === 'pending' ? 'text-pewter' : 'text-obsidian'}`}>
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-xs text-ash">{step.description}</p>
                  {step.time && (
                    <p className="mt-1 text-xs text-pewter">{fmtDate(step.time)}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Items */}
        <div className="card p-7">
          <h2 className="mb-4 text-sm font-semibold text-obsidian">Items</h2>
          {order.items && order.items.length > 0 ? (
            <div className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b border-mist py-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-obsidian">{skuToName[item.sku] ?? item.sku}</p>
                    <p className="text-xs text-ash">Qty: {item.quantity}</p>
                  </div>
                  {item.unit_price_cents != null && (
                    <p className="text-sm font-semibold text-obsidian">
                      {fmt(item.unit_price_cents * item.quantity)}
                    </p>
                  )}
                </div>
              ))}
              <div className="flex justify-between pt-2 text-sm font-semibold text-obsidian">
                <span>Total</span>
                <span>{fmt(order.total_cents)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ash">No item detail available.</p>
          )}
        </div>
      </div>

      {/* Payment metadata — only shown when a real Stripe payment was made */}
      {order.payment_provider === 'stripe' && (
        <div className="card mt-5 p-7">
          <h2 className="mb-4 text-sm font-semibold text-obsidian">Payment</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="eyebrow mb-1.5">Provider</p>
              <div className="flex items-center gap-1.5">
                <svg className="h-3.5" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 0 1 3.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.87zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.84zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.5 0 3 .07 4.46.48V9.1c-1.36-.4-2.96-.84-4.46-.84-.86 0-1.44.23-1.44.85 0 1.85 6.29.97 6.29 5.69z" fill="#6772E5"/>
                </svg>
                <span className="text-sm font-medium text-obsidian">Stripe</span>
              </div>
            </div>
            <div>
              <p className="eyebrow mb-1.5">Payment Intent</p>
              <p className="truncate font-mono text-xs text-slate2">
                {order.payment_intent_id ?? '—'}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-1.5">Status</p>
              <span className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                order.status === 'CONFIRMED'
                  ? 'bg-emerald-50 text-emerald-700'
                  : order.status === 'FAILED'
                  ? 'bg-ember/10 text-ember-hot'
                  : 'bg-mist text-slate2'
              }`}>
                {order.status === 'CONFIRMED' ? 'Paid' : order.status === 'FAILED' ? 'Failed' : 'Pending'}
              </span>
            </div>
          </div>
        </div>
      )}

      {order.status === 'PENDING' && (
        <p className="mt-4 animate-pulse text-center text-xs text-ash">
          Processing your order… this page refreshes automatically.
        </p>
      )}
    </div>
  )
}
