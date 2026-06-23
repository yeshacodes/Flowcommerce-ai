import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FloatingOrderAssistant from './customer-copilot/FloatingOrderAssistant'

// Customer-facing pages where the floating assistant should appear.
const CUSTOMER_ASSISTANT_PATHS = [/^\/products$/, /^\/checkout$/, /^\/orders$/, /^\/orders\/[^/]+$/]
const showsAssistant = (path: string) => CUSTOMER_ASSISTANT_PATHS.some(re => re.test(path))

const baseNav = [
  { to: '/products', label: 'Products', icon: ProductsIcon },
  { to: '/orders',   label: 'Orders',   icon: OrdersIcon },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const nav = user?.is_admin
    ? [
        ...baseNav,
        { to: '/admin', label: 'Admin', icon: AdminIcon },
        { to: '/operations', label: 'Operations', icon: OperationsIcon },
        { to: '/copilot', label: 'AI Copilot', icon: CopilotIcon },
      ]
    : baseNav

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const initial = (user?.email?.[0] ?? '?').toUpperCase()

  return (
    <div className="flex h-screen bg-snow">
      {/* Sidebar — obsidian stage */}
      <aside className="flex w-64 flex-shrink-0 flex-col bg-obsidian">
        <div className="px-6 py-6">
          <span className="text-[17px] font-bold tracking-tight text-white">FlowCommerce</span>
          <span className="ml-1.5 text-[17px] font-bold text-ember">AI</span>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white/35">
            Commerce Operations
          </p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-tile px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/55 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={isActive ? 'text-ember' : 'text-white/45 group-hover:text-white/80'} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <div className="flex items-center gap-3 rounded-tile px-3 py-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ember text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">{user?.email}</p>
              <p className="text-[11px] text-white/40">{user?.is_admin ? 'Administrator' : 'Member'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-1 w-full rounded-tile px-3 py-2 text-left text-[13px] font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {showsAssistant(location.pathname) && <FloatingOrderAssistant />}
    </div>
  )
}

// ── Thin-stroke UI icons (16–24px), per the system's icon spec ──
type IconProps = { className?: string }

function ProductsIcon({ className = '' }: IconProps) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 7.5 12 12m0 0 8.5-4.5M12 12v9" />
    </svg>
  )
}

function OrdersIcon({ className = '' }: IconProps) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h14a1 1 0 0 1 1 1v15l-3-2-2.5 2L12 20l-2.5 1L7 19l-3 2V5a1 1 0 0 1 1-1Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 9h7M8.5 13h5" />
    </svg>
  )
}

function AdminIcon({ className = '' }: IconProps) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M4 12h16M4 19h16" />
      <circle cx="9" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="8" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function OperationsIcon({ className = '' }: IconProps) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  )
}

function CopilotIcon({ className = '' }: IconProps) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 15.5 18.8 17.5 20.8 18.3 18.8 19.1 18 21 17.2 19.1 15.2 18.3 17.2 17.5 18 15.5Z" />
    </svg>
  )
}
