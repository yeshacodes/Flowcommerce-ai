const styles: Record<string, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  FAILED:    'bg-ember/10 text-ember-hot ring-ember/30',
  PENDING:   'bg-amber-50 text-amber-700 ring-amber-600/20',
}

const dot: Record<string, string> = {
  CONFIRMED: 'bg-emerald-500',
  FAILED:    'bg-ember',
  PENDING:   'bg-amber-500',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
        styles[status] ?? 'bg-mist text-slate2 ring-pewter/40'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] ?? 'bg-ash'}`} />
      {status}
    </span>
  )
}
