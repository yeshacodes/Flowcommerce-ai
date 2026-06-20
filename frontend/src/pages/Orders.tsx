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
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">My Orders</h1>
        <p className="text-sm text-slate-500 mt-0.5">{total} order{total !== 1 ? 's' : ''} total</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-400 text-sm">No orders yet.</p>
            <Link to="/products" className="mt-3 inline-block text-blue-600 text-sm font-medium hover:underline">
              Browse products →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order ID</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Placed</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map(order => (
                <tr key={order.order_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-600">
                    {order.order_id.slice(0, 8)}…
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={order.status} /></td>
                  <td className="px-6 py-4 font-medium text-slate-900">{fmt(order.total_cents)}</td>
                  <td className="px-6 py-4 text-slate-500">{fmtDate(order.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/orders/${order.order_id}`}
                      className="text-blue-600 hover:text-blue-700 font-medium"
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
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(o => Math.max(0, o - limit))}
                className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >← Prev</button>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(o => o + limit)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
