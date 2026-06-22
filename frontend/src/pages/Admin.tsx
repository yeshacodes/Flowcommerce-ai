import { useEffect, useState } from 'react'
import { catalogApi, Product } from '../api/catalog'
import { AdminStats, ordersApi } from '../api/orders'
import StatusBadge from '../components/StatusBadge'

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDate = (iso: string) => new Date(iso).toLocaleString()

function StatCard({ label, value, sub, accent = 'text-obsidian' }: {
  label: string; value: number | string; sub?: string; accent?: string
}) {
  return (
    <div className="tile p-5">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ash">{sub}</p>}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="eyebrow mb-3">{children}</h2>
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

  if (loading) return <div className="mx-auto max-w-page px-8 py-10 text-sm text-ash">Loading…</div>
  if (error || !stats) return (
    <div className="mx-auto max-w-page px-8 py-10">
      <div className="rounded-input border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-hot">{error || 'Failed to load.'}</div>
    </div>
  )

  const confirmed = stats.order_counts['CONFIRMED'] ?? 0
  const failed = stats.order_counts['FAILED'] ?? 0
  const pending = stats.order_counts['PENDING'] ?? 0
  const total = confirmed + failed + pending
  const successRate = total > 0 ? Math.round((confirmed / total) * 100) : 0

  return (
    <div className="mx-auto max-w-page px-8 py-10">
      <div className="mb-8">
        <span className="eyebrow">Operations</span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-obsidian">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-ash">System overview and event-bus health.</p>
      </div>

      {/* Hero metric band — obsidian stage */}
      <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-card bg-obsidian p-7 lg:col-span-1">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl"
            style={{ background: 'radial-gradient(circle, #ff5f34 0%, transparent 70%)' }}
          />
          <p className="eyebrow text-white/40">Payment Success Rate</p>
          <p className="relative mt-3 text-5xl font-bold tracking-tight text-white">{successRate}%</p>
          <p className="relative mt-2 text-xs text-white/45">
            {confirmed} confirmed of {total} total orders
          </p>
        </div>
        <div className="grid grid-cols-2 gap-5 lg:col-span-2 lg:grid-cols-3">
          <StatCard label="Total Orders" value={total} />
          <StatCard label="Confirmed" value={confirmed} accent="text-emerald-600" />
          <StatCard label="Failed" value={failed} accent="text-ember-hot" />
          <StatCard label="Pending" value={pending} accent="text-amber-500" />
          <StatCard
            label="Outbox Pending"
            value={stats.outbox.pending}
            accent={stats.outbox.pending > 0 ? 'text-amber-500' : 'text-emerald-600'}
          />
          <StatCard label="Published (1h)" value={stats.outbox.published_last_hour} accent="text-obsidian" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Recent orders */}
        <div>
          <SectionLabel>Recent Orders</SectionLabel>
          <div className="card overflow-hidden">
            {stats.recent_orders.length === 0 ? (
              <p className="p-6 text-sm text-ash">No orders yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-mist bg-snow">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Order</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Status</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Total</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Placed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {stats.recent_orders.map(order => (
                    <tr key={order.order_id} className="transition-colors hover:bg-snow">
                      <td className="px-5 py-3 font-mono text-xs text-slate2">
                        {order.order_id.slice(0, 8)}…
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-5 py-3 font-medium text-obsidian">{fmt(order.total_cents)}</td>
                      <td className="px-5 py-3 text-xs text-ash">{fmtDate(order.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Inventory */}
        <div>
          <SectionLabel>Inventory</SectionLabel>
          <div className="card overflow-hidden">
            {products.length === 0 ? (
              <p className="p-6 text-sm text-ash">No products.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-mist bg-snow">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Product</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Price</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {products.map(p => (
                    <tr key={p.sku} className="transition-colors hover:bg-snow">
                      <td className="px-5 py-3">
                        <p className="font-medium text-obsidian">{p.name}</p>
                        <p className="font-mono text-xs text-pewter">{p.sku}</p>
                      </td>
                      <td className="px-5 py-3 text-slate2">{fmt(p.price_cents)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 font-semibold ${p.stock_available === 0 ? 'text-ember-hot' : p.stock_available < 20 ? 'text-amber-500' : 'text-emerald-600'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${p.stock_available === 0 ? 'bg-ember' : p.stock_available < 20 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
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
