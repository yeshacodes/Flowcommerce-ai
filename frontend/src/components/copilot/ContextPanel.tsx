import type { CopilotContext } from '../../types/copilot'
import { formatDuration } from '../../lib/duration'

/** Right-hand "Live System Context" panel. Auto-refresh is driven by the hook
 *  (context is re-fetched every 5s); this component just renders the snapshot. */
export default function ContextPanel({ context }: { context: CopilotContext | null }) {
  if (!context) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-tile bg-white/5" />)}
      </div>
    )
  }
  const m = context.metrics
  const stat = (label: string, value: string, accent?: string) => (
    <div className="flex items-center justify-between border-b border-white/5 py-2.5 last:border-0">
      <span className="text-xs text-ash">{label}</span>
      <span className={`text-sm font-semibold ${accent ?? 'text-white'}`}>{value}</span>
    </div>
  )

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ash">Live System Context</h2>
      </div>

      <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-1">
        {stat('Services Healthy', `${context.servicesHealthy}/${context.servicesTotal}`, context.servicesHealthy === context.servicesTotal ? 'text-emerald-400' : 'text-amber-400')}
        {stat('Orders Today', String(m.orders_today))}
        {stat('Success Rate', `${m.success_rate}%`, 'text-emerald-400')}
        {stat('Events Processed', String(m.events_processed))}
        {stat('Average Processing', formatDuration(m.avg_processing_ms))}
      </div>

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-ash">Recent Events</h3>
      <div className="rounded-card border border-white/10 bg-white/[0.03]">
        <ul className="divide-y divide-white/5">
          {context.recentEvents.slice(0, 6).map(ev => (
            <li key={ev.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-medium text-white">{ev.type ?? ev.topic}</span>
              <span className="rounded-pill bg-white/5 px-2 py-0.5 text-[10px] text-pewter">{ev.topic}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
