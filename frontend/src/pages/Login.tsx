import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { backendConfigured } from '../api/client'
import { useAuth } from '../context/AuthContext'
import AuthBrandPanel from '../components/AuthBrandPanel'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(email, password)
      login({ email, customer_id: res.customer_id, token: res.access_token, is_admin: res.is_admin })
      navigate('/products')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form half */}
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-9">
            <div className="mb-8 flex items-center">
              <span className="text-lg font-bold tracking-tight text-obsidian">FlowCommerce</span>
              <span className="ml-1 text-lg font-bold text-ember">AI</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-obsidian">Sign in</h1>
            <p className="mt-1.5 text-sm text-ash">Welcome back to your commerce console.</p>
          </div>

          {!backendConfigured && (
            <div className="mb-5 rounded-input border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">Backend services are not deployed for the public demo.</p>
              <p className="mt-1 text-amber-700">Use Explore Demo instead — it runs on simulated data with no login.</p>
              <Link to="/demo/products" className="btn-primary btn-sm mt-3 inline-flex">Explore Demo →</Link>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-input border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-hot">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-obsidian">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="field"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-obsidian">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="field"
                placeholder="••••••••"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary btn-lg w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ash">
            No account?{' '}
            <Link to="/register" className="font-semibold text-ember hover:text-ember-hot">
              Create one
            </Link>
          </p>
        </div>
      </div>

      <AuthBrandPanel />
    </div>
  )
}
