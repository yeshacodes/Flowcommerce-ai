import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ordersApi, Order } from '../api/orders'
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
  if (status === 'done') return <span className="text-white text-xs">✓</span>
  if (status === 'failed') return <span className="text-white text-xs">✕</span>
  if (status === 'active') return <span className="w-2 h-2 bg-white rounded-full animate-pulse block" />
  return null
}

const stepRingColor = (status: TimelineStep['status']) => ({
  done:    'bg-emerald-500 border-emerald-500',
  failed:  'bg-red-500 border-red-500',
  active:  'bg-blue-500 border-blue-500',
  pending: 'bg-white border-slate-300',
}[status])

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    <div className="p-8 text-sm text-slate-400">Loading order…</div>
  )

  if (error || !order) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
        {error || 'Order not found.'}
      </div>
    </div>
  )

  const timeline = buildTimeline(order)

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/orders" className="text-sm text-slate-400 hover:text-slate-600">← Orders</Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-mono text-slate-600">{order.order_id.slice(0, 8)}…</span>
      </div>

      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-5 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-semibold text-slate-900 text-lg">Order Detail</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-xs font-mono text-slate-400">{order.order_id}</p>
          <p className="text-sm text-slate-500 mt-2">Placed {fmtDate(order.created_at)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total</p>
          <p className="text-2xl font-bold text-slate-900 mt-0.5">{fmt(order.total_cents)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Timeline */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-5">Order Timeline</h2>
          <ol className="space-y-0">
            {timeline.map((step, i) => (
              <li key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${stepRingColor(step.status)}`}>
                    {stepIcon(step.status)}
                  </div>
                  {i < timeline.length - 1 && (
                    <div className={`w-0.5 flex-1 my-1 ${step.status === 'done' ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                  )}
                </div>
                <div className="pb-6 pt-0.5 min-w-0">
                  <p className={`text-sm font-medium ${step.status === 'failed' ? 'text-red-600' : step.status === 'pending' ? 'text-slate-400' : 'text-slate-900'}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                  {step.time && (
                    <p className="text-xs text-slate-400 mt-1">{fmtDate(step.time)}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Items */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Items</h2>
          {order.items && order.items.length > 0 ? (
            <div className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.sku}</p>
                    <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                  </div>
                  {item.unit_price_cents != null && (
                    <p className="text-sm font-semibold text-slate-900">
                      {fmt(item.unit_price_cents * item.quantity)}
                    </p>
                  )}
                </div>
              ))}
              <div className="flex justify-between pt-2 text-sm font-semibold text-slate-900">
                <span>Total</span>
                <span>{fmt(order.total_cents)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No item detail available.</p>
          )}
        </div>
      </div>

      {order.status === 'PENDING' && (
        <p className="mt-4 text-xs text-slate-400 text-center animate-pulse">
          Processing your order… this page refreshes automatically.
        </p>
      )}
    </div>
  )
}
