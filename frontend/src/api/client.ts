// Service base URLs. Production values come from Vite env vars (set in Vercel);
// localhost fallbacks keep local development working with no config.
export const SERVICES = {
  auth: import.meta.env.VITE_AUTH_URL ?? 'http://localhost:8004',
  catalog: import.meta.env.VITE_CATALOG_URL ?? 'http://localhost:8005',
  orders: import.meta.env.VITE_ORDERS_URL ?? 'http://localhost:8000',
}

// Whether a usable backend is reachable for real auth/API calls.
// - Local dev (served from localhost): true — /login behaves exactly as before.
// - Deployed with VITE_*_URL set to real hosts: true.
// - Deployed (e.g. Vercel) with no backend URLs configured (still localhost):
//   false — the public demo has no backend, so we steer users to Explore Demo.
const _apiIsLocal = /localhost|127\.0\.0\.1/.test(SERVICES.auth)
const _servedFromLocalhost =
  typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
export const backendConfigured = !_apiIsLocal || _servedFromLocalhost

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('fc_user')
    return raw ? JSON.parse(raw).token : null
  } catch {
    return null
  }
}

export async function apiFetch<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}
