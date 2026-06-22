import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ordersApi, Order } from '../api/orders'
import StatusBadge from '../components/StatusBadge'

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDate = (iso: string) => new Date(iso).toLocaleString()

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 20

  useEffect(() => {
    setLoading(true)
    ordersApi.list(limit, offset)
      .then(res => { setOrders(res.orders); setTotal(res.total) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [offset])

  return (
    <div className="mx-auto max-w-page px-8 py-10">
      <div className="mb-8">
        <span className="eyebrow">History</span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-obsidian">Orders</h1>
        <p className="mt-1 text-sm text-ash">{total} order{total !== 1 ? 's' : ''} total</p>
      </div>

      {error && (
        <div className="mb-4 rounded-input border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-hot">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-ash">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-14 text-center">
            <p className="text-sm text-ash">No orders yet.</p>
            <Link to="/products" className="mt-3 inline-block text-sm font-semibold text-ember hover:text-ember-hot">
              Browse products →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mist bg-snow">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Order ID</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Status</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Total</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Placed</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {orders.map(order => (
                <tr key={order.order_id} className="transition-colors hover:bg-snow">
                  <td className="px-6 py-4 font-mono text-xs text-slate2">
                    {order.order_id.slice(0, 8)}…
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={order.status} /></td>
                  <td className="px-6 py-4 font-medium text-obsidian">{fmt(order.total_cents)}</td>
                  <td className="px-6 py-4 text-ash">{fmtDate(order.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/orders/${order.order_id}`}
                      className="font-semibold text-ember hover:text-ember-hot"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > limit && (
          <div className="flex items-center justify-between border-t border-mist px-6 py-4 text-sm text-ash">
            <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(o => Math.max(0, o - limit))}
                className="rounded-pill border border-pewter/70 px-4 py-1.5 transition-colors hover:border-obsidian disabled:opacity-40"
              >← Prev</button>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(o => o + limit)}
                className="rounded-pill border border-pewter/70 px-4 py-1.5 transition-colors hover:border-obsidian disabled:opacity-40"
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
