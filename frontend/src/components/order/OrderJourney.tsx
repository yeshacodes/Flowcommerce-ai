import { buildOrderJourney } from '../../lib/customer-copilot/engine'
import type { CustomerOrderContext, JourneyStep } from '../../types/customerCopilot'

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : 'Waiting')

const ring: Record<JourneyStep['status'], string> = {
  done: 'border-emerald-400 bg-emerald-500 text-white',
  active: 'border-ember bg-ember text-white',
  pending: 'border-white/20 bg-white/5 text-pewter',
  failed: 'border-red-400 bg-red-500 text-white',
  warning: 'border-amber-300 bg-amber-400 text-obsidian',
}

const label: Record<JourneyStep['status'], string> = {
  done: 'Done',
  active: 'Now',
  pending: 'Pending',
  failed: 'Failed',
  warning: 'Recovered',
}

export default function OrderJourney({ context }: { context: CustomerOrderContext }) {
  const steps = buildOrderJourney(context)

  return (
    <section className="mt-5 overflow-hidden rounded-card border border-white/10 bg-obsidian text-white shadow-soft">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-ember">Event-driven progress</p>
            <h2 className="mt-1 text-base font-semibold">Order Journey</h2>
          </div>
          <span className="rounded-pill border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-pewter">
            {context.events.length} events
          </span>
        </div>
      </div>

      <ol className="px-5 py-5">
        {steps.map((step, i) => (
          <li key={step.key} className="group flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-transform duration-300 group-hover:scale-105 ${ring[step.status]}`}>
                {step.status === 'active' ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : label[step.status].slice(0, 2)}
              </div>
              {i < steps.length - 1 && (
                <div className={`my-1 w-0.5 flex-1 ${step.status === 'done' ? 'bg-emerald-400/60' : step.status === 'failed' ? 'bg-red-400/60' : 'bg-white/10'}`} />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-6 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-semibold ${step.status === 'failed' ? 'text-red-200' : step.status === 'warning' ? 'text-amber-200' : 'text-white'}`}>
                  {step.label}
                </p>
                <span className="rounded-pill bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pewter">
                  {label[step.status]}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-white/65">{step.description}</p>
              <p className="mt-1 font-mono text-[11px] text-ash">{fmtDate(step.time)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
