import { Link } from 'react-router-dom'
import { demoOrders } from '../../data/demoData'
import StatusBadge from '../../components/StatusBadge'

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDate = (iso: string) => new Date(iso).toLocaleString()

/** Demo orders list — mock data, mirrors the real Orders table. */
export default function DemoOrders() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate2">Orders</h1>
        <p className="mt-0.5 text-sm text-ash">{demoOrders.length} orders total</p>
      </div>

      <div className="overflow-hidden rounded-card border border-mist bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist bg-snow">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ash">Order ID</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ash">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ash">Total</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ash">Placed</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {demoOrders.map(order => (
              <tr key={order.order_id} className="transition-colors hover:bg-snow">
                <td className="px-6 py-4 font-mono text-xs text-slate2">{order.order_id.slice(0, 8)}…</td>
                <td className="px-6 py-4"><StatusBadge status={order.status} /></td>
                <td className="px-6 py-4 font-medium text-slate2">{fmt(order.total_cents)}</td>
                <td className="px-6 py-4 text-ash">{fmtDate(order.created_at)}</td>
                <td className="px-6 py-4 text-right">
                  <Link to={`/demo/orders/${order.order_id}`} className="font-medium text-ember hover:text-ember-hot">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
