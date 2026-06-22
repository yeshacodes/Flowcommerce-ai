import { apiFetch, SERVICES } from './client'

export interface AuthResponse {
  access_token: string
  token_type: string
  customer_id: string
  is_admin: boolean
}

export const authApi = {
  register: (email: string, password: string, name: string) =>
    apiFetch<AuthResponse>(SERVICES.auth, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }, false),

  login: (email: string, password: string) =>
    apiFetch<AuthResponse>(SERVICES.auth, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false),
}
