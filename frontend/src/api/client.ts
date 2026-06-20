export const SERVICES = {
  auth: 'http://localhost:8004',
  catalog: 'http://localhost:8005',
  orders: 'http://localhost:8000',
}

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
