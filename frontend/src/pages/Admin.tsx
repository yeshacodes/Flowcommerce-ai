import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { catalogApi, Product } from '../api/catalog'
import { AdminStats, ordersApi } from '../api/orders'
import StatusBadge from '../components/StatusBadge'

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDate = (iso: string) => new Date(iso).toLocaleString()

function StatCard({ label, value, sub, color = 'text-slate-900' }: {
  label: string; value: number | string; sub?: string; color?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function Admin() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([ordersApi.adminStats(), catalogApi.listProducts()])
      .then(([s, p]) => { setStats(s); setProducts(p) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>
  if (error || !stats) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error || 'Failed to load.'}</div>
    </div>
  )

  const confirmed = stats.order_counts['CONFIRMED'] ?? 0
  const failed = stats.order_counts['FAILED'] ?? 0
  const pending = stats.order_counts['PENDING'] ?? 0
  const total = confirmed + failed + pending

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">System overview and health</p>
      </div>

      {/* Order stats */}
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Orders</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Orders" value={total} />
        <StatCard label="Confirmed" value={confirmed} color="text-emerald-600" />
        <StatCard label="Failed" value={failed} color="text-red-500" />
        <StatCard label="Pending" value={pending} color="text-amber-500" />
      </div>

      {/* Outbox health */}
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Event Bus Health</h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard
          label="Outbox — Pending"
          value={stats.outbox.pending}
          sub="Events not yet published to Kafka"
          color={stats.outbox.pending > 0 ? 'text-amber-500' : 'text-emerald-600'}
        />
        <StatCard
          label="Outbox — Published (1h)"
          value={stats.outbox.published_last_hour}
          sub="Events published in the last hour"
          color="text-blue-600"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent orders */}
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Recent Orders</h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {stats.recent_orders.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">No orders yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Order</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Total</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Placed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.recent_orders.map(order => (
                    <tr key={order.order_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {order.order_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 font-medium text-slate-900">{fmt(order.total_cents)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(order.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Inventory */}
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Inventory</h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {products.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">No products.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Product</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Price</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map(p => (
                    <tr key={p.sku} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{fmt(p.price_cents)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${p.stock_available === 0 ? 'text-red-500' : p.stock_available < 20 ? 'text-amber-500' : 'text-emerald-600'}`}>
                          {p.stock_available}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
