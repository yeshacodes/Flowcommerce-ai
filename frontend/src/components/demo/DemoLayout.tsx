import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import FloatingOrderAssistant from '../customer-copilot/FloatingOrderAssistant'

// Demo customer pages where the floating assistant should appear.
const DEMO_ASSISTANT_PATHS = [/^\/demo\/products$/, /^\/demo\/orders$/, /^\/demo\/orders\/[^/]+$/]
const showsAssistant = (path: string) => DEMO_ASSISTANT_PATHS.some(re => re.test(path))

/**
 * Layout for the public /demo/* experience. Visually mirrors the real app's
 * Layout (obsidian sidebar + light content) but is a separate component: it has
 * no auth, links only to demo routes, and shows a "Demo Mode" badge. The real
 * Layout is untouched.
 */
const demoNav = [
  { to: '/demo/products', label: 'Products' },
  { to: '/demo/orders', label: 'Orders' },
  { to: '/demo/admin', label: 'Admin' },
  { to: '/demo/operations', label: 'Operations' },
  { to: '/demo/copilot', label: 'AI Copilot' },
]

export default function DemoLayout() {
  const location = useLocation()
  return (
    <div className="flex h-screen bg-snow">
      <aside className="flex w-64 flex-shrink-0 flex-col bg-obsidian">
        <div className="px-6 py-6">
          <Link to="/" className="block">
            <span className="text-[17px] font-bold tracking-tight text-white">FlowCommerce</span>
            <span className="ml-1.5 text-[17px] font-bold text-ember">AI</span>
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-pill bg-ember/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ember">
              Demo Mode
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-white/40">Viewing simulated data.</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {demoNav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-tile px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <Link
            to="/"
            className="block rounded-tile px-3 py-2 text-[13px] font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white"
          >
            ← Back to home
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {/* Persistent simulated-data banner so the badge is always visible */}
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-8 py-2 text-xs text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Demo Mode — viewing simulated data. No login or backend required.
        </div>
        <Outlet />
      </main>

      {showsAssistant(location.pathname) && <FloatingOrderAssistant demo />}
    </div>
  )
}
