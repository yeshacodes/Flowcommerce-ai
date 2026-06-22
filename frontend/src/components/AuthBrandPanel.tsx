// Obsidian brand panel shown beside the auth forms. Restrained premium —
// a single ember accent line and quiet feature copy, no neon showroom.
export default function AuthBrandPanel() {
  const points = [
    'Event-driven order pipeline with saga rollback',
    'Real-time Stripe checkout and reconciliation',
    'Live inventory and event-bus health monitoring',
  ]

  return (
    <div className="relative hidden overflow-hidden bg-obsidian lg:flex lg:flex-col lg:justify-between lg:p-14">
      {/* subtle ember glow, not a dramatic gradient */}
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #ff5f34 0%, transparent 70%)' }}
      />
      <div className="pointer-events-none absolute bottom-0 left-0 h-1 w-2/3 bg-ember" />

      <div className="relative">
        <span className="eyebrow text-white/40">Commerce Operations Platform</span>
      </div>

      <div className="relative max-w-md">
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-white">
          Run your storefront like an{' '}
          <span className="text-ember">operations team</span>, not a spreadsheet.
        </h2>
        <ul className="mt-8 space-y-3">
          {points.map(p => (
            <li key={p} className="flex items-start gap-3 text-sm text-white/65">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ember" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative text-[12px] text-white/30">
        © {new Date().getFullYear()} FlowCommerce AI
      </div>
    </div>
  )
}
