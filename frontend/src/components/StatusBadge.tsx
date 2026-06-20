const styles: Record<string, string> = {
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  FAILED:    'bg-red-100 text-red-700',
  PENDING:   'bg-amber-100 text-amber-700',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}
