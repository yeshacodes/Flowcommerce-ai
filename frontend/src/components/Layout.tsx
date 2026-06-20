import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const nav = [
  { to: '/products', label: 'Products', icon: '🛍️' },
  { to: '/orders',   label: 'My Orders', icon: '📦' },
  { to: '/admin',    label: 'Admin',     icon: '⚙️' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-slate-900 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800">
          <span className="text-white font-bold text-lg tracking-tight">FlowCommerce</span>
          <span className="ml-1 text-blue-400 font-bold text-lg">AI</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800">
          <p className="text-xs text-slate-500 truncate mb-2">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
