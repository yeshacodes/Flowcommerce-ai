import { Link, useParams } from 'react-router-dom'
import { demoEvents, demoFailureReasons, demoProducts, findDemoOrder } from '../../data/demoData'
import StatusBadge from '../../components/StatusBadge'
import OrderAssistant from '../../components/order/OrderAssistant'
import OrderJourney from '../../components/order/OrderJourney'
import type { CustomerOrderContext } from '../../types/customerCopilot'

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDate = (iso: string) => new Date(iso).toLocaleString()
const nameOf = (sku: string) => demoProducts.find(p => p.sku === sku)?.name ?? sku

type Step = { label: string; description: string; time?: string; status: 'done' | 'active' | 'failed' | 'pending' }

function buildTimeline(status: string, createdAt: string, updatedAt: string): Step[] {
  const terminal = status === 'CONFIRMED' || status === 'FAILED'
  const failed = status === 'FAILED'
  return [
    { label: 'Order Placed', description: 'Order received and saved', time: createdAt, status: 'done' },
    { label: 'Inventory Reserved', description: 'Stock checked and reserved for your order', status: terminal ? 'done' : 'active' },
    {
      label: failed ? 'Payment Failed' : 'Payment Processed',
      description: failed ? 'Payment could not be completed' : 'Payment authorised successfully',
      time: terminal ? updatedAt : undefined,
      status: terminal ? (failed ? 'failed' : 'done') : 'pending',
    },
    {
      label: failed ? 'Order Failed' : 'Order Confirmed',
      description: failed ? 'Reserved inventory has been released' : 'Your order is confirmed and being processed',
      time: terminal ? updatedAt : undefined,
      status: terminal ? (failed ? 'failed' : 'done') : 'pending',
    },
  ]
}

const ring = (s: Step['status']) =>
  ({ done: 'bg-emerald-500 border-emerald-500', failed: 'bg-red-500 border-red-500', active: 'bg-ember border-ember', pending: 'bg-white border-pewter' }[s])

export default function DemoOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const order = id ? findDemoOrder(id) : undefined

  if (!order) {
    return (
      <div className="p-8">
        <div className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Demo order not found. <Link to="/demo/orders" className="font-medium underline">Back to orders</Link>
        </div>
      </div>
    )
  }

  const timeline = buildTimeline(order.status, order.created_at, order.updated_at)
  const reason = demoFailureReasons[order.order_id]
  const assistantContext: CustomerOrderContext = {
    order,
    events: demoEvents
      .filter(event => event.order_id === order.order_id)
      .sort((a, b) => new Date(a.occurred_at ?? a.created_at).getTime() - new Date(b.occurred_at ?? b.created_at).getTime()),
    generated_at: new Date().toISOString(),
  }

  return (
    <div className="max-w-3xl p-8">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/demo/orders" className="text-sm text-ash hover:text-slate2">← Orders</Link>
        <span className="text-pewter">/</span>
        <span className="font-mono text-sm text-slate2">{order.order_id.slice(0, 8)}…</span>
      </div>

      {/* Header */}
      <div className="mb-5 flex items-start justify-between rounded-card border border-mist bg-white p-6">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate2">Order Detail</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="font-mono text-xs text-ash">{order.order_id}</p>
          <p className="mt-2 text-sm text-ash">Placed {fmtDate(order.created_at)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-ash">Total</p>
          <p className="mt-0.5 text-2xl font-bold text-slate2">{fmt(order.total_cents)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Timeline */}
        <div className="rounded-card border border-mist bg-white p-6">
          <h2 className="mb-5 text-sm font-semibold text-slate2">Order Timeline</h2>
          <ol>
            {timeline.map((step, i) => (
              <li key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 ${ring(step.status)}`}>
                    {step.status === 'done' && <span className="text-xs text-white">✓</span>}
                    {step.status === 'failed' && <span className="text-xs text-white">✕</span>}
                    {step.status === 'active' && <span className="block h-2 w-2 animate-pulse rounded-full bg-white" />}
                  </div>
                  {i < timeline.length - 1 && <div className={`my-1 w-0.5 flex-1 ${step.status === 'done' ? 'bg-emerald-300' : 'bg-mist'}`} />}
                </div>
                <div className="min-w-0 pb-6 pt-0.5">
                  <p className={`text-sm font-medium ${step.status === 'failed' ? 'text-red-600' : step.status === 'pending' ? 'text-ash' : 'text-slate2'}`}>{step.label}</p>
                  <p className="mt-0.5 text-xs text-ash">{step.description}</p>
                  {step.time && <p className="mt-1 text-xs text-pewter">{fmtDate(step.time)}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Items */}
        <div className="rounded-card border border-mist bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate2">Items</h2>
          <div className="space-y-3">
            {(order.items ?? []).map((item, i) => (
              <div key={i} className="flex items-center justify-between border-b border-mist py-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate2">{nameOf(item.sku)}</p>
                  <p className="text-xs text-ash">Qty: {item.quantity}</p>
                </div>
                {item.unit_price_cents != null && (
                  <p className="text-sm font-semibold text-slate2">{fmt(item.unit_price_cents * item.quantity)}</p>
                )}
              </div>
            ))}
            <div className="flex justify-between pt-2 text-sm font-semibold text-slate2">
              <span>Total</span><span>{fmt(order.total_cents)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment */}
      <div className="mt-5 rounded-card border border-mist bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate2">Payment</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ash">Provider</p>
            <p className="text-sm font-medium text-slate2">Stripe</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ash">Payment Intent</p>
            <p className="truncate font-mono text-xs text-slate2">{order.payment_intent_id ?? '—'}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ash">Status</p>
            <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium ${
              order.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700'
              : order.status === 'FAILED' ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-700'
            }`}>
              {order.status === 'CONFIRMED' ? 'Paid' : order.status === 'FAILED' ? `Failed${reason ? ` · ${reason}` : ''}` : 'Pending'}
            </span>
          </div>
        </div>
      </div>

      <OrderJourney context={assistantContext} />
      <OrderAssistant initialContext={assistantContext} />
    </div>
  )
}
