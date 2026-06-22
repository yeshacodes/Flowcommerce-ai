import { useEffect, useRef, useState } from 'react'
import {
  MetricsSummary,
  OpsEvent,
  ordersApi,
  ServiceHealth,
  SystemHealth,
} from '../api/orders'
import { formatDuration } from '../lib/duration'

const REFRESH_MS = 5000

const fmtAgo = (iso: string | null) => {
  if (!iso) return '—'
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

const fmtUptime = (s?: number) => {
  if (!s && s !== 0) return '—'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

// ── status dot ──────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  healthy: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  down: 'bg-red-500',
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${STATUS_COLOR[status] ?? 'bg-pewter'} ${status === 'healthy' ? 'animate-ping' : ''}`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${STATUS_COLOR[status] ?? 'bg-pewter'}`} />
    </span>
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
}

// ── metric card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-ash">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ?? 'text-white'}`}>{value}</p>
    </div>
  )
}

export default function Operations() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null)
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [selected, setSelected] = useState<OpsEvent | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const firstLoad = useRef(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [h, m, e] = await Promise.all([
          ordersApi.systemHealth(),
          ordersApi.metricsSummary(),
          ordersApi.recentEvents(50),
        ])
        if (cancelled) return
        setHealth(h)
        setMetrics(m)
        setEvents(e.events)
        setError('')
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'Failed to load operations data')
      } finally {
        if (!cancelled) { setLoading(false); firstLoad.current = false }
      }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <div className="min-h-full bg-obsidian p-8 text-white">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ash">Operations</p>
          <h1 className="mt-1 text-2xl font-semibold">System Console</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-ash">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ember" />
          </span>
          Live · refreshes every 5s
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-card border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── System Health ───────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-ash">System Health</h2>
          {health && (
            <span className="flex items-center gap-1.5 text-xs text-pewter">
              <StatusDot status={health.overall} /> {health.overall}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loading && !health
            ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            : health?.services.map((svc: ServiceHealth) => (
                <div key={svc.service} className="rounded-card border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{svc.service}</span>
                    <StatusDot status={svc.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(svc.dependencies ?? {}).map(([dep, st]) => (
                      <span
                        key={dep}
                        className={`rounded-pill px-2 py-0.5 text-[11px] ${
                          st === 'healthy' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                        }`}
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-ash">uptime {fmtUptime(svc.uptime_seconds)}</p>
                </div>
              ))}
        </div>
      </section>

      {/* ── Metrics ─────────────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-ash">Metrics</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {loading && !metrics ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : metrics ? (
            <>
              <MetricCard label="Orders Today" value={String(metrics.orders_today)} />
              <MetricCard label="Success Rate" value={`${metrics.success_rate}%`} accent="text-emerald-400" />
              <MetricCard label="Failed Orders" value={String(metrics.failed_today)} accent={metrics.failed_today > 0 ? 'text-red-400' : 'text-white'} />
              <MetricCard label="Payment Success" value={`${metrics.payment_success_rate}%`} accent="text-ember" />
              <MetricCard label="Events Processed" value={String(metrics.events_processed)} />
              <MetricCard label="Avg Processing" value={formatDuration(metrics.avg_processing_ms)} />
            </>
          ) : null}
        </div>
      </section>

      {/* ── Recent Events + Explorer ────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-ash">Recent Events</h2>
          <div className="overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
            {loading && events.length === 0 ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : events.length === 0 ? (
              <p className="p-6 text-sm text-ash">No events yet.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {events.map(ev => (
                  <li key={ev.id}>
                    <button
                      onClick={() => setSelected(ev)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${
                        selected?.id === ev.id ? 'bg-white/[0.06]' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{ev.type ?? ev.topic}</p>
                        <p className="truncate font-mono text-[11px] text-ash">
                          {ev.order_id ? `order ${ev.order_id.slice(0, 8)}…` : ev.topic}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 pl-3">
                        <span className="rounded-pill bg-white/5 px-2 py-0.5 text-[11px] text-pewter">{ev.topic}</span>
                        <span className="text-[11px] text-ash">{fmtAgo(ev.created_at)}</span>
                        <StatusDot status={ev.published_at ? 'healthy' : 'degraded'} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Event Explorer */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-ash">Event Explorer</h2>
          <div className="rounded-card border border-white/10 bg-white/[0.03] p-5">
            {!selected ? (
              <p className="text-sm text-ash">Select an event to inspect its correlation chain and payload.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    ['Event', selected.type ?? '—'],
                    ['Topic', selected.topic],
                    ['Order ID', selected.order_id ?? '—'],
                    ['Correlation ID', selected.correlation_id ?? '—'],
                    ['Saga ID', selected.saga_id ?? '—'],
                    ['Event ID', selected.event_id ?? '—'],
                    ['Occurred', selected.occurred_at ?? '—'],
                    ['Published', selected.published_at ? fmtAgo(selected.published_at) : 'pending'],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <p className="text-[11px] uppercase tracking-wide text-ash">{k}</p>
                      <p className="truncate font-mono text-xs text-white" title={v as string}>{v}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-ash">Payload</p>
                  <pre className="max-h-80 overflow-auto rounded-tile border border-white/10 bg-void/60 p-3 font-mono text-[11px] leading-relaxed text-pewter">
{JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
